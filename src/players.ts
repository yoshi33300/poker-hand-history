import { createId } from './id'
import { STREETS } from './types'
import type { Hand, HandAction, Player, Position, Street } from './types'

// Standard position sets per table size, listed in PREFLOP action order (blinds act last).
const POSITION_SETS: Record<number, Position[]> = {
  2: ['SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
}

const PREFLOP_ORDER: Position[] = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
const POSTFLOP_ORDER: Position[] = ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN']

export function positionsFor(count: number): Position[] {
  return POSITION_SETS[Math.min(9, Math.max(2, count))]
}

/** Position label for display — flags the straddler so it isn't mistaken for a plain UTG open. */
export function formatPosition(position: Position, straddle?: number): string {
  return position === 'UTG' && (straddle ?? 0) > 0 ? 'UTG(STR)' : position
}

function defaultHeroPosition(positions: Position[]): Position {
  return positions.includes('BTN') ? 'BTN' : positions[0]
}

export function createDefaultPlayers(count: number, startingStack: number): Player[] {
  const positions = positionsFor(count)
  const hero = defaultHeroPosition(positions)
  return positions.map((position) => ({
    id: createId(),
    position,
    startingStack,
    isHero: position === hero,
  }))
}

// Preserve stack / hero choice by position when the table size changes.
export function resizePlayers(players: Player[], count: number, startingStack: number): Player[] {
  const positions = positionsFor(count)
  const byPosition = new Map(players.map((p) => [p.position, p]))
  const next: Player[] = positions.map((position) => {
    const existing = byPosition.get(position)
    return {
      id: existing?.id ?? createId(),
      position,
      startingStack: existing?.startingStack ?? startingStack,
      isHero: existing?.isHero ?? false,
    }
  })
  if (!next.some((p) => p.isHero)) {
    const hero = defaultHeroPosition(positions)
    for (const p of next) p.isHero = p.position === hero
  }
  return next
}

export function orderForStreet(street: Street, players: Player[], utgStraddled = false): Player[] {
  const order = street === 'preflop' ? PREFLOP_ORDER : POSTFLOP_ORDER
  const sorted = [...players].sort(
    (a, b) => order.indexOf(a.position) - order.indexOf(b.position),
  )
  // Heads-up: SB is the button — acts first preflop but last postflop.
  if (
    street !== 'preflop' &&
    sorted.length === 2 &&
    sorted[0].position === 'SB' &&
    sorted[1].position === 'BB'
  ) {
    return [sorted[1], sorted[0]]
  }
  // A UTG straddle is a live bet posted before cards are dealt — UTG closes the
  // action after the blinds instead of opening it.
  if (street === 'preflop' && utgStraddled) {
    const utgIndex = sorted.findIndex((p) => p.position === 'UTG')
    if (utgIndex !== -1) {
      const [utg] = sorted.splice(utgIndex, 1)
      sorted.push(utg)
    }
  }
  return sorted
}

export type ImplicitStreetEvent =
  | { kind: 'action'; action: HandAction }
  | { kind: 'implicit-check'; playerId: string }
  | { kind: 'implicit-fold'; playerId: string }

/**
 * Replays a street's actions in chronological order and interleaves them
 * with synthetic markers wherever the action order skipped a seat without
 * ever recording anything for them: an implicit check while no bet is out
 * yet (checking around without recording every single check is normal), or
 * an implicit fold once a bet has appeared (silence after a bet means
 * folding — same as an early limper who never gets revisited after a later
 * re-raise). Preflop has no "before any bet" phase — the blinds already are
 * one — so pass `startsWithBet: true` there and every skip is a fold.
 *
 * A simple "highest table-position index that's acted" check breaks once
 * action returns to an earlier seat (e.g. limper re-raised, folds to the
 * 3bet without a recorded action), so this walks a cursor through the
 * seating order action by action instead. All-in players are skipped over
 * without penalty — they simply can't act again, that isn't a fold.
 *
 * `flushAtEnd` additionally resolves anyone left owing a response to the
 * street's last bet/raise once the recorded actions run out — i.e. treats
 * the street as finished rather than still being entered live. Pass `true`
 * when deciding who carries over to the next street or the showdown; pass
 * `false` when replaying action-by-action, where the street may simply not
 * be finished yet and silence after the last-seen action doesn't mean
 * anything (their turn just hasn't come up in the replay yet).
 */
export function withImplicitStreetEvents(
  players: Player[],
  actions: HandAction[],
  street: Street,
  utgStraddled: boolean,
  startsWithBet: boolean,
  flushAtEnd: boolean,
): ImplicitStreetEvent[] {
  const ordered = orderForStreet(street, players, utgStraddled)
  const stillIn = new Set(ordered.map((p) => p.id))
  const allIn = new Set<string>()
  // Players who already produced an event this street (a real action or a
  // synthesized check) — keeps the end-of-street flush from double-counting.
  const covered = new Set<string>()
  const events: ImplicitStreetEvent[] = []
  let cursor = 0 // index in `ordered` of the next seat expected to act
  let betOut = startsWithBet
  let lastAggressorIdx = -1 // seat currently owed a response, if any

  for (const action of actions) {
    const idx = ordered.findIndex((p) => p.id === action.playerId)
    if (idx !== -1) {
      for (let i = cursor; i !== idx; i = (i + 1) % ordered.length) {
        const seat = ordered[i]
        if (stillIn.has(seat.id) && !allIn.has(seat.id)) {
          if (betOut) {
            stillIn.delete(seat.id)
            events.push({ kind: 'implicit-fold', playerId: seat.id })
          } else {
            covered.add(seat.id)
            events.push({ kind: 'implicit-check', playerId: seat.id })
          }
        }
      }
      // A recorded action from a player we'd inferred out proves that
      // inference wrong — the record wins, so put them back and drop the
      // synthetic fold. (An explicit fold is never walked back.)
      if (!stillIn.has(action.playerId) && action.type !== 'fold') {
        const prior = events.findIndex((e) => e.kind === 'implicit-fold' && e.playerId === action.playerId)
        if (prior !== -1) {
          events.splice(prior, 1)
          stillIn.add(action.playerId)
        }
      }
      if (action.type === 'fold') stillIn.delete(action.playerId)
      if (action.type === 'allin') allIn.add(action.playerId)
      if (action.type === 'bet' || action.type === 'raise' || action.type === 'allin') {
        betOut = true
        lastAggressorIdx = idx
      }
      covered.add(action.playerId)
      cursor = (idx + 1) % ordered.length
    } else {
      covered.add(action.playerId)
    }
    events.push({ kind: 'action', action })
  }

  if (flushAtEnd) {
    if (betOut && lastAggressorIdx !== -1) {
      // The street's action list ends with an uncalled bet sitting out —
      // anyone between here and the aggressor (who obviously doesn't owe
      // themselves a response) never answered it, so treat them the same as
      // a mid-street skip.
      for (let i = cursor; i !== lastAggressorIdx; i = (i + 1) % ordered.length) {
        const seat = ordered[i]
        if (stillIn.has(seat.id) && !allIn.has(seat.id)) {
          stillIn.delete(seat.id)
          events.push({ kind: 'implicit-fold', playerId: seat.id })
        }
      }
    } else if (!betOut) {
      // The street checked through: anyone still in with nothing recorded
      // (and not already passed over mid-street) checks behind, in order.
      for (let k = 0; k < ordered.length; k++) {
        const seat = ordered[(cursor + k) % ordered.length]
        if (stillIn.has(seat.id) && !allIn.has(seat.id) && !covered.has(seat.id)) {
          covered.add(seat.id)
          events.push({ kind: 'implicit-check', playerId: seat.id })
        }
      }
    }
  }
  return events
}

/**
 * Players still active after all recorded actions on `hand`, simulating
 * each street's implicit check/fold rule in turn up to and including
 * `throughStreet` (defaults to the whole hand). Used to decide who carries
 * over to the next street and who's still eligible to win the pot.
 */
export function activePlayers(
  hand: Pick<Hand, 'players' | 'stakes' | 'streets'>,
  throughStreet?: Street,
): Player[] {
  const utgStraddled = (hand.stakes.straddle ?? 0) > 0
  let active = hand.players
  const lastIndex = throughStreet ? STREETS.indexOf(throughStreet) : STREETS.length - 1
  for (let i = 0; i <= lastIndex; i++) {
    const street = STREETS[i]
    const events = withImplicitStreetEvents(
      active,
      hand.streets[street].actions,
      street,
      utgStraddled,
      street === 'preflop',
      true,
    )
    const foldedHere = new Set<string>()
    for (const e of events) {
      if (e.kind === 'implicit-fold') foldedHere.add(e.playerId)
      if (e.kind === 'action' && e.action.type === 'fold') foldedHere.add(e.action.playerId)
    }
    active = active.filter((p) => !foldedHere.has(p.id))
  }
  return active
}

// Who most likely acts next on this street, given the actions recorded so far.
// Players who folded during this street are skipped.
export function nextToAct(orderedPlayers: Player[], actions: HandAction[]): string {
  if (orderedPlayers.length === 0) return ''
  const ids = orderedPlayers.map((p) => p.id)
  const folded = new Set(actions.filter((a) => a.type === 'fold').map((a) => a.playerId))
  if (actions.length === 0) {
    return ids.find((id) => !folded.has(id)) ?? ids[0]
  }
  const last = actions[actions.length - 1].playerId
  const start = ids.indexOf(last)
  for (let k = 1; k <= ids.length; k++) {
    const candidate = ids[(start + k) % ids.length]
    if (!folded.has(candidate)) return candidate
  }
  return ids[0]
}
