import { useMemo } from 'react'
import { ACTION_LABELS, STREET_LABELS } from '../types'
import type { CardCode, Hand, HandAction, Street } from '../types'
import { orderForStreet } from '../players'
import PlayingCard from './PlayingCard'

export interface TableState {
  board: CardCode[]
  folded: Set<string>
  /** Total chips each player has put in across the whole hand. */
  contributed: Record<string, number>
  /** Chips put in during the current street (shown in front of the seat). */
  streetContrib: Record<string, number>
  /** Last action each player took on the current street. */
  lastAction: Record<string, HandAction>
  /** Pot collected from previous streets (center of the table). */
  potCenter: number
  /** Pot including current-street bets. */
  potTotal: number
  street: Street
}

interface PokerTableProps {
  hand: Hand
  state: TableState
  actingPlayerId: string | null
  /** Players still shown on the table (per the hide-non-actors rule). */
  visibleIds: Set<string>
  /** Formats a chip amount for display (chips or BB, depending on the unit toggle). */
  formatAmount: (chips: number) => string
}

const BADGE_CLASS: Record<string, string> = {
  fold: 'badge-fold',
  check: 'badge-passive',
  call: 'badge-passive',
  bet: 'badge-aggro',
  raise: 'badge-aggro',
  allin: 'badge-aggro',
  'post-sb': 'badge-post',
  'post-bb': 'badge-post',
  'post-ante': 'badge-post',
}

export default function PokerTable({ hand, state, actingPlayerId, visibleIds, formatAmount }: PokerTableProps) {
  // Physical seating runs clockwise SB, BB, UTG, ..., BTN; rotate so hero sits
  // bottom-center and lay the rest clockwise around the ellipse.
  const seats = useMemo(() => {
    const order = orderForStreet('flop', hand.players)
    const heroIdx = Math.max(0, order.findIndex((p) => p.isHero))
    const rotated = [...order.slice(heroIdx), ...order.slice(0, heroIdx)]
    const n = rotated.length
    return rotated.map((player, i) => {
      const theta = (Math.PI / 180) * (90 + (360 / n) * i)
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      return {
        player,
        x: 50 + 42 * cos,
        y: 50 + 42 * sin,
        // Bet pills sit between the seat and the pot; their radius is a CSS
        // variable so mobile can push them outward to avoid the board.
        // Near-horizontal rows would land on the board/pot line, so those
        // pills are pushed into the clear band above/below the center column.
        betCos: cos,
        betSin: Math.abs(sin) >= 0.5 ? sin : sin >= 0 ? 0.5 : -0.5,
        buttonX: 50 + 31 * Math.cos(theta - 0.45),
        buttonY: 50 + 29 * Math.sin(theta - 0.45),
      }
    })
  }, [hand])

  const dealerSeat =
    seats.find((s) => s.player.position === 'BTN') ??
    seats.find((s) => s.player.position === 'SB')

  return (
    <div className={`poker-table seats-${hand.players.length}`}>
      <div className="table-felt" />

      <div className="table-center">
        <div className="table-street-chip">{STREET_LABELS[state.street]}</div>
        <div className="table-board">
          {Array.from({ length: 5 }, (_, i) => (
            <PlayingCard key={i} code={state.board[i]} size="md" />
          ))}
        </div>
        <div className="table-pot">
          ポット: {formatAmount(state.potCenter)}
          {state.potTotal !== state.potCenter && (
            <span className="table-pot-total">合計 {formatAmount(state.potTotal)}</span>
          )}
        </div>
      </div>

      {seats.map(({ player: p, x, y }) => {
        if (!visibleIds.has(p.id)) return null
        const folded = state.folded.has(p.id)
        const last = state.lastAction[p.id]
        return (
          <div key={p.id} className="seat-anchor" style={{ left: `${x}%`, top: `${y}%` }}>
            <div
              className={[
                'seat-box',
                folded ? 'folded' : '',
                p.isHero ? 'is-hero' : '',
                p.id === actingPlayerId ? 'acting' : '',
              ].join(' ')}
            >
              {!folded && (
                <div className="seat-cards">
                  {p.isHero && hand.heroHoleCards.length > 0 ? (
                    hand.heroHoleCards.map((c, i) => <PlayingCard key={i} code={c} size="sm" />)
                  ) : (
                    <>
                      <div className="card-back" />
                      <div className="card-back" />
                    </>
                  )}
                </div>
              )}
              <div className="seat-name">
                {p.position}
                {p.isHero && <span className="hero-badge">自分</span>}
              </div>
              <div className="seat-stack">{formatAmount(p.startingStack - (state.contributed[p.id] ?? 0))}</div>
              {last && !folded && (
                <div className={`seat-action-badge ${BADGE_CLASS[last.type] ?? ''}`}>
                  {ACTION_LABELS[last.type]}
                  {last.amount ? ` ${formatAmount(last.amount)}` : ''}
                </div>
              )}
              {folded && <div className="seat-folded">FOLD</div>}
            </div>
          </div>
        )
      })}

      {seats.map(({ player: p, betCos, betSin }) => {
        // Chips stay on the table after a fold until the street ends.
        if (!visibleIds.has(p.id)) return null
        const bet = state.streetContrib[p.id] ?? 0
        if (bet <= 0) return null
        return (
          <div
            key={`bet-${p.id}`}
            className="seat-bet"
            style={{
              left: `calc(50% + ${betCos.toFixed(4)} * var(--bet-rx))`,
              top: `calc(50% + ${betSin.toFixed(4)} * var(--bet-ry))`,
            }}
          >
            <span className="seat-bet-chip" />
            {formatAmount(bet)}
          </div>
        )
      })}

      {dealerSeat && visibleIds.has(dealerSeat.player.id) && (
        <div
          className="dealer-button"
          style={{ left: `${dealerSeat.buttonX}%`, top: `${dealerSeat.buttonY}%` }}
          title="ディーラーボタン"
        >
          D
        </div>
      )}
    </div>
  )
}
