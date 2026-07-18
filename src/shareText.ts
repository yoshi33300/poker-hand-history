import { ACTION_LABELS, STREETS, STREET_LABELS } from './types'
import type { ActionType, Hand, HandAction, Street } from './types'
import { formatCard } from './cards'
import { effectiveStack, potBeforeStreet } from './pot'
import { activePlayers, formatPosition, withImplicitStreetEvents } from './players'
import type { ImplicitStreetEvent } from './players'
import { formatBB } from './bb'

function isNotImplicitCheck(
  ev: ImplicitStreetEvent,
): ev is Exclude<ImplicitStreetEvent, { kind: 'implicit-check' }> {
  return ev.kind !== 'implicit-check'
}

// Amounts are shown only where they carry information (bet/raise/all-in sizes);
// a call always matches the current bet, so "Call" alone reads fine.
const AMOUNT_SHOWN: ActionType[] = ['bet', 'raise', 'allin']

function positionOf(hand: Hand, playerId: string): string {
  const p = hand.players.find((p) => p.id === playerId)
  return p ? formatPosition(p.position, hand.stakes.straddle) : '?'
}

// Chat apps render pasted text in proportional fonts, so real column
// alignment is impossible — approximate it instead. Narrow glyphs (I, J,
// parentheses) count as half a letter, and each missing width unit versus
// the widest label at the table is padded with two half-width spaces
// (roughly one uppercase letter in common UI fonts).
function labelWidthUnits(label: string): number {
  let units = 0
  for (const ch of label) units += 'IJij()'.includes(ch) ? 0.5 : 1
  return units
}

function maxPositionUnits(hand: Hand): number {
  return Math.max(...hand.players.map((p) => labelWidthUnits(formatPosition(p.position, hand.stakes.straddle))))
}

function paddedPosition(hand: Hand, playerId: string, maxUnits: number): string {
  const label = positionOf(hand, playerId)
  const pad = Math.max(0, Math.round((maxUnits - labelWidthUnits(label)) * 2))
  return label + ' '.repeat(pad)
}

// A known opponent hand is noted once, at the end of that player's last
// action in the whole hand (whether that's a real action or an implicit
// fold) — not repeated on every earlier line of theirs.
function cardsSuffix(hand: Hand, playerId: string): string {
  const cards = hand.villainCards?.[playerId]
  return cards && cards.length > 0 ? ` (${cards.map(formatCard).join('')})` : ''
}

type ShareEntry = { street: Street; playerId: string } & (
  | { kind: 'action'; action: HandAction }
  | { kind: 'implicit-fold' }
)

function renderEntry(hand: Hand, entry: ShareEntry, maxUnits: number, showCards: boolean): string {
  const pos = paddedPosition(hand, entry.playerId, maxUnits)
  const cards = showCards ? cardsSuffix(hand, entry.playerId) : ''
  if (entry.kind === 'implicit-fold') {
    return `${pos}　${ACTION_LABELS.fold}${cards}`
  }
  const amount =
    AMOUNT_SHOWN.includes(entry.action.type) && entry.action.amount
      ? ` ${formatBB(entry.action.amount, hand.stakes.bb)}`
      : ''
  return `${pos}　${ACTION_LABELS[entry.action.type]}${amount}${cards}`
}

