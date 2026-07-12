import { useEffect, useRef, useState } from 'react'

interface WheelPickerProps {
  title: string
  value: number
  /** Explicit sorted list of choices. Takes precedence over min/max/step. */
  values?: number[]
  min?: number
  max?: number
  step?: number
  /** Small secondary label per item, e.g. the BB equivalent. */
  formatSub?: (v: number) => string
  onSelect: (v: number) => void
  onClose: () => void
}

const ITEM_H = 40

/** iOS-style drum-roll picker shown as a bottom sheet. */
export default function WheelPicker({
  title,
  value,
  values,
  min = 0,
  max = 1000,
  step = 1,
  formatSub,
  onSelect,
  onClose,
}: WheelPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Choices are fixed when the sheet opens; the current value is inserted if
  // missing so the wheel can start centered on it.
  const [choices] = useState(() => {
    const base: number[] = values ? [...values] : []
    if (!values) {
      for (let v = min; v <= max; v += step) base.push(v)
    }
    if (!base.includes(value)) {
      base.push(value)
      base.sort((a, b) => a - b)
    }
    return base
  })

  // Center the current value once when the sheet opens.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = Math.max(0, choices.indexOf(value)) * ITEM_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const i = Math.min(choices.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)))
    if (choices[i] !== value) onSelect(choices[i])
  }

  return (
    <div className="wheel-overlay" onClick={onClose}>
      <div className="wheel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wheel-header">
          <span className="wheel-title">{title}</span>
          <button type="button" className="wheel-done" onClick={onClose}>
            完了
          </button>
        </div>
        <div className="wheel-body">
          <div className="wheel-highlight" />
          <div className="wheel-list" ref={listRef} onScroll={handleScroll}>
            {choices.map((v) => (
              <div key={v} className={`wheel-item ${v === value ? 'selected' : ''}`}>
                {v}
                {formatSub && <span className="wheel-sub">{formatSub(v)}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
