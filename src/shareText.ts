import { STREETS, STREET_LABELS } from './types'
import type { ActionType, Hand, HandAction } from './types'
import { formatCard } from './cards'
import { effectiveStack, potBeforeStreet } from './pot'
import { formatBB } from './bb'

// Poker shorthand: r = raise, b = bet, c = call, x = check, f = fold, ai = all-in.
const ACTION_SHORT: Record<ActionType, string> = {
  fold: 'f',
  check: 'x',
  call: 'c',
  bet: 'b',
  raise: 'r',
  allin: 'ai',
  'post-sb': 'sb',
  'post-bb': 'bb',
  'post-ante': 'ante',
  'post-straddle': 'straddle',
}

// Amounts are shown only where they carry information (bet/raise/all-in sizes);
// a call always matches the current bet, so "c" alone reads fine.
const AMOUNT_SHOWN: ActionType[] = ['bet', 'raise', 'allin', 'post-straddle']

function positionOf(hand: Hand, playerId: string): string {
  return hand.players.find((p) => p.id === playerId)?.position ?? '?'
}

function shortAction(hand: Hand, a: HandAction): string {
  const amount = AMOUNT_SHOWN.includes(a.type) && a.amount ? a.amount : ''
  return `${positionOf(hand, a.playerId)} ${ACTION_SHORT[a.type]}${amount}`
}

/** Compact, chat-friendly hand history text. */
export function buildHandText(hand: Hand): string {
  const hero = hand.players.find((p) => p.isHero)
  const heroPos = hero?.position ?? '?'
  const holeCards = hand.heroHoleCards.map(formatCard).join('')

  const lines: string[] = []
  lines.push(`HERO　${heroPos}　${holeCards}`.trim())
  const eff = effectiveStack(hand)
  const effText = Number.isFinite(eff) ? ` eff ${formatBB(eff, hand.stakes.bb)}` : ''
  const anteText =
    hand.stakes.ante > 0 ? ` (アンティ${hand.stakes.ante}${hand.stakes.anteMode === 'all' ? '・全員' : ''})` : ''
  lines.push(
    `${hand.stakes.currency}${hand.stakes.sb}/${hand.stakes.currency}${hand.stakes.bb}${anteText}　${hand.gameType}${effText}`,
  )
  lines.push('')

  // Preflop folds from players who did nothing else are noise — everyone who
  // isn't mentioned obviously folded. Folds after a raise etc. stay visible.
  const preflopActionCount = new Map<string, number>()
  for (const a of hand.streets.preflop.actions) {
    preflopActionCount.set(a.playerId, (preflopActionCount.get(a.playerId) ?? 0) + 1)
  }

  for (const street of STREETS) {
    const data = hand.streets[street]
    const actions =
      street === 'preflop'
        ? data.actions.filter(
            (a) => !(a.type === 'fold' && (preflopActionCount.get(a.playerId) ?? 0) === 1),
          )
        : data.actions
    if (actions.length === 0 && data.board.length === 0) continue
    const boardText = data.board.length > 0 ? ` ${data.board.map(formatCard).join('')}` : ''
    const potText = street !== 'preflop' ? ` (pot${potBeforeStreet(hand, street)})` : ''
    lines.push(`${STREET_LABELS[street]}${boardText}${potText}`)
    for (const a of actions) {
      lines.push(shortAction(hand, a))
    }
    lines.push('')
  }

  const winners = hand.result.winnerIds ?? []
  if (winners.length > 0) {
    const net = hand.result.netAmount
    const sign = net > 0 ? '+' : ''
    lines.push(
      `勝者: ${winners.map((id) => positionOf(hand, id)).join(', ')} / HERO ${sign}${net}${hand.stakes.currency} (${sign}${formatBB(net, hand.stakes.bb)})`,
    )
    lines.push('')
  }

  if (hand.result.notes) {
    lines.push(`メモ: ${hand.result.notes}`)
  }

  return lines.join('\n')
}
