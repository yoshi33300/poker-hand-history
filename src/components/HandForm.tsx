import { useEffect, useRef, useState } from 'react'
import { createId } from '../id'
import { createDefaultPlayers, orderForStreet } from '../players'
import { saveHand } from '../db'
import { heroNetAmount, potBeforeStreet, preflopPotType, stackBeforeStreet, survivors } from '../pot'
import { formatBB } from '../bb'
import { STREETS } from '../types'
import { useIsNarrow } from '../useIsNarrow'
import type { CardCode, Hand, Player, Street, StreetData } from '../types'
import CardPicker from './CardPicker'
import PositionsEditor from './PositionsEditor'
import StreetEditor from './StreetEditor'
import WheelPicker from './WheelPicker'

const emptyStreetData = (): StreetData => ({ board: [], actions: [] })

// Common blind/ante sizes for the drum-roll picker.
const BLIND_CHOICES = [
  0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200,
  250, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5000, 10000,
]

interface HandFormProps {
  /** Existing hand to edit. Omit to create a new one. */
  hand?: Hand
  onSaved: (hand: Hand) => void
  onCancel?: () => void
}

export default function HandForm({ hand, onSaved, onCancel }: HandFormProps) {
  const [title, setTitle] = useState(hand?.title ?? '')
  const gameType = 'NLH' as const
  const [sb, setSb] = useState(hand?.stakes.sb ?? 1)
  const [bb, setBb] = useState(hand?.stakes.bb ?? 2)
  const [ante, setAnte] = useState(hand?.stakes.ante ?? 0)
  const [currency, setCurrency] = useState(hand?.stakes.currency ?? '$')
  const [players, setPlayers] = useState<Player[]>(() => hand?.players ?? createDefaultPlayers(6, 200))
  const [heroHoleCards, setHeroHoleCards] = useState<CardCode[]>(hand?.heroHoleCards ?? [])
  const [streets, setStreets] = useState<Record<Street, StreetData>>(
    () =>
      hand?.streets ?? {
        preflop: emptyStreetData(),
        flop: emptyStreetData(),
        turn: emptyStreetData(),
        river: emptyStreetData(),
      },
  )
  const [winnerIds, setWinnerIds] = useState<string[]>(hand?.result.winnerIds ?? [])
  const [notes, setNotes] = useState(hand?.result.notes ?? '')
  const isNarrow = useIsNarrow()
  // Which blind field the drum-roll picker is editing on mobile.
  const [blindPicker, setBlindPicker] = useState<null | 'sb' | 'bb' | 'ante'>(null)

  // BB changes always re-baseline every player's stack to 100bb.
  const prevBbRef = useRef(bb)
  useEffect(() => {
    if (prevBbRef.current !== bb) {
      setPlayers((prev) => prev.map((p) => ({ ...p, startingStack: bb * 100 })))
      prevBbRef.current = bb
    }
  }, [bb])

  const hero = players.find((p) => p.isHero)
  const stakes = { sb, bb, ante, currency }
  const handSnapshot = { players, stakes, streets }

  // Winner candidates and hero's net are derived live from the recorded actions.
  const survivorsAtEnd = survivors(handSnapshot)
  const hasAnyAction = STREETS.some((s) => streets[s].actions.length > 0)
  const aliveWinnerIds = winnerIds.filter((id) => survivorsAtEnd.some((p) => p.id === id))
  // A lone survivor won the hand by definition — no tap needed.
  const effectiveWinnerIds =
    hasAnyAction && survivorsAtEnd.length === 1 ? [survivorsAtEnd[0].id] : aliveWinnerIds
  const netAmount = heroNetAmount(handSnapshot, effectiveWinnerIds)
  const heroFolded = hero
    ? STREETS.some((s) => streets[s].actions.some((a) => a.playerId === hero.id && a.type === 'fold'))
    : false

  function toggleWinner(id: string) {
    setWinnerIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))
  }

  /** Players still in the hand when this street starts, in action order. */
  function playersFor(street: Street): Player[] {
    const streetIndex = STREETS.indexOf(street)
    let list = players
    if (streetIndex > 0) {
      const acted = new Set(streets.preflop.actions.map((a) => a.playerId))
      list = list.filter((p) => acted.has(p.id))
      const folded = new Set<string>()
      for (let i = 0; i < streetIndex; i++) {
        for (const a of streets[STREETS[i]].actions) {
          if (a.type === 'fold') folded.add(a.playerId)
        }
      }
      list = list.filter((p) => !folded.has(p.id))
    }
    return orderForStreet(street, list)
  }

  function stackBeforeFor(street: Street): Record<string, number> {
    const result: Record<string, number> = {}
    for (const p of players) result[p.id] = stackBeforeStreet(handSnapshot, street, p.id)
    return result
  }

  function usedCardsFor(exclude: 'hole' | Street): CardCode[] {
    const cards: CardCode[] = []
    if (exclude !== 'hole') cards.push(...heroHoleCards)
    for (const s of STREETS) {
      if (s !== exclude) cards.push(...streets[s].board)
    }
    return cards
  }

  function updateStreet(street: Street, data: StreetData) {
    setStreets((prev) => ({ ...prev, [street]: data }))
  }

  function autoTitle(): string {
    if (!hero) return '無題のハンド'
    const folded = new Set<string>()
    const acted = new Set<string>()
    for (const street of STREETS) {
      for (const action of streets[street].actions) {
        acted.add(action.playerId)
        if (action.type === 'fold') folded.add(action.playerId)
      }
    }
    const opponents = players.filter((p) => p.id !== hero.id && acted.has(p.id) && !folded.has(p.id))
    const potType = preflopPotType(handSnapshot)
    if (opponents.length > 0) {
      const matchup = [hero.position, ...opponents.map((p) => p.position)].join('vs')
      return potType ? `${matchup} (${potType})` : matchup
    }
    return `${hero.position}のハンド`
  }

  function resetForm() {
    setTitle('')
    setHeroHoleCards([])
    setStreets({
      preflop: emptyStreetData(),
      flop: emptyStreetData(),
      turn: emptyStreetData(),
      river: emptyStreetData(),
    })
    setWinnerIds([])
    setNotes('')
  }

  async function handleSave() {
    const savedHand: Hand = {
      id: hand?.id ?? createId(),
      createdAt: hand?.createdAt ?? Date.now(),
      title: title.trim() || autoTitle(),
      gameType,
      stakes,
      players,
      heroHoleCards,
      streets: {
        preflop: streets.preflop,
        flop: streets.flop,
        turn: streets.turn,
        river: streets.river,
      },
      result: { netAmount, winnerIds: effectiveWinnerIds, notes },
    }
    await saveHand(savedHand)
    onSaved(savedHand)
    if (!hand) resetForm()
  }

  return (
    <div className="hand-form">
      <h2>{hand ? 'ハンドを編集' : 'ハンドを記録'}</h2>

      <section className="form-section">
        <h3>基本情報</h3>
        <div className="field-row">
          <label>
            タイトル (空欄なら自動)
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={autoTitle()}
            />
          </label>
        </div>
        <div className="field-row">
          <label>
            通貨
            <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: '3.5rem' }} />
          </label>
          <label>
            SB
            <input
              type="number"
              min={0}
              value={sb}
              readOnly={isNarrow}
              onClick={() => {
                if (isNarrow) setBlindPicker('sb')
              }}
              onChange={(e) => setSb(Number(e.target.value))}
            />
          </label>
          <label>
            BB
            <input
              type="number"
              min={0}
              value={bb}
              readOnly={isNarrow}
              onClick={() => {
                if (isNarrow) setBlindPicker('bb')
              }}
              onChange={(e) => setBb(Number(e.target.value))}
            />
          </label>
          <label>
            アンティ
            <input
              type="number"
              min={0}
              value={ante}
              readOnly={isNarrow}
              onClick={() => {
                if (isNarrow) setBlindPicker('ante')
              }}
              onChange={(e) => setAnte(Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h3>ポジション</h3>
        <PositionsEditor players={players} onChange={setPlayers} defaultStack={bb * 100} bb={bb} />
      </section>

      <section className="form-section">
        <h3>自分のホールカード {hero ? `(${hero.position})` : ''}</h3>
        <CardPicker
          count={2}
          value={heroHoleCards}
          onChange={setHeroHoleCards}
          usedElsewhere={usedCardsFor('hole')}
        />
      </section>

      {STREETS.map((street) => (
        <section className="form-section" key={street}>
          <StreetEditor
            street={street}
            data={streets[street]}
            onChange={(data) => updateStreet(street, data)}
            players={playersFor(street)}
            usedCardsElsewhere={usedCardsFor(street)}
            potBefore={potBeforeStreet(handSnapshot, street)}
            stakes={stakes}
            stackBefore={stackBeforeFor(street)}
          />
        </section>
      ))}

      <section className="form-section">
        <h3>結果</h3>
        {hasAnyAction ? (
          <div className="result-editor">
            <span className="result-label">勝者 (チョップは複数選択)</span>
            <div className="action-type-buttons" role="group" aria-label="勝者">
              {survivorsAtEnd.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`action-type-button ${effectiveWinnerIds.includes(p.id) ? 'selected' : ''}`}
                  onClick={() => toggleWinner(p.id)}
                >
                  {p.position}
                  {p.isHero ? ' (自分)' : ''}
                </button>
              ))}
            </div>
            {effectiveWinnerIds.length > 0 || heroFolded ? (
              <p className={`result-net ${netAmount > 0 ? 'positive' : netAmount < 0 ? 'negative' : ''}`}>
                収支: {netAmount >= 0 ? '+' : ''}
                {netAmount}
                {currency} ({netAmount > 0 ? '+' : ''}
                {formatBB(netAmount, bb)})
              </p>
            ) : (
              <p className="result-hint">勝者を選ぶと収支を自動計算します</p>
            )}
          </div>
        ) : (
          <p className="result-hint">アクションを入力すると勝者を選択できます</p>
        )}
      </section>

      <section className="form-section">
        <h3>メモ</h3>
        <label className="notes-label">
          メモ
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
      </section>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button type="button" className="primary" onClick={handleSave}>
          {hand ? '更新する' : '保存する'}
        </button>
      </div>

      {blindPicker && (
        <WheelPicker
          title={blindPicker === 'sb' ? 'SB' : blindPicker === 'bb' ? 'BB' : 'アンティ'}
          value={blindPicker === 'sb' ? sb : blindPicker === 'bb' ? bb : ante}
          values={BLIND_CHOICES}
          onSelect={(v) => {
            if (blindPicker === 'sb') setSb(v)
            else if (blindPicker === 'bb') setBb(v)
            else setAnte(v)
          }}
          onClose={() => setBlindPicker(null)}
        />
      )}
    </div>
  )
}
