import { STREETS } from './types'
import type { Hand, Player, Street, StreetData } from './types'

/**
 * Betting model: an action's `amount` is the TOTAL a player has committed on
 * that street after the action (poker's standard "raise to X" convention),
 * not an incremental top-up. Blinds/antes are seeded as each player's
 * starting amount for preflop before any action is recorded, so a BB who
 * calls a raise to 6 simply enters "6" — the blind is already included.
 */

export interface StreetContribution {
  /** Each player's total chips committed on this street. */
  perPlayer: Record<string, number>
  /** Sum of perPlayer. */
  total: number
}

export function blindBaseline(player: Player, stakes: Hand['stakes']): number {
  let base = stakes.ante ?? 0
  if (player.position === 'SB') base += stakes.sb
  if (player.position === 'BB') base += stakes.bb
  return base
}

export function streetContribution(
  street: Street,
  data: StreetData,
  players: Player[],
  stakes: Hand['stakes'],
): StreetContribution {
  const perPlayer: Record<string, number> = {}
  if (street === 'preflop') {
    for (const p of players) {
      const base = blindBaseline(p, stakes)
      if (base > 0) perPlayer[p.id] = base
    }
  }
  for (const action of data.actions) {
    if (action.amount !== undefined) {
      perPlayer[action.playerId] = action.amount
    }
  }
  const total = Object.values(perPlayer).reduce((a, b) => a + b, 0)
  return { perPlayer, total }
}

/** The amount a player must reach to call the current street's action. */
export function currentBetTo(contribution: StreetContribution): number {
  const values = Object.values(contribution.perPlayer)
  return values.length > 0 ? Math.max(...values) : 0
}

/** Pot carried into `street` from all earlier streets (blinds + prior bets). */
export function potBeforeStreet(hand: Pick<Hand, 'players' | 'stakes' | 'streets'>, street: Street): number {
  const idx = STREETS.indexOf(street)
  let pot = 0
  for (let i = 0; i < idx; i++) {
    pot += streetContribution(STREETS[i], hand.streets[STREETS[i]], hand.players, hand.stakes).total
  }
  return pot
}

/** Total pot size at the end of the hand (sum of every street's contributions). */
export function totalPot(hand: Pick<Hand, 'players' | 'stakes' | 'streets'>): number {
  let pot = 0
  for (const street of STREETS) {
    pot += streetContribution(street, hand.streets[street], hand.players, hand.stakes).total
  }
  return pot
}

/** A player's remaining stack at the start of `street` (before this street's own actions). */
export function stackBeforeStreet(
  hand: Pick<Hand, 'players' | 'stakes' | 'streets'>,
  street: Street,
  playerId: string,
): number {
  const player = hand.players.find((p) => p.id === playerId)
  if (!player) return 0
  const idx = STREETS.indexOf(street)
  let spent = 0
  for (let i = 0; i < idx; i++) {
    spent += streetContribution(STREETS[i], hand.streets[STREETS[i]], hand.players, hand.stakes).perPlayer[playerId] ?? 0
  }
  return player.startingStack - spent
}
