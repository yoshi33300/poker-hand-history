import { useEffect, useState } from 'react'
import { ACTION_LABELS, STREET_LABELS } from '../types'
import type { ActionType, CardCode, Hand, HandAction, Player, Street, StreetData } from '../types'
import { createId } from '../id'
import { formatPosition, nextToAct } from '../players'
import { currentBetTo, isStreetComplete, streetContribution } from '../pot'
import { formatBB } from '../bb'
import CardPicker from './CardPicker'

const AMOUNT_TYPES: ActionType[] = ['call', 'bet', 'raise', 'allin']

/** Which actions make sense given whether this player is facing a bet. */
function availableActions(facingBet: boolean, canAllin: boolean): ActionType[] {
  const base: ActionType[] = facingBet ? ['fold', 'call', 'raise'] : ['check', 'bet']
  return canAllin ? [...base, 'allin'] : base
}

interface StreetEditorProps {
  street: Street
  data: StreetData
  onChange: (data: StreetData) => void
  /** Live players for this street, sorted in action order. */
  players: Player[]
  usedCardsElsewhere: CardCode[]
  /** Pot size carried into this street (blinds + earlier streets). */
  potBefore: number
  stakes: Hand['stakes']
  /** Each player's remaining stack at the start of this street. */
  stackBefore: Record<string, number>
}

export default function StreetEditor({
  street,
  data,
  onChange,
  players,
  usedCardsElsewhere,
  potBefore,
  stakes,
  stackBefore,
}: StreetEditorProps) {
  // The position select follows "next to act" automatically; a manual pick
  // overrides it until the next action is added.
  const [manualId, setManualId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<ActionType>('fold')
  const [amount, setAmount] = useState('')

  const playerId =
    manualId && players.some((p) => p.id === manualId)
      ? manualId
      : nextToAct(players, data.actions)

  const boardCount = street === 'flop' ? 3 : street === 'preflop' ? 0 : 1
  const contribution = streetContribution(street, data, players, stakes)
  const betTo = currentBetTo(contribution)
  const investedSoFar = contribution.perPlayer[playerId] ?? 0
  const streetStartStack = stackBefore[playerId] ?? 0
  const remainingStack = streetStartStack - investedSoFar
  const actions = availableActions(betTo > investedSoFar, remainingStack > 0)
  const bettingClosed = isStreetComplete(street, data, players, stakes)

  // Calling always means "match the current bet" and an all-in commits the
  // whole stack — prefill both so nobody has to do the mental math.
  useEffect(() => {
    if (actionType === 'call') setAmount(String(betTo))
    if (actionType === 'allin') setAmount(String(streetStartStack))
  }, [actionType, betTo, playerId, streetStartStack])

  // Keep the selected action valid as the situation (player, betTo) changes.
  useEffect(() => {
    if (!actions.includes(actionType)) setActionType(actions[0])
  }, [actions, actionType])

  // A zero-amount raise would look like "no bet" to everyone after it, so
  // amounts are required: a raise must exceed the current bet, the rest just
  // need actual chips in.
  const amountNumber = Number(amount)
  const amountValid = !AMOUNT_TYPES.includes(actionType)
    ? true
    : actionType === 'raise'
      ? amountNumber > betTo
      : amountNumber > 0

  function addAction() {
    if (!playerId || !amountValid) return
    const action: HandAction = {
      id: createId(),
      playerId,
      type: actionType,
      amount: AMOUNT_TYPES.includes(actionType) ? amountNumber : undefined,
    }
    onChange({ ...data, actions: [...data.actions, action] })
    setAmount('')
    setManualId(null)
    // After an aggressive action the next player most often calls — preselect it.
    if (actionType === 'bet' || actionType === 'raise' || actionType === 'allin') {
      setActionType('call')
    }
  }

  function removeAction(id: string) {
    onChange({ ...data, actions: data.actions.filter((a) => a.id !== id) })
  }

  function positionOf(id: string) {
    const p = players.find((p) => p.id === id)
    return p ? formatPosition(p.position, stakes.straddle) : '?'
  }

  return (
    <div className="street-editor">
      <div className="street-header">
        <h3>{STREET_LABELS[street]}</h3>
        <span className="street-pot">
          ポット: {potBefore + contribution.total} ({formatBB(potBefore + contribution.total, stakes.bb)})
        </span>
      </div>

      {boardCount > 0 && (
        <CardPicker
          count={boardCount}
          value={data.board}
          onChange={(board) => onChange({ ...data, board })}
          usedElsewhere={usedCardsElsewhere}
        />
      )}

      {data.actions.length > 0 && (
        <ol className="action-list">
          {data.actions.map((a) => (
            <li key={a.id} className="action-item">
              <span className="action-player">{positionOf(a.playerId)}</span>
              <span className={`action-type action-${a.type}`}>{ACTION_LABELS[a.type]}</span>
              {a.amount !== undefined && a.amount > 0 && (
                <span className="action-amount">
                  合計 {a.amount} ({formatBB(a.amount, stakes.bb)})
                </span>
              )}
              <button
                type="button"
                className="action-remove"
                onClick={() => removeAction(a.id)}
                aria-label="このアクションを削除"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      {players.length > 0 && bettingClosed && data.actions.length > 0 && (
        <p className="street-complete-note">このストリートのベッティングは終了しました</p>
      )}

      {players.length > 0 && !bettingClosed && (
        <div className="action-add-form">
          <div className="action-add-row">
            <label className="action-position-label">
              ポジション
              <select value={playerId} onChange={(e) => setManualId(e.target.value)}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPosition(p.position, stakes.straddle)}
                    {p.isHero ? ' (自分)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="action-type-buttons" role="group" aria-label="アクション種別">
              {actions.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={`action-type-button ${actionType === type ? 'selected' : ''}`}
                  onClick={() => setActionType(type)}
                >
                  {ACTION_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div className="action-add-row">
            {AMOUNT_TYPES.includes(actionType) && (
              <label className="action-amount-label">
                合計投入額
                <input
                  type="number"
                  min={0}
                  placeholder="金額"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
            <button type="button" className="action-add-button" onClick={addAction} disabled={!amountValid}>
              アクションを追加
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
