import { useEffect, useState } from 'react'
import { resizePlayers } from '../players'
import { formatBB } from '../bb'
import type { Player } from '../types'
import WheelPicker from './WheelPicker'

interface PositionsEditorProps {
  players: Player[]
  onChange: (players: Player[]) => void
  defaultStack: number
  bb: number
}

/** Matches the mobile CSS breakpoint; drives the drum-roll picker UX. */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 620px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 620px)')
    const listener = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])
  return narrow
}

export default function PositionsEditor({ players, onChange, defaultStack, bb }: PositionsEditorProps) {
  const isNarrow = useIsNarrow()
  // Which stack the drum-roll picker is editing: every seat at once, or one player.
  const [picker, setPicker] = useState<{ kind: 'all' } | { kind: 'one'; id: string } | null>(null)

  function updateStack(id: string, startingStack: number) {
    onChange(players.map((p) => (p.id === id ? { ...p, startingStack } : p)))
  }

  function setHero(id: string) {
    onChange(players.map((p) => ({ ...p, isHero: p.id === id })))
  }

  function changeCount(count: number) {
    onChange(resizePlayers(players, count, defaultStack))
  }

  function setAllStacks(stack: number) {
    onChange(players.map((p) => ({ ...p, startingStack: stack })))
  }

  // Scroll up/down over a stack input to nudge it by one step, like a spinner.
  function handleStackWheel(e: React.WheelEvent<HTMLInputElement>, current: number, onSet: (next: number) => void) {
    e.preventDefault()
    const step = 10
    onSet(Math.max(0, current + (e.deltaY < 0 ? step : -step)))
  }

  // The "all stacks" field shows the shared value, or blank when stacks differ.
  const commonStack = players.every((p) => p.startingStack === players[0]?.startingStack)
    ? players[0]?.startingStack ?? defaultStack
    : null

  const pickerMax = Math.max(2000, bb * 500)
  const pickerTarget =
    picker?.kind === 'one' ? players.find((p) => p.id === picker.id) : null

  return (
    <div className="positions-editor">
      <div className="field-row">
        <label>
          人数
          <select value={players.length} onChange={(e) => changeCount(Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n}人
              </option>
            ))}
          </select>
        </label>
        <label>
          全員のスタック
          <input
            className="stack-input"
            type="number"
            min={0}
            step={10}
            value={commonStack ?? ''}
            readOnly={isNarrow}
            onClick={() => {
              if (isNarrow) setPicker({ kind: 'all' })
            }}
            onChange={(e) => setAllStacks(Number(e.target.value))}
            onWheel={(e) =>
              handleStackWheel(e, commonStack ?? defaultStack, (next) => setAllStacks(next))
            }
          />
        </label>
      </div>
      <div className="positions-list">
        {players.map((p, i) => (
          <label key={p.id} className={`position-row ${p.isHero ? 'hero-row' : ''}`}>
            <span className="position-order">{i + 1}</span>
            <input
              type="radio"
              name="hero"
              checked={p.isHero}
              onChange={() => setHero(p.id)}
              aria-label={`${p.position}を自分にする`}
            />
            <span className="position-name">{p.position}</span>
            {p.isHero && <span className="hero-badge">自分</span>}
            <input
              className="position-stack"
              type="number"
              min={0}
              step={10}
              value={p.startingStack}
              readOnly={isNarrow}
              onClick={() => {
                if (isNarrow) setPicker({ kind: 'one', id: p.id })
              }}
              onChange={(e) => updateStack(p.id, Number(e.target.value))}
              onWheel={(e) => handleStackWheel(e, p.startingStack, (next) => updateStack(p.id, next))}
              aria-label={`${p.position}のスタック`}
            />
            <span className="position-stack-bb">{formatBB(p.startingStack, bb)}</span>
          </label>
        ))}
      </div>

      {picker?.kind === 'all' && (
        <WheelPicker
          title="全員のスタック"
          value={commonStack ?? defaultStack}
          min={0}
          max={pickerMax}
          step={10}
          formatSub={(v) => formatBB(v, bb)}
          onSelect={setAllStacks}
          onClose={() => setPicker(null)}
        />
      )}
      {pickerTarget && (
        <WheelPicker
          title={`${pickerTarget.position}のスタック`}
          value={pickerTarget.startingStack}
          min={0}
          max={pickerMax}
          step={10}
          formatSub={(v) => formatBB(v, bb)}
          onSelect={(v) => updateStack(pickerTarget.id, v)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
