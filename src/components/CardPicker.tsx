import { useState } from 'react'
import { RANKS, SUITS, makeCard, parseCard } from '../cards'
import { useIsNarrow } from '../useIsNarrow'
import type { CardCode, Rank } from '../types'
import PlayingCard from './PlayingCard'
import SuitIcon from './SuitIcon'

interface CardPickerProps {
  count: number
  value: CardCode[]
  onChange: (cards: CardCode[]) => void
  usedElsewhere: CardCode[]
}

export default function CardPicker({ count, value, onChange, usedElsewhere }: CardPickerProps) {
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  // Mobile only: rank picked in step 1, waiting for the suit in step 2.
  const [pendingRank, setPendingRank] = useState<Rank | null>(null)
  const isNarrow = useIsNarrow()

  const slots = Array.from({ length: count }, (_, i) => value[i])
  const usedSet = new Set([...usedElsewhere, ...value])

  function openSlotAt(i: number) {
    if (openSlot === i) {
      closeSheet()
      return
    }
    setOpenSlot(i)
    const current = value[i]
    setPendingRank(current ? parseCard(current).rank : null)
  }

  function closeSheet() {
    setOpenSlot(null)
    setPendingRank(null)
  }

  function selectCard(slot: number, code: CardCode) {
    const next = [...value]
    next[slot] = code
    onChange(next.slice(0, count).filter(Boolean) as CardCode[])
    closeSheet()
  }

  function clearSlot(slot: number) {
    const next = value.filter((_, i) => i !== slot)
    onChange(next)
    closeSheet()
  }

  const fullGrid = openSlot !== null && (
    <>
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
    </>
  )

  // Mobile step 1: rank only — a rank is disabled once every suit of it is taken.
  const rankStep = openSlot !== null && (
    <>
      <div className="rank-grid">
        {RANKS.map((r) => {
          const rankUsedUp = SUITS.every((s) => {
            const code = makeCard(r, s.code)
            return usedSet.has(code) && value[openSlot] !== code
          })
          return (
            <button
              type="button"
              key={r}
              disabled={rankUsedUp}
              className="rank-grid-cell"
              onClick={() => setPendingRank(r)}
            >
              {r}
            </button>
          )
        })}
      </div>
      <button type="button" className="card-grid-clear" onClick={() => clearSlot(openSlot)}>
        クリア
      </button>
    </>
  )

  // Mobile step 2: suit for the rank chosen in step 1.
  const suitStep = openSlot !== null && pendingRank !== null && (
    <div className="suit-grid">
      {SUITS.map((s) => {
        const code = makeCard(pendingRank, s.code)
        const disabled = usedSet.has(code) && value[openSlot] !== code
        return (
          <button
            type="button"
            key={s.code}
            disabled={disabled}
            className={`suit-grid-cell ${s.color}`}
            onClick={() => selectCard(openSlot, code)}
          >
            <SuitIcon suit={s.code} />
            <span className="suit-grid-label">
              {pendingRank}
              {s.symbol}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="card-picker">
      <div className="card-picker-slots">
        {slots.map((code, i) => (
          <button type="button" key={i} className="card-slot-button" onClick={() => openSlotAt(i)}>
            <PlayingCard code={code} size="sm" />
          </button>
        ))}
      </div>
      {openSlot !== null && !isNarrow && <div className="card-grid">{fullGrid}</div>}
      {openSlot !== null && isNarrow && (
        <div className="wheel-overlay" onClick={closeSheet}>
          <div className="wheel-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="wheel-header">
              {pendingRank !== null ? (
                <button type="button" className="wheel-back" onClick={() => setPendingRank(null)}>
                  ← 戻る
                </button>
              ) : (
                <span className="wheel-title">数字を選択</span>
              )}
              <button type="button" className="wheel-done" onClick={closeSheet}>
                閉じる
              </button>
            </div>
            <div className="card-sheet-body">{pendingRank === null ? rankStep : suitStep}</div>
          </div>
        </div>
      )}
    </div>
  )
}
