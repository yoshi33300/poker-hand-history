import { useEffect, useMemo, useState } from 'react'
import { ACTION_LABELS, STREET_LABELS, STREETS } from '../types'
import type { CardCode, Hand, HandAction, Street } from '../types'
import { formatCard } from '../cards'
import { formatBB } from '../bb'
import { blindBaseline, matchedPreflopBet } from '../pot'
import { formatPosition, withImplicitPreflopFolds } from '../players'
import { buildHandText } from '../shareText'
// AIレビューを有効化する場合はこの import と下部の <AiReview hand={hand} /> を戻す
// import AiReview from './AiReview'
import PokerTable from './PokerTable'
import type { TableState } from './PokerTable'

type TimelineEvent =
  | { kind: 'street-start'; street: Street }
  | { kind: 'board'; street: Street; cards: CardCode[] }
  | { kind: 'action'; street: Street; action: HandAction }

interface HandReplayerProps {
  hand: Hand
  onBack: () => void
  onEdit: (hand: Hand) => void
}

// Blinds/antes are chips already on the table before anyone acts, so they are
// not separate advanceable steps — computeState() seeds them directly.
function buildTimeline(hand: Hand): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const street of STREETS) {
    const data = hand.streets[street]
    if (data.actions.length === 0 && data.board.length === 0) continue
    events.push({ kind: 'street-start', street })
    if (data.board.length > 0) events.push({ kind: 'board', street, cards: data.board })
    for (const action of data.actions) {
      events.push({ kind: 'action', street, action })
    }
  }
  return events
}

function computeState(hand: Hand, events: TimelineEvent[], index: number): TableState {
  const board: CardCode[] = []
  const completed: Record<string, number> = {}
  // Blinds are live from the very first render, before the preflop street-start event fires.
  let current: Record<string, number> = {}
  for (const p of hand.players) {
    const base = blindBaseline(p, hand.stakes)
    if (base > 0) current[p.id] = base
  }
  let lastAction: Record<string, HandAction> = {}
  const folded = new Set<string>()
  let street: Street = 'preflop'

  for (let i = 0; i < index; i++) {
    const e = events[i]
    // The very first street-start (preflop) just confirms the street we
    // already seeded blinds for — only a real transition sweeps bets into the pot.
    if (e.kind === 'street-start' && e.street !== street) {
      for (const [id, amt] of Object.entries(current)) {
        completed[id] = (completed[id] ?? 0) + amt
      }
      current = {}
      lastAction = {}
      street = e.street
    }
    if (e.kind === 'board') board.push(...e.cards)
    if (e.kind === 'action') {
      const { action } = e
      if (action.type === 'fold') folded.add(action.playerId)
      // amount is the player's running total for the street, not a delta.
      if (action.amount !== undefined) current[action.playerId] = action.amount
      lastAction[action.playerId] = action
    }
  }

  const contributed: Record<string, number> = { ...completed }
  for (const [id, amt] of Object.entries(current)) {
    contributed[id] = (contributed[id] ?? 0) + amt
  }
  const potCenter = Object.values(completed).reduce((a, b) => a + b, 0)
  const potTotal = Object.values(contributed).reduce((a, b) => a + b, 0)

  return {
    board,
    contributed,
    streetContrib: current,
    lastAction,
    folded,
    potCenter,
    potTotal,
    street,
  }
}

// Step-by-step navigation stops at boards and actions — a street header
// alone isn't worth its own click, so it rides along with whichever comes
// next (the board it precedes, or the first action if there's no board).
// A trailing stop is added as a safety net for any leftover event after the
// last board/action (shouldn't normally happen, but keeps the end reachable).
function buildStops(events: TimelineEvent[]): number[] {
  const stops: number[] = []
  events.forEach((e, i) => {
    if (e.kind === 'action' || e.kind === 'board') stops.push(i + 1)
  })
  if (events.length > 0 && stops[stops.length - 1] !== events.length) {
    stops.push(events.length)
  }
  return stops
}

