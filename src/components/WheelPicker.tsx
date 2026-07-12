import { useEffect, useRef } from 'react'

interface WheelPickerProps {
  title: string
  value: number
  min: number
  max: number
  step: number
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
  min,
  max,
  step,
  formatSub,
  onSelect,
  onClose,
}: WheelPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)

  const values: number[] = []
  for (let v = min; v <= max; v += step) values.push(v)

  // Center the current value once when the sheet opens.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const index = Math.min(values.length - 1, Math.max(0, Math.round((value - min) / step)))
    el.scrollTop = index * ITEM_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)))
    if (values[i] !== value) onSelect(values[i])
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
            {values.map((v) => (
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
