export type Suit = 's' | 'h' | 'd' | 'c'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

// Card code, e.g. "As", "Td", "9h"
export type CardCode = string

export type Position =
  | 'UTG'
  | 'UTG+1'
  | 'UTG+2'
  | 'MP'
  | 'LJ'
  | 'HJ'
  | 'CO'
  | 'BTN'
  | 'SB'
  | 'BB'

export type GameType = 'NLH' | 'PLO'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type ActionType =
  | 'post-sb'
  | 'post-bb'
  | 'post-ante'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'allin'

export interface Player {
  id: string
  position: Position
  startingStack: number
  isHero: boolean
  // Legacy fields kept for hands saved by older versions
  name?: string
  seat?: number
}

export interface HandAction {
  id: string
  playerId: string
  type: ActionType
  amount?: number
}

export interface StreetData {
  board: CardCode[]
  actions: HandAction[]
}

export interface Hand {
  id: string
  createdAt: number
  title: string
  gameType: GameType
  stakes: {
    sb: number
    bb: number
    ante: number
    currency: string
  }
  players: Player[]
  heroHoleCards: CardCode[]
  streets: {
    preflop: StreetData
    flop: StreetData
    turn: StreetData
    river: StreetData
  }
  result: {
    netAmount: number
    notes: string
  }
}

export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

export const ACTION_LABELS: Record<ActionType, string> = {
  'post-sb': 'SBポスト',
  'post-bb': 'BBポスト',
  'post-ante': 'アンティ',
  fold: 'フォールド',
  check: 'チェック',
  call: 'コール',
  bet: 'ベット',
  raise: 'レイズ',
  allin: 'オールイン',
}

export const STREET_LABELS: Record<Street, string> = {
  preflop: 'プリフロップ',
  flop: 'フロップ',
  turn: 'ターン',
  river: 'リバー',
}
