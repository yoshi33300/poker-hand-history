import type { CardCode, Rank, Suit } from './types'

export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

// 4-color deck (online-poker standard): spades black, hearts red, diamonds blue, clubs green
export const SUITS: { code: Suit; symbol: string; color: 'black' | 'red' | 'blue' | 'green'; label: string }[] = [
  { code: 's', symbol: '♠', color: 'black', label: 'スペード' },
  { code: 'h', symbol: '♥', color: 'red', label: 'ハート' },
  { code: 'd', symbol: '♦', color: 'blue', label: 'ダイヤ' },
  { code: 'c', symbol: '♣', color: 'green', label: 'クラブ' },
]

export function suitInfo(suit: Suit) {
  return SUITS.find((s) => s.code === suit)!
}

export function parseCard(code: CardCode): { rank: Rank; suit: Suit } {
  return { rank: code[0] as Rank, suit: code[1] as Suit }
}

export function makeCard(rank: Rank, suit: Suit): CardCode {
  return `${rank}${suit}`
}

// "As" -> "A♠" for logs and auto-generated titles
export function formatCard(code: CardCode): string {
  const { rank, suit } = parseCard(code)
  return `${rank}${suitInfo(suit).symbol}`
}
