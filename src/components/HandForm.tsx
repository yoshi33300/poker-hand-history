import { useEffect, useRef, useState } from 'react'
import { createId } from '../id'
import { activePlayers, createDefaultPlayers, formatPosition, orderForStreet } from '../players'
import { saveHand } from '../db'
import { heroNetAmount, potBeforeStreet, preflopPotType, stackBeforeStreet, survivors } from '../pot'
import { determineShowdownWinners } from '../handRank'
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
  const [straddle, setStraddle] = useState(hand?.stakes.straddle ?? 0)
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
  // Opponent hole cards revealed at showdown, keyed by player id — lets the app judge the winner itself.
  const [villainCards, setVillainCards] = useState<Record<string, CardCode[]>>(hand?.villainCards ?? {})
  const [notes, setNotes] = useState(hand?.result.notes ?? '')
  const isNarrow = useIsNarrow()
  // Which blind field the drum-roll picker is editing on mobile.
  const [blindPicker, setBlindPicker] = useState<null | 'sb' | 'bb' | 'ante' | 'straddle'>(null)

  // BB changes always re-baseline every player's stack to 100bb.
  const prevBbRef = useRef(bb)
  useEffect(() => {
    if (prevBbRef.current !== bb) {
      setPlayers((prev) => prev.map((p) => ({ ...p, startingStack: bb * 100 })))
      prevBbRef.current = bb
    }
  }, [bb])

  const hero = players.find((p) => p.isHero)
  // anteMode is passed through untouched so hands saved with the old all-ante toggle keep their pot math.
  const stakes = { sb, bb, ante, anteMode: hand?.stakes.anteMode, straddle, currency }
  const handSnapshot = { players, stakes, streets }

  // Winner candidates and hero's net are derived live from the recorded actions.
  const survivorsAtEnd = survivors(handSnapshot)
  const hasAnyAction = STREETS.some((s) => streets[s].actions.length > 0)
  const allBoardCards = [...streets.flop.board, ...streets.turn.board, ...streets.river.board]
  const boardComplete = allBoardCards.length === 5

  function holeCardsOf(p: Player): CardCode[] {
    return p.isHero ? heroHoleCards : (villainCards[p.id] ?? [])
  }

  // With everyone's cards and a full board known, the app can judge the showdown itself.
  const showdownReady =
    survivorsAtEnd.length > 1 && boardComplete && survivorsAtEnd.every((p) => holeCardsOf(p).length === 2)
  const showdownResult = showdownReady
    ? determineShowdownWinners(
        allBoardCards,
        survivorsAtEnd.map((p) => ({ id: p.id, holeCards: holeCardsOf(p) })),
      )
    : null

  const manualWinnerIds = winnerIds.filter((id) => survivorsAtEnd.some((p) => p.id === id))
  // A lone survivor won the hand by definition; otherwise defer to the showdown result, then a manual pick.
  const autoWinnerIds =
    hasAnyAction && survivorsAtEnd.length === 1 ? [survivorsAtEnd[0].id] : (showdownResult?.winnerIds ?? null)
  const effectiveWinnerIds = autoWinnerIds ?? manualWinnerIds
  const netAmount = heroNetAmount(handSnapshot, effectiveWinnerIds)
  const heroFolded = hero
    ? STREETS.some((s) => streets[s].actions.some((a) => a.playerId === hero.id && a.type === 'fold'))
    : false

  function toggleWinner(id: string) {
    setWinnerIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))
  }

  function positionOf(id: string): string {
    const p = players.find((p) => p.id === id)
    return p ? formatPosition(p.position, straddle) : '?'
  }

  /**
   * Players still in the hand when this street starts, in action order.
   */
  function playersFor(street: Street): Player[] {
    const streetIndex = STREETS.indexOf(street)
    const utgStraddled = (stakes.straddle ?? 0) > 0
    if (streetIndex === 0) {
      // Preflop: hide players who implicitly folded — no recorded action while
      // someone later in the order already acted (e.g. UTG〜CO after a BTN open).
      const ordered = orderForStreet('preflop', players, utgStraddled)
      const acted = new Set(streets.preflop.actions.map((a) => a.playerId))
      let lastActedIdx = -1
      ordered.forEach((p, i) => {
        if (acted.has(p.id)) lastActedIdx = i
      })
      return ordered.filter((p, i) => acted.has(p.id) || i > lastActedIdx)
    }
    // Postflop: every street strictly before this one is settled by now, so
    // a player carries over only if they survived all of them — matched
    // each street's final bet (or went all-in), where silence before a bet
    // is just checking around but silence after one folds, same as never
    // having acted at all.
    const list = activePlayers(handSnapshot, STREETS[streetIndex - 1])
    return orderForStreet(street, list, utgStraddled)
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
    for (const cs of Object.values(villainCards)) cards.push(...cs)
    return cards
  }

  function usedCardsForVillain(playerId: string): CardCode[] {
    const cards = [...heroHoleCards]
    for (const s of STREETS) cards.push(...streets[s].board)
    for (const [pid, cs] of Object.entries(villainCards)) {
      if (pid !== playerId) cards.push(...cs)
    }
    return cards
  }

  function updateStreet(street: Street, data: StreetData) {
    setStreets((prev) => ({ ...prev, [street]: data }))
  }

  function autoTitle(): string {
    // Nothing recorded yet — there's no matchup to name, so stay blank.
    if (!hero || !hasAnyAction) return ''
    // The title names everyone who made it past preflop, even players who
    // fold later in the hand — "who saw the flop together" is the matchup.
    // A hand that never left preflop falls back to hero's own line.
    const opponents = activePlayers(handSnapshot, 'preflop').filter((p) => p.id !== hero.id)
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
    setVillainCards({})
    setNotes('')
  }

  async function handleSave() {
    // Keep every fully-entered opponent hand (folded players may still have shown their cards).
    const savedVillainCards: Record<string, CardCode[]> = {}
    for (const p of players) {
      if (!p.isHero && (villainCards[p.id]?.length ?? 0) === 2) savedVillainCards[p.id] = villainCards[p.id]
    }
    const savedHand: Hand = {
      id: hand?.id ?? createId(),
      createdAt: hand?.createdAt ?? Date.now(),
      // The auto title is blank until any action exists; a hand saved that
      // early still needs some name for the list.
      title: title.trim() || autoTitle() || '無題のハンド',
      gameType,
      stakes,
      players,
      heroHoleCards,
      villainCards: savedVillainCards,
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
          <label className="field-grow">
            タイトル (空欄なら自動)
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={autoTitle()}
            />
          </label>
          <label className="currency-field">
            通貨
            <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </label>
        </div>
        <div className="field-row stakes-row">
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
          <label>
            ストラドル
            <input
              type="number"
              min={0}
              value={straddle}
              readOnly={isNarrow}
              onClick={() => {
                if (isNarrow) setBlindPicker('straddle')
              }}
              onChange={(e) => setStraddle(Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h3>ポジション</h3>
        <PositionsEditor players={players} onChange={setPlayers} defaultStack={bb * 100} bb={bb} straddle={straddle} />
      </section>

      {STREETS.map((street) => (
        <section className="form-section" key={street}>
          <StreetEditor
            street={street}
            data={streets[street]}
            onChange={(data) => updateStreet(street, data)}
            players={playersFor(street)}
            allPlayers={players}
            usedCardsElsewhere={usedCardsFor(street)}
            potBefore={potBeforeStreet(handSnapshot, street)}
            stakes={stakes}
            stackBefore={stackBeforeFor(street)}
          />
        </section>
      ))}

      <section className="form-section">
        <h3>ホールカード</h3>
        <div className="showdown-players">
          <div className="showdown-player">
            <span className="showdown-player-label">
              {hero ? `${formatPosition(hero.position, straddle)} (自分)` : '自分'}
            </span>
            <CardPicker
              count={2}
              value={heroHoleCards}
              onChange={setHeroHoleCards}
              usedElsewhere={usedCardsFor('hole')}
              sortByRank
            />
          </div>
          {playersFor('flop')
            .filter((p) => !p.isHero)
            .map((p) => (
              <div key={p.id} className="showdown-player">
                <span className="showdown-player-label">{formatPosition(p.position, straddle)}</span>
                <CardPicker
                  count={2}
                  value={villainCards[p.id] ?? []}
                  onChange={(cards) => setVillainCards((prev) => ({ ...prev, [p.id]: cards }))}
                  usedElsewhere={usedCardsForVillain(p.id)}
                  sortByRank
                />
              </div>
            ))}
        </div>
      </section>

      <section className="form-section">
        <h3>結果</h3>
        {hasAnyAction && (
          <div className="result-editor">
            {survivorsAtEnd.length === 1 ? (
              <p className="result-auto">{formatPosition(survivorsAtEnd[0].position, straddle)}の勝利</p>
            ) : showdownResult ? (
              <p className="result-auto">
                自動判定: {showdownResult.winnerIds.map(positionOf).join('・')}の勝ち ({showdownResult.label})
              </p>
            ) : (
              <div className="action-type-buttons" role="group" aria-label="勝者を手動で選択">
                {survivorsAtEnd.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`action-type-button ${manualWinnerIds.includes(p.id) ? 'selected' : ''}`}
                    onClick={() => toggleWinner(p.id)}
                  >
                    {formatPosition(p.position, straddle)}
                    {p.isHero ? ' (自分)' : ''}
                  </button>
                ))}
              </div>
            )}

            {(effectiveWinnerIds.length > 0 || heroFolded) && (
              <p className={`result-net ${netAmount > 0 ? 'positive' : netAmount < 0 ? 'negative' : ''}`}>
                収支: {netAmount >= 0 ? '+' : ''}
                {netAmount}
                {currency} ({netAmount > 0 ? '+' : ''}
                {formatBB(netAmount, bb)})
              </p>
            )}
          </div>
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
          title={
            blindPicker === 'sb' ? 'SB' : blindPicker === 'bb' ? 'BB' : blindPicker === 'ante' ? 'アンティ' : 'ストラドル'
          }
          value={blindPicker === 'sb' ? sb : blindPicker === 'bb' ? bb : blindPicker === 'ante' ? ante : straddle}
          values={BLIND_CHOICES}
          onSelect={(v) => {
            if (blindPicker === 'sb') setSb(v)
            else if (blindPicker === 'bb') setBb(v)
            else if (blindPicker === 'ante') setAnte(v)
            else setStraddle(v)
          }}
          onClose={() => setBlindPicker(null)}
        />
      )}
    </div>
  )
}
