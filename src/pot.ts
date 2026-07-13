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

// Ante is posted entirely by the BB (the "big blind ante" format), not by every player.
export function blindBaseline(player: Player, stakes: Hand['stakes']): number {
  if (player.position === 'SB') return stakes.sb
  if (player.position === 'BB') return stakes.bb + (stakes.ante ?? 0)
  return 0
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

/** Preflop pot-type label from the number of raises before the flop: SRP, 3BP, 4BP, 5BP... */
export function preflopPotType(hand: Pick<Hand, 'players' | 'stakes' | 'streets'>): string {
  let currentMax = 0
  for (const p of hand.players) currentMax = Math.max(currentMax, blindBaseline(p, hand.stakes))
  let raises = 0
  for (const action of hand.streets.preflop.actions) {
    if (action.amount !== undefined && action.amount > currentMax) {
      raises++
      currentMax = action.amount
    }
  }
  if (raises === 0) return ''
  if (raises === 1) return 'SRP'
  return `${raises + 1}BP`
}

/**
 * Effective stack: the smallest starting stack among players still in the
 * hand at the end (i.e. never folded) — the most either side could actually
 * win or lose. Falls back to hero's stack alone if everyone else folded.
 */
export function effectiveStack(hand: Pick<Hand, 'players' | 'streets'>): number {
  const folded = new Set<string>()
  for (const street of STREETS) {
    for (const a of hand.streets[street].actions) {
      if (a.type === 'fold') folded.add(a.playerId)
    }
  }
  const remaining = hand.players.filter((p) => !folded.has(p.id))
  const pool = remaining.length > 0 ? remaining : hand.players
  return pool.reduce((min, p) => Math.min(min, p.startingStack), Infinity)
}

/** Total chips a player committed across the whole hand (blinds included). */
export function totalContribution(
  hand: Pick<Hand, 'players' | 'stakes' | 'streets'>,
  playerId: string,
): number {
  let total = 0
  for (const street of STREETS) {
    total += streetContribution(street, hand.streets[street], hand.players, hand.stakes).perPlayer[playerId] ?? 0
  }
  return total
}

/**
 * Players eligible to win the pot: joined the action (or posted a blind, so a
 * walk still has its winner) and never folded.
 */
export function survivors(hand: Pick<Hand, 'players' | 'streets'>): Player[] {
  const acted = new Set<string>()
  const folded = new Set<string>()
  for (const street of STREETS) {
    for (const a of hand.streets[street].actions) {
      acted.add(a.playerId)
      if (a.type === 'fold') folded.add(a.playerId)
    }
  }
  return hand.players.filter(
    (p) => !folded.has(p.id) && (acted.has(p.id) || p.position === 'SB' || p.position === 'BB'),
  )
}

/**
 * Hero's net result once the winners are known. A sole winner's gain from each
 * opponent is capped at hero's own total contribution, so short-stack all-in
 * wins stay correct without full side-pot bookkeeping. A chop splits the whole
 * pot evenly, which assumes the winners were equally invested (the usual case).
 */
export function heroNetAmount(
  hand: Pick<Hand, 'players' | 'stakes' | 'streets'>,
  winnerIds: string[],
): number {
  const hero = hand.players.find((p) => p.isHero)
  if (!hero) return 0
  const round2 = (v: number) => Math.round(v * 100) / 100
  const heroPut = totalContribution(hand, hero.id)
  if (winnerIds.length === 0) {
    // No winner recorded: a fold still costs what hero put in; otherwise stay neutral.
    const heroFolded = STREETS.some((s) =>
      hand.streets[s].actions.some((a) => a.playerId === hero.id && a.type === 'fold'),
    )
    return heroFolded ? -round2(heroPut) : 0
  }
  if (!winnerIds.includes(hero.id)) return -round2(heroPut)
  if (winnerIds.length === 1) {
    let won = 0
    for (const p of hand.players) {
      if (p.id !== hero.id) won += Math.min(totalContribution(hand, p.id), heroPut)
    }
    return round2(won)
  }
  return round2(totalPot(hand) / winnerIds.length - heroPut)
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
