import { useState } from 'react'
import { RANKS, SUITS, makeCard, parseCard } from '../cards'
import { useIsNarrow } from '../useIsNarrow'
import type { CardCode, Rank, Suit } from '../types'
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
  const isNarrow = useIsNarrow()

  // Mobile sheet state: a local draft so Undo/Reset/OK can work without
  // touching the real value until confirmed.
  const [draft, setDraft] = useState<(CardCode | undefined)[]>([])
  const [activeSlot, setActiveSlot] = useState(0)
  const [pendingRank, setPendingRank] = useState<Rank | null>(null)
  const [history, setHistory] = useState<(CardCode | undefined)[][]>([])

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

  // ---- Desktop: inline full grid, one slot at a time (unchanged) ----
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

  // ---- Mobile: unified sheet editing every slot with rank+suit visible together ----
  function openSheet(slot: number) {
    setDraft(Array.from({ length: count }, (_, i) => value[i]))
    setActiveSlot(slot)
    setPendingRank(null)
    setHistory([])
  }

  function closeSheet() {
    setOpenSlot(null)
  }

  function pickRank(r: Rank) {
    setPendingRank(r)
  }

  function pickSuit(s: Suit) {
    if (pendingRank === null) return
    const code = makeCard(pendingRank, s)
    setHistory((h) => [...h, draft])
    const next = [...draft]
    next[activeSlot] = code
    setDraft(next)
    setPendingRank(null)
    const nextEmpty = next.findIndex((c, i) => i !== activeSlot && !c)
    setActiveSlot(nextEmpty !== -1 ? nextEmpty : activeSlot)
  }

  function selectSlot(i: number) {
    setActiveSlot(i)
    const current = draft[i]
    setPendingRank(current ? parseCard(current).rank : null)
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h
      setDraft(h[h.length - 1])
      return h.slice(0, -1)
    })
    setPendingRank(null)
  }

  function reset() {
    setHistory((h) => [...h, draft])
    setDraft(Array.from({ length: count }, () => undefined))
    setPendingRank(null)
    setActiveSlot(0)
  }

  function confirmSheet() {
    onChange(draft.filter(Boolean) as CardCode[])
    setOpenSlot(null)
  }

  const draftCompact = draft.filter(Boolean) as CardCode[]
  const sheetChanged = draftCompact.join() !== value.join()
  const draftUsedSet = new Set([...usedElsewhere, ...draft.filter((_, i) => i !== activeSlot).filter(Boolean)])
  const rankFullyUsed = (r: Rank) => SUITS.every((s) => draftUsedSet.has(makeCard(r, s.code)))

  return (
    <div className="card-picker">
      <div className="card-picker-slots">
        {slots.map((code, i) => (
          <button
            type="button"
            key={i}
            className="card-slot-button"
            onClick={() => {
              if (openSlot === i) {
                closeSheet()
              } else {
                setOpenSlot(i)
                if (isNarrow) openSheet(i)
              }
            }}
          >
            <PlayingCard code={code} size="sm" />
          </button>
        ))}
      </div>
      {openSlot !== null && !isNarrow && <div className="card-grid">{fullGrid}</div>}
      {openSlot !== null && isNarrow && (
        <div className="wheel-overlay" onClick={closeSheet}>
          <div className="wheel-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="card-sheet-slots">
              {draft.map((code, i) => {
                const info = code ? SUITS.find((s) => s.code === parseCard(code).suit) : null
                return (
                  <button
                    type="button"
                    key={i}
                    className={`card-sheet-slot ${i === activeSlot ? 'active' : ''} ${info ? info.color : ''}`}
                    onClick={() => selectSlot(i)}
                  >
                    {code ? (
                      <>
                        {parseCard(code).rank}
                        <SuitIcon suit={parseCard(code).suit} />
                      </>
                    ) : (
                      '?'
                    )}
                  </button>
                )
              })}
            </div>

            <div className="card-sheet-ranks">
              {RANKS.map((r) => (
                <button
                  type="button"
                  key={r}
                  disabled={rankFullyUsed(r)}
                  className={`card-sheet-rank ${pendingRank === r ? 'selected' : ''}`}
                  onClick={() => pickRank(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="card-sheet-suits">
              {SUITS.map((s) => {
                const disabled =
                  pendingRank === null || draftUsedSet.has(makeCard(pendingRank, s.code))
                return (
                  <button
                    type="button"
                    key={s.code}
                    disabled={disabled}
                    className={`card-sheet-suit ${s.color}`}
                    onClick={() => pickSuit(s.code)}
                  >
                    <SuitIcon suit={s.code} />
                  </button>
                )
              })}
            </div>

            <div className="card-sheet-footer">
              <button type="button" className="card-sheet-text-button" onClick={undo} disabled={history.length === 0}>
                ↶ 元に戻す
              </button>
              <button type="button" className="card-sheet-text-button" onClick={reset}>
                リセット
              </button>
              <button type="button" className="card-sheet-ok" disabled={!sheetChanged} onClick={confirmSheet}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
