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

// Default format is "big blind ante" (BB posts everyone's ante); anteMode 'all'
// switches to the traditional format where every player antes individually.
// A UTG straddle is a live bet posted blind before cards are dealt, same as SB/BB.
export function blindBaseline(player: Player, stakes: Hand['stakes']): number {
  const ante = stakes.ante ?? 0
  const straddle = stakes.straddle ?? 0
  if (stakes.anteMode === 'all' && ante > 0) {
    if (player.position === 'SB') return stakes.sb + ante
    if (player.position === 'BB') return stakes.bb + ante
    if (player.position === 'UTG' && straddle > 0) return straddle + ante
    return ante
  }
  if (player.position === 'SB') return stakes.sb
  if (player.position === 'BB') return stakes.bb + ante
  if (player.position === 'UTG' && straddle > 0) return straddle
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

/**
 * Whether the betting round for this street is closed: every live player has
 * either folded, gone all-in, or matched the current bet since the last raise.
 */
export function isStreetComplete(
  street: Street,
  data: StreetData,
  players: Player[],
  stakes: Hand['stakes'],
): boolean {
  const folded = new Set(data.actions.filter((a) => a.type === 'fold').map((a) => a.playerId))
  const live = players.filter((p) => !folded.has(p.id))
  if (live.length <= 1) return true

  // Once all-in, a player can't act again — they never (re)join needsToAct below.
  const allIn = new Set(data.actions.filter((a) => a.type === 'allin').map((a) => a.playerId))
  const canAct = live.map((p) => p.id).filter((id) => !allIn.has(id))
  if (canAct.length === 0) return true

  let currentBet = street === 'preflop' ? players.reduce((m, p) => Math.max(m, blindBaseline(p, stakes)), 0) : 0
  const needsToAct = new Set(canAct)

  for (const a of data.actions) {
    if (a.amount !== undefined && a.amount > currentBet) {
      // A raise reopens the action for everyone still able to act, except the raiser.
      currentBet = a.amount
      needsToAct.clear()
      for (const id of canAct) needsToAct.add(id)
      needsToAct.delete(a.playerId)
    } else {
      needsToAct.delete(a.playerId)
    }
  }
  return needsToAct.size === 0
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
 * Whether a player's contribution on `street` matches (or exceeds) that
 * street's final bet — i.e. they called/raised to it — or they're all-in for
 * less. A stale contribution from *before* a later raise doesn't count: only
 * their most recent standing (which streetContribution already reflects)
 * matters, so someone who acted once but never answered a subsequent raise
 * reads the same as someone who never acted at all.
 */
function respondedToBet(
  street: Street,
  data: StreetData,
  players: Player[],
  stakes: Hand['stakes'],
  playerId: string,
): boolean {
  const contribution = streetContribution(street, data, players, stakes)
  const betTo = currentBetTo(contribution)
  const mine = contribution.perPlayer[playerId] ?? 0
  if (mine >= betTo) return true
  return data.actions.some((a) => a.playerId === playerId && a.type === 'allin')
}

/**
 * Whether a player carried over from preflop into the rest of the hand: they
 * matched the final preflop bet, or are all-in. Preflop is always finished
 * by the time this is asked (it's only ever used to decide postflop
 * membership), so no recorded action for a player means they folded — no
 * benefit of the doubt for silence.
 */
export function matchedPreflopBet(
  hand: Pick<Hand, 'players' | 'stakes' | 'streets'>,
  playerId: string,
): boolean {
  return respondedToBet('preflop', hand.streets.preflop, hand.players, hand.stakes, playerId)
}

/**
 * Players eligible to win the pot: never folded, and matched the final
 * preflop bet (or went all-in) — anyone silent all preflop never called in.
 */
export function survivors(hand: Pick<Hand, 'players' | 'stakes' | 'streets'>): Player[] {
  const folded = new Set<string>()
  for (const street of STREETS) {
    for (const a of hand.streets[street].actions) {
      if (a.type === 'fold') folded.add(a.playerId)
    }
  }
  return hand.players.filter((p) => !folded.has(p.id) && matchedPreflopBet(hand, p.id))
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
