import { ACTION_LABELS, STREETS, STREET_LABELS } from './types'
import type { ActionType, Hand, HandAction } from './types'
import { formatCard } from './cards'
import { effectiveStack, potBeforeStreet } from './pot'
import { formatPosition, withImplicitPreflopFolds } from './players'
import { formatBB } from './bb'

// Amounts are shown only where they carry information (bet/raise/all-in sizes);
// a call always matches the current bet, so "Call" alone reads fine.
const AMOUNT_SHOWN: ActionType[] = ['bet', 'raise', 'allin']

function positionOf(hand: Hand, playerId: string): string {
  const p = hand.players.find((p) => p.id === playerId)
  return p ? formatPosition(p.position, hand.stakes.straddle) : '?'
}

function describeAction(hand: Hand, a: HandAction): string {
  const amount = AMOUNT_SHOWN.includes(a.type) && a.amount ? ` ${formatBB(a.amount, hand.stakes.bb)}` : ''
  return `${positionOf(hand, a.playerId)} ${ACTION_LABELS[a.type]}${amount}`
}

/** Compact, chat-friendly hand history text. */
export function buildHandText(hand: Hand): string {
  const hero = hand.players.find((p) => p.isHero)
  const heroPos = hero ? formatPosition(hero.position, hand.stakes.straddle) : '?'
  const holeCards = hand.heroHoleCards.map(formatCard).join('')

  const lines: string[] = []
  lines.push(`HERO　${heroPos}　${holeCards}`.trim())
  const eff = effectiveStack(hand)
  const effText = Number.isFinite(eff) ? ` eff ${formatBB(eff, hand.stakes.bb)}` : ''
  const anteText =
    hand.stakes.ante > 0 ? ` (アンティ${hand.stakes.ante}${hand.stakes.anteMode === 'all' ? '・全員' : ''})` : ''
  const straddleText = (hand.stakes.straddle ?? 0) > 0 ? ` UTGストラドル${hand.stakes.straddle}` : ''
  lines.push(
    `${hand.stakes.currency}${hand.stakes.sb}/${hand.stakes.currency}${hand.stakes.bb}${anteText}${straddleText}　${hand.gameType}${effText}`,
  )
  lines.push('')

  // Preflop is expanded with synthetic fold lines for anyone the action
  // order silently skipped (e.g. a limper who never gets revisited after a
  // later re-raise) — otherwise a raise they made earlier would look like
  // they were still live. Folds from players who did nothing else are noise
  // and dropped — everyone not mentioned obviously folded outright.
  const utgStraddled = (hand.stakes.straddle ?? 0) > 0
  const preflopEvents = withImplicitPreflopFolds(hand.players, hand.streets.preflop.actions, utgStraddled)
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

  for (const street of STREETS) {
    const data = hand.streets[street]
    const streetLines =
      street === 'preflop'
        ? visiblePreflopEvents.map((ev) =>
            ev.kind === 'action'
              ? describeAction(hand, ev.action)
              : `${positionOf(hand, ev.playerId)} ${ACTION_LABELS.fold}`,
          )
        : data.actions.map((a) => describeAction(hand, a))
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
