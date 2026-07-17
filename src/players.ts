import { createId } from './id'
import type { HandAction, Player, Position, Street } from './types'

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

export type PreflopFoldEvent =
  | { kind: 'action'; action: HandAction }
  | { kind: 'implicit-fold'; playerId: string }

/**
 * Replays preflop actions in chronological order and interleaves them with
 * synthetic "implicit fold" markers wherever the action order skipped a
 * seat without ever recording a fold for them — e.g. an early limper who
 * never gets revisited after a later re-raise. A simple "highest
 * table-position index that's acted" check breaks once action returns to an
 * earlier seat (limper re-raised, folds to the 3bet without a recorded
 * action), so this walks a cursor through the seating order action by
 * action instead. All-in players are skipped over without penalty — they
 * simply can't act again, that isn't a fold.
 */
export function withImplicitPreflopFolds(
  players: Player[],
  actions: HandAction[],
  utgStraddled: boolean,
): PreflopFoldEvent[] {
  const ordered = orderForStreet('preflop', players, utgStraddled)
  const stillIn = new Set(ordered.map((p) => p.id))
  const allIn = new Set<string>()
  const events: PreflopFoldEvent[] = []
  let cursor = 0 // index in `ordered` of the next seat expected to act

  for (const action of actions) {
    const idx = ordered.findIndex((p) => p.id === action.playerId)
    if (idx !== -1) {
      for (let i = cursor; i !== idx; i = (i + 1) % ordered.length) {
        const seat = ordered[i]
        if (stillIn.has(seat.id) && !allIn.has(seat.id)) {
          stillIn.delete(seat.id)
          events.push({ kind: 'implicit-fold', playerId: seat.id })
        }
      }
      if (action.type === 'fold') stillIn.delete(action.playerId)
      if (action.type === 'allin') allIn.add(action.playerId)
      cursor = (idx + 1) % ordered.length
    }
    events.push({ kind: 'action', action })
  }
  return events
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
