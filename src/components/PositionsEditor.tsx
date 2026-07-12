import { useRef } from 'react'
import { resizePlayers } from '../players'
import { formatBB } from '../bb'
import type { Player } from '../types'

interface PositionsEditorProps {
  players: Player[]
  onChange: (players: Player[]) => void
  defaultStack: number
  bb: number
}

export default function PositionsEditor({ players, onChange, defaultStack, bb }: PositionsEditorProps) {
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

  // Touch: drag up/down on a stack input to adjust it (10 chips per 24px).
  // The inputs set `touch-action: none` so the page doesn't scroll instead.
  const touchDrag = useRef<{ startY: number; base: number } | null>(null)

  function handleTouchStart(e: React.TouchEvent<HTMLInputElement>, current: number) {
    touchDrag.current = { startY: e.touches[0].clientY, base: current }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLInputElement>, onSet: (next: number) => void) {
    const drag = touchDrag.current
    if (!drag) return
    const steps = Math.round((drag.startY - e.touches[0].clientY) / 24)
    onSet(Math.max(0, drag.base + steps * 10))
  }

  function handleTouchEnd() {
    touchDrag.current = null
  }

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
            defaultValue={defaultStack}
            key={defaultStack}
            onChange={(e) => setAllStacks(Number(e.target.value))}
            onWheel={(e) => {
              handleStackWheel(e, Number(e.currentTarget.value) || 0, (next) => {
                e.currentTarget.value = String(next)
                setAllStacks(next)
              })
            }}
            onTouchStart={(e) => handleTouchStart(e, Number(e.currentTarget.value) || 0)}
            onTouchMove={(e) => {
              handleTouchMove(e, (next) => {
                e.currentTarget.value = String(next)
                setAllStacks(next)
              })
            }}
            onTouchEnd={handleTouchEnd}
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
              onChange={(e) => updateStack(p.id, Number(e.target.value))}
              onWheel={(e) => handleStackWheel(e, p.startingStack, (next) => updateStack(p.id, next))}
              onTouchStart={(e) => handleTouchStart(e, p.startingStack)}
              onTouchMove={(e) => handleTouchMove(e, (next) => updateStack(p.id, next))}
              onTouchEnd={handleTouchEnd}
              aria-label={`${p.position}のスタック`}
            />
            <span className="position-stack-bb">{formatBB(p.startingStack, bb)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
