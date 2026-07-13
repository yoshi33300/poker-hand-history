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
