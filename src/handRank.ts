import { parseCard } from './cards'
import type { CardCode } from './types'

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
}

const HAND_CATEGORY_LABELS = [
  'ハイカード',
  'ワンペア',
  'ツーペア',
  'スリーカード',
  'ストレート',
  'フラッシュ',
  'フルハウス',
  'フォーカード',
  'ストレートフラッシュ',
]

interface HandScore {
  /** [category, tiebreakers...] — higher is better, compared lexicographically. */
  value: number[]
  label: string
}

function compareScore(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function evaluate5(cards: { rank: number; suit: string }[]): HandScore {
  const ranksDesc = cards.map((c) => c.rank).sort((a, b) => b - a)
  const isFlush = cards.every((c) => c.suit === cards[0].suit)

  const counts = new Map<number, number>()
  for (const r of ranksDesc) counts.set(r, (counts.get(r) ?? 0) + 1)
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)

  const uniqueDesc = [...new Set(ranksDesc)]
  let straightHigh = 0
  for (let i = 0; i <= uniqueDesc.length - 5; i++) {
    if (uniqueDesc[i] - uniqueDesc[i + 4] === 4) {
      straightHigh = uniqueDesc[i]
      break
    }
  }
  // Wheel: A-2-3-4-5 plays as a 5-high straight.
  if (!straightHigh && uniqueDesc.includes(14) && [5, 4, 3, 2].every((v) => uniqueDesc.includes(v))) {
    straightHigh = 5
  }
  const isStraight = straightHigh > 0

  if (isStraight && isFlush) {
    return { value: [8, straightHigh], label: straightHigh === 14 ? 'ロイヤルフラッシュ' : HAND_CATEGORY_LABELS[8] }
  }
  if (groups[0].count === 4) {
    return { value: [7, groups[0].rank, groups[1].rank], label: HAND_CATEGORY_LABELS[7] }
  }
  if (groups[0].count === 3 && groups[1].count >= 2) {
    return { value: [6, groups[0].rank, groups[1].rank], label: HAND_CATEGORY_LABELS[6] }
  }
  if (isFlush) {
    return { value: [5, ...ranksDesc], label: HAND_CATEGORY_LABELS[5] }
  }
  if (isStraight) {
    return { value: [4, straightHigh], label: HAND_CATEGORY_LABELS[4] }
  }
  if (groups[0].count === 3) {
    return { value: [3, groups[0].rank, ...groups.slice(1).map((g) => g.rank)], label: HAND_CATEGORY_LABELS[3] }
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const [hiPair, loPair] = [groups[0].rank, groups[1].rank].sort((a, b) => b - a)
    return { value: [2, hiPair, loPair, groups[2].rank], label: HAND_CATEGORY_LABELS[2] }
  }
  if (groups[0].count === 2) {
    return { value: [1, groups[0].rank, ...groups.slice(1).map((g) => g.rank)], label: HAND_CATEGORY_LABELS[1] }
  }
  return { value: [0, ...ranksDesc], label: HAND_CATEGORY_LABELS[0] }
}

/** Best possible 5-card hand out of up to 7 cards (2 hole + up to 5 board). */
function bestHand(cardCodes: CardCode[]): HandScore {
  const cards = cardCodes.map((c) => {
    const { rank, suit } = parseCard(c)
    return { rank: RANK_VALUES[rank], suit }
  })
  if (cards.length < 5) throw new Error('bestHand requires at least 5 cards')

  let best: HandScore | null = null
  function combine(start: number, chosen: number[]) {
    if (chosen.length === 5) {
      const score = evaluate5(chosen.map((i) => cards[i]))
      if (!best || compareScore(score.value, best.value) > 0) best = score
      return
    }
    for (let i = start; i < cards.length; i++) combine(i + 1, [...chosen, i])
  }
  combine(0, [])
  return best!
}

export interface ShowdownResult {
  winnerIds: string[]
  label: string
}

/** Compares each player's best hand (hole cards + board) and returns the winner(s), chopping ties. */
export function determineShowdownWinners(
  board: CardCode[],
  players: { id: string; holeCards: CardCode[] }[],
): ShowdownResult {
  const scored = players.map((p) => ({ id: p.id, score: bestHand([...p.holeCards, ...board]) }))
  let best = scored[0]
  for (const s of scored.slice(1)) {
    if (compareScore(s.score.value, best.score.value) > 0) best = s
  }
  const winners = scored.filter((s) => compareScore(s.score.value, best.score.value) === 0)
  return { winnerIds: winners.map((w) => w.id), label: best.score.label }
}
