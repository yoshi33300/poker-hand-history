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
            type="number"
            min={0}
            step={10}
            defaultValue={defaultStack}
            key={defaultStack}
            onChange={(e) => setAllStacks(Number(e.target.value))}
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
              aria-label={`${p.position}のスタック`}
            />
            <span className="position-stack-bb">{formatBB(p.startingStack, bb)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