export default function HandReplayer({ hand, onBack, onEdit }: HandReplayerProps) {
  const events = useMemo(() => buildTimeline(hand), [hand])
  const stops = useMemo(() => buildStops(events), [events])
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [unit, setUnit] = useState<'chips' | 'bb'>('bb')
  const [copied, setCopied] = useState(false)
  const [manualText, setManualText] = useState<string | null>(null)
  const formatAmount = (chips: number) =>
    unit === 'bb' ? formatBB(chips, hand.stakes.bb) : `${chips}`

  function legacyCopy(text: string): boolean {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  }

  async function handleShare() {
    const text = buildHandText(hand)
    setManualText(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      return
    } catch {
      // Clipboard API unavailable or blocked — fall through to the legacy method.
    }
    if (legacyCopy(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } else {
      // Last resort: show the text inline so it can be selected and copied by hand.
      setManualText(text)
    }
  }

  useEffect(() => {
    if (!playing) return
    if (step >= stops.length) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1300)
    return () => clearTimeout(t)
  }, [playing, step, stops.length])

  // The event index computeState() should apply up to — everything through
  // the current stop, action or trailing board reveal alike.
  const currentIndex = step > 0 ? stops[step - 1] : 0
  const state = computeState(hand, events, currentIndex)
  const currentEvent = currentIndex > 0 ? events[currentIndex - 1] : null
  const actingPlayerId = currentEvent?.kind === 'action' ? currentEvent.action.playerId : null

  // Everything folded into this stop since the previous one — a street
  // header and board reveal ride along with the action that follows them,
  // so both still need to be shown, not just the action itself.
  const previousIndex = step > 1 ? stops[step - 2] : 0
  const currentBundle = currentIndex > 0 ? events.slice(previousIndex, currentIndex) : []

  // Players passed over during preflop so far — dimmed like an explicit
  // fold. Only matters before the flop; once reached, these players simply
  // drop off the table via visibleIds below instead.
  const implicitFoldedIds = useMemo(() => {
    if (state.street !== 'preflop') return new Set<string>()
    const utgStraddled = (hand.stakes.straddle ?? 0) > 0
    const preflopActionsSoFar = events
      .slice(0, currentIndex)
      .filter((e): e is Extract<TimelineEvent, { kind: 'action' }> => e.kind === 'action' && e.street === 'preflop')
      .map((e) => e.action)
    const result = new Set<string>()
    for (const ev of withImplicitPreflopFolds(hand.players, preflopActionsSoFar, utgStraddled)) {
      if (ev.kind === 'implicit-fold') result.add(ev.playerId)
    }
    return result
  }, [state.street, currentIndex, events, hand])

  // Postflop, a player only stays on the table if they actually matched the
  // final preflop bet (or went all-in) — merely having acted at some point
  // isn't enough, since an earlier raiser who got 4bet and never responded
  // folded just as surely as someone who never acted at all.
  const reachedPostflop = state.street !== 'preflop'
  const visibleIds = new Set(
    hand.players
      .filter((p) => !reachedPostflop || matchedPreflopBet(hand, p.id))
      .map((p) => p.id),
  )

  function positionOf(id: string) {
    const p = hand.players.find((p) => p.id === id)
    return p ? formatPosition(p.position, hand.stakes.straddle) : '?'
  }

  function describe(e: TimelineEvent): string {
    if (e.kind === 'street-start') return `— ${STREET_LABELS[e.street]} —`
    if (e.kind === 'board') return `ボード: ${e.cards.map(formatCard).join(' ')}`
    const { action } = e
    const amount = action.amount ? ` ${formatAmount(action.amount)}` : ''
    return `${positionOf(action.playerId)}: ${ACTION_LABELS[action.type]}${amount}`
  }

  // Pot size right after event i resolves, for the log's running total.
  const potAfter = events.map((_, i) => computeState(hand, events, i + 1).potTotal)

  return (
    <div className="hand-replayer">
      <div className="replayer-header-row">
        <button type="button" className="back-button" onClick={onBack}>
          ← 一覧に戻る
        </button>
        <button type="button" className="edit-button" onClick={() => onEdit(hand)}>
          編集
        </button>
        <button type="button" className="share-button" onClick={handleShare}>
          {copied ? 'コピーしました' : '共有'}
        </button>
      </div>
      <h2>{hand.title}</h2>
      {manualText && (
        <div className="share-manual">
          <p>コピーに失敗しました。下のテキストを選択してコピーしてください。</p>
          <textarea readOnly value={manualText} onFocus={(e) => e.currentTarget.select()} rows={6} />
          <button type="button" onClick={() => setManualText(null)}>
            閉じる
          </button>
        </div>
      )}
      <div className="replayer-toolbar">
        <p className="replayer-stakes">
          {hand.stakes.currency}
          {hand.stakes.sb}/{hand.stakes.currency}
          {hand.stakes.bb}
          {hand.stakes.ante > 0
            ? ` (アンティ ${hand.stakes.ante}${hand.stakes.anteMode === 'all' ? '・全員' : ''})`
            : ''}
          {(hand.stakes.straddle ?? 0) > 0 ? ` UTGストラドル ${hand.stakes.straddle}` : ''} ・ {hand.gameType}
        </p>
        <div className="unit-toggle" role="group" aria-label="表示単位">
          <button
            type="button"
            className={unit === 'chips' ? 'selected' : ''}
            onClick={() => setUnit('chips')}
          >
            チップ
          </button>
          <button type="button" className={unit === 'bb' ? 'selected' : ''} onClick={() => setUnit('bb')}>
            BB
          </button>
        </div>
      </div>

      <PokerTable
        hand={hand}
        state={state}
        actingPlayerId={actingPlayerId}
        visibleIds={visibleIds}
        implicitFoldedIds={implicitFoldedIds}
        formatAmount={formatAmount}
      />

      <div className="replay-current-event">
        {currentEvent ? (
          <>
            {currentBundle.slice(0, -1).map((e, i) => (
              <div key={i} className="replay-current-sub">
                {describe(e)}
              </div>
            ))}
            <div>{describe(currentEvent)}</div>
          </>
        ) : (
          'ハンド開始前'
        )}
      </div>

      <div className="replay-controls">
        <button type="button" onClick={() => setStep(0)} disabled={step === 0}>
          ⏮ 最初
        </button>
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ◀ 戻る
        </button>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '一時停止' : '再生'}
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(stops.length, s + 1))}
          disabled={step >= stops.length}
        >
          進む ▶
        </button>
        <button type="button" onClick={() => setStep(stops.length)} disabled={step >= stops.length}>
          最後 ⏭
        </button>
        <span className="replay-step-counter">
          {step} / {stops.length}
        </span>
      </div>

      <div className="replay-log">
        {events.map((e, i) => (
          <div
            key={i}
            className={[
              'replay-log-line',
              e.kind === 'street-start' ? 'street-line' : '',
              i === currentIndex - 1 ? 'active' : '',
              i >= currentIndex ? 'future' : '',
            ].join(' ')}
          >
            <span className="replay-log-text">{describe(e)}</span>
            {e.kind === 'street-start' && (
              <span className="replay-log-pot">ポット {formatAmount(potAfter[i])}</span>
            )}
          </div>
        ))}
      </div>

      {hand.result.winnerIds && hand.result.winnerIds.length > 0 && (
        <div className="replay-result-row">
          <span>勝者: {hand.result.winnerIds.map(positionOf).join(', ')}</span>
          <span className={`replay-result ${hand.result.netAmount >= 0 ? 'positive' : 'negative'}`}>
            {hand.result.netAmount >= 0 ? '+' : ''}
            {formatAmount(hand.result.netAmount)}
          </span>
        </div>
      )}

      {hand.result.notes && (
        <div className="replay-notes">
          <h3>メモ</h3>
          <p>{hand.result.notes}</p>
        </div>
      )}

      {/* <AiReview hand={hand} /> */}
    </div>
  )
}
