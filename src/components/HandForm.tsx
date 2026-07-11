import { useState } from 'react'
import { createId } from '../id'
import { createDefaultPlayers, orderForStreet } from '../players'
import { formatCard } from '../cards'
import { saveHand } from '../db'
import { potBeforeStreet, stackBeforeStreet } from '../pot'
import { STREETS } from '../types'
import type { CardCode, GameType, Hand, Player, Street, StreetData } from '../types'
import CardPicker from './CardPicker'
import PositionsEditor from './PositionsEditor'
import StreetEditor from './StreetEditor'

const emptyStreetData = (): StreetData => ({ board: [], actions: [] })

interface HandFormProps {
  onSaved: (hand: Hand) => void
}

export default function HandForm({ onSaved }: HandFormProps) {
  const [title, setTitle] = useState('')
  const [gameType, setGameType] = useState<GameType>('NLH')
  const [sb, setSb] = useState(1)
  const [bb, setBb] = useState(2)
  const [ante, setAnte] = useState(0)
  const [currency, setCurrency] = useState('$')
  const [players, setPlayers] = useState<Player[]>(() => createDefaultPlayers(6, 200))
  const [heroHoleCards, setHeroHoleCards] = useState<CardCode[]>([])
  const [streets, setStreets] = useState<Record<Street, StreetData>>({
    preflop: emptyStreetData(),
    flop: emptyStreetData(),
    turn: emptyStreetData(),
    river: emptyStreetData(),
  })
  const [netAmount, setNetAmount] = useState(0)
  const [notes, setNotes] = useState('')

  const hero = players.find((p) => p.isHero)
  const stakes = { sb, bb, ante, currency }
  const handSnapshot = { players, stakes, streets }

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
    const cards = heroHoleCards.map(formatCard).join(' ')
    if (cards && hero) return `${cards} @ ${hero.position}`
    if (hero) return `${hero.position}のハンド`
    return '無題のハンド'
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
    setNetAmount(0)
    setNotes('')
  }

  async function handleSave() {
    const hand: Hand = {
      id: createId(),
      createdAt: Date.now(),
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
      result: { netAmount, notes },
    }
    await saveHand(hand)
    onSaved(hand)
    resetForm()
  }

  return (
    <div className="hand-form">
      <h2>ハンドを記録</h2>

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
          <label>
            ゲーム種別
            <select value={gameType} onChange={(e) => setGameType(e.target.value as GameType)}>
              <option value="NLH">NLH (テキサスホールデム)</option>
              <option value="PLO">PLO (オマハ)</option>
            </select>
          </label>
        </div>
        <div className="field-row">
          <label>
            通貨
            <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: '3.5rem' }} />
          </label>
          <label>
            SB
            <input type="number" min={0} value={sb} onChange={(e) => setSb(Number(e.target.value))} />
          </label>
          <label>
            BB
            <input type="number" min={0} value={bb} onChange={(e) => setBb(Number(e.target.value))} />
          </label>
          <label>
            アンティ
            <input type="number" min={0} value={ante} onChange={(e) => setAnte(Number(e.target.value))} />
          </label>
        </div>
        <p className="form-hint">
          SB/BB/アンティは最初からポットに投入済みとして自動計上されます。各アクションの金額は「そのストリートでの合計投入額」を入力してください(例: BBがレイズに対してコールする場合、ブラインド分を含めた合計額)。
        </p>
      </section>

      <section className="form-section">
        <h3>ポジション</h3>
        <PositionsEditor players={players} onChange={setPlayers} defaultStack={bb * 100} bb={bb} />
      </section>

      <section className="form-section">
        <h3>自分のホールカード {hero ? `(${hero.position})` : ''}</h3>
        <CardPicker
          label="ホールカード"
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
        <div className="field-row">
          <label>
            収支 ({currency})
            <input type="number" value={netAmount} onChange={(e) => setNetAmount(Number(e.target.value))} />
          </label>
        </div>
        <label className="notes-label">
          メモ
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
      </section>

      <div className="form-actions">
        <button type="button" className="primary" onClick={handleSave}>
          保存する
        </button>
      </div>
    </div>
  )
}
