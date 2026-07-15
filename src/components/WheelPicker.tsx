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
  // missing so the wheel can start centered on it. Manual entry can also
  // insert values outside the original list later on.
  const [choices, setChoices] = useState(() => {
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

  // ---- Manual entry: type a value directly instead of scrolling ----
  const [manualMode, setManualMode] = useState(false)
  const cancelledRef = useRef(false)
  // Set by commitManualValue, consumed once `choices` has settled so the
  // wheel can be scrolled to a value that may have just been inserted.
  const pendingScrollValue = useRef<number | null>(null)

  useEffect(() => {
    if (pendingScrollValue.current === null) return
    const el = listRef.current
    const idx = choices.indexOf(pendingScrollValue.current)
    if (el && idx !== -1) el.scrollTop = idx * ITEM_H
    pendingScrollValue.current = null
  }, [choices])

  function openManual() {
    cancelledRef.current = false
    setManualMode(true)
  }

  function commitManualValue(raw: string) {
    const parsed = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      let v = Math.max(min, parsed)
      // An explicit `values` list has no meaningful upper bound (e.g. a
      // straddle can exceed the largest preset); a plain min/max range does.
      if (!values) v = Math.min(max, v)
      v = Math.round(v * 100) / 100
      if (!choices.includes(v)) {
        setChoices((prev) => [...prev, v].sort((a, b) => a - b))
      }
      pendingScrollValue.current = v
      onSelect(v)
    }
    setManualMode(false)
  }

  function handleManualKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelledRef.current = true
      setManualMode(false)
    }
  }

  function handleManualBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (cancelledRef.current) {
      cancelledRef.current = false
      return
    }
    commitManualValue(e.currentTarget.value)
  }

  return (
    <div className="wheel-overlay" onClick={onClose}>
      <div className="wheel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wheel-header">
          <span className="wheel-title">{title}</span>
          <span className="wheel-header-center">
            {manualMode ? (
              <input
                type="number"
                inputMode="decimal"
                className="wheel-manual-input"
                aria-label={`${title}を直接入力`}
                autoFocus
                defaultValue={value}
                onKeyDown={handleManualKeyDown}
                onBlur={handleManualBlur}
              />
            ) : (
              <button
                type="button"
                className="wheel-manual-toggle"
                onClick={openManual}
                aria-label={`${title}を直接入力`}
              >
                ✎ 入力
              </button>
            )}
          </span>
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