/** Compact, chat-friendly hand history text. */
export function buildHandText(hand: Hand): string {
  const hero = hand.players.find((p) => p.isHero)
  const heroPos = hero ? formatPosition(hero.position, hand.stakes.straddle) : '?'
  const holeCards = hand.heroHoleCards.map(formatCard).join('')

  const lines: string[] = []
  const eff = effectiveStack(hand)
  const effText = Number.isFinite(eff) ? ` eff ${formatBB(eff, hand.stakes.bb)}` : ''
  const anteText =
    hand.stakes.ante > 0 ? ` (アンティ${hand.stakes.ante}${hand.stakes.anteMode === 'all' ? '・全員' : ''})` : ''
  const straddleText = (hand.stakes.straddle ?? 0) > 0 ? ` UTGストラドル${hand.stakes.straddle}` : ''
  lines.push(
    `${hand.stakes.currency}${hand.stakes.sb}/${hand.stakes.currency}${hand.stakes.bb}${anteText}${straddleText}　${hand.gameType}${effText}`,
  )
  lines.push(`HERO　${heroPos}　${holeCards}`.trim())
  lines.push('')

  // Every street is expanded with synthetic fold lines for anyone the action
  // order silently skipped: preflop always requires responding to the
  // blinds, so a skip there is always a fold; postflop, a skip only counts
  // as a fold once a bet is actually out (checking around without every
  // check recorded is normal and stays silent). Preflop folds from players
  // who did nothing else are noise and dropped — everyone not mentioned
  // obviously folded outright; a postflop implicit fold is always shown,
  // since that player already mattered enough to survive preflop.
  const utgStraddled = (hand.stakes.straddle ?? 0) > 0
  // Preflop always starts with a bet (the blinds), so this never actually
  // produces an implicit-check event — filtered out only to satisfy the type.
  const preflopEvents = withImplicitStreetEvents(
    hand.players,
    hand.streets.preflop.actions,
    'preflop',
    utgStraddled,
    true,
    true,
  ).filter(isNotImplicitCheck)
  const preflopEventCount = new Map<string, number>()
  for (const ev of preflopEvents) {
    const pid = ev.kind === 'action' ? ev.action.playerId : ev.playerId
    preflopEventCount.set(pid, (preflopEventCount.get(pid) ?? 0) + 1)
  }
  const visiblePreflopEvents = preflopEvents.filter((ev) => {
    const pid = ev.kind === 'action' ? ev.action.playerId : ev.playerId
    const isFold = ev.kind === 'implicit-fold' || ev.action.type === 'fold'
    return !(isFold && (preflopEventCount.get(pid) ?? 0) === 1)
  })

  // Flatten every visible event, across every street, into one hand-wide
  // sequence so a known opponent hand can be pinned to that player's very
  // last appearance, wherever in the hand that ends up being.
  const entries: ShareEntry[] = [
    ...visiblePreflopEvents.map((ev): ShareEntry =>
      ev.kind === 'action'
        ? { street: 'preflop', playerId: ev.action.playerId, kind: 'action', action: ev.action }
        : { street: 'preflop', playerId: ev.playerId, kind: 'implicit-fold' },
    ),
    ...(['flop', 'turn', 'river'] as const).flatMap((street) => {
      const activeThisStreet = activePlayers(hand, STREETS[STREETS.indexOf(street) - 1])
      return withImplicitStreetEvents(activeThisStreet, hand.streets[street].actions, street, utgStraddled, false, true)
        .filter(isNotImplicitCheck)
        .map((ev): ShareEntry =>
          ev.kind === 'action'
            ? { street, playerId: ev.action.playerId, kind: 'action', action: ev.action }
            : { street, playerId: ev.playerId, kind: 'implicit-fold' },
        )
    }),
  ]
  const lastEntryIndexByPlayer = new Map<string, number>()
  entries.forEach((e, i) => lastEntryIndexByPlayer.set(e.playerId, i))

  const maxUnits = maxPositionUnits(hand)
  for (const street of STREETS) {
    const data = hand.streets[street]
    const streetLines = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.street === street)
      .map(({ e, i }) => renderEntry(hand, e, maxUnits, lastEntryIndexByPlayer.get(e.playerId) === i))
    if (streetLines.length === 0 && data.board.length === 0) continue
    const boardText = data.board.length > 0 ? ` ${data.board.map(formatCard).join('')}` : ''
    const potChips = potBeforeStreet(hand, street)
    const potText = street !== 'preflop' ? ` (pot ${formatBB(potChips, hand.stakes.bb)})` : ''
    lines.push(`${STREET_LABELS[street]}${boardText}${potText}`)
    lines.push(...streetLines)
    lines.push('')
  }

  const winners = hand.result.winnerIds ?? []
  if (winners.length > 0) {
    const net = hand.result.netAmount
    const sign = net > 0 ? '+' : ''
    lines.push(
      `勝者: ${winners.map((id) => positionOf(hand, id)).join(', ')} / ${sign}${formatBB(net, hand.stakes.bb)}`,
    )
    lines.push('')
  }

  if (hand.result.notes) {
    lines.push(`メモ: ${hand.result.notes}`)
  }

  return lines.join('\n')
}
