import { useState } from 'react'
import { RANKS, SUITS, makeCard } from '../cards'
import type { CardCode } from '../types'
import PlayingCard from './PlayingCard'
import SuitIcon from './SuitIcon'

interface CardPickerProps {
  label: string
  count: number
  value: CardCode[]
  onChange: (cards: CardCode[]) => void
  usedElsewhere: CardCode[]
}

export default function CardPicker({ label, count, value, onChange, usedElsewhere }: CardPickerProps) {
  const [openSlot, setOpenSlot] = useState<number | null>(null)

  const slots = Array.from({ length: count }, (_, i) => value[i])
  const usedSet = new Set([...usedElsewhere, ...value])

  function selectCard(slot: number, code: CardCode) {
    const next = [...value]
    next[slot] = code
    onChange(next.slice(0, count).filter(Boolean) as CardCode[])
    setOpenSlot(null)
  }

  function clearSlot(slot: number) {
    const next = value.filter((_, i) => i !== slot)
    onChange(next)
    setOpenSlot(null)
  }

  return (
    <div className="card-picker">
      <div className="card-picker-label">{label}</div>
      <div className="card-picker-slots">
        {slots.map((code, i) => (
          <button
            type="button"
            key={i}
            className="card-slot-button"
            onClick={() => setOpenSlot(openSlot === i ? null : i)}
          >
            <PlayingCard code={code} size="sm" />
          </button>
        ))}
      </div>
      {openSlot !== null && (
        <div className="card-grid">
          {SUITS.map((s) => (
            <div className="card-grid-row" key={s.code}>
              <span className={`card-grid-suit-label ${s.color}`} title={s.label}>
                <SuitIcon suit={s.code} />
              </span>
              {RANKS.map((r) => {
                const code = makeCard(r, s.code)
                const disabled = usedSet.has(code) && value[openSlot] !== code
                return (
                  <button
                    type="button"
                    key={code}
                    disabled={disabled}
                    className={`card-grid-cell ${s.color}`}
                    onClick={() => selectCard(openSlot, code)}
                  >
                    {r}
                    <SuitIcon suit={s.code} />
                  </button>
                )
              })}
            </div>
          ))}
          <button type="button" className="card-grid-clear" onClick={() => clearSlot(openSlot)}>
            クリア
          </button>
        </div>
      )}
    </div>
  )
}
