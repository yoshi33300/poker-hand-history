import { useEffect, useState } from 'react'
import { deleteHand, getAllHands } from '../db'
import { formatBB } from '../bb'
import { totalPot } from '../pot'
import type { Hand } from '../types'
import PlayingCard, { InlineCard } from './PlayingCard'

interface HandListProps {
  refreshToken: number
  onOpen: (hand: Hand) => void
}

export default function HandList({ refreshToken, onOpen }: HandListProps) {
  const [hands, setHands] = useState<Hand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAllHands().then((h) => {
      if (!cancelled) {
        setHands(h)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  async function handleDelete(id: string) {
    await deleteHand(id)
    setHands((prev) => prev.filter((h) => h.id !== id))
  }

  if (loading) return <p className="hand-list-empty">読み込み中...</p>
  if (hands.length === 0) return <p className="hand-list-empty">記録されたハンドはまだありません</p>

  return (
    <ul className="hand-list">
      {hands.map((hand) => {
        const hero = hand.players.find((p) => p.isHero)
        const board = [
          ...hand.streets.flop.board,
          ...hand.streets.turn.board,
          ...hand.streets.river.board,
        ]
        return (
          <li key={hand.id} className="hand-list-item">
            <button type="button" className="hand-list-item-main" onClick={() => onOpen(hand)}>
              <div className="hand-list-cards">
                {hand.heroHoleCards.length > 0 ? (
                  hand.heroHoleCards.map((c, i) => <PlayingCard key={i} code={c} size="sm" />)
                ) : (
                  <PlayingCard size="sm" />
                )}
              </div>
              <div className="hand-list-info">
                <div className="hand-list-title">{hand.title}</div>
                <div className="hand-list-meta">
                  {new Date(hand.createdAt).toLocaleString('ja-JP')} ・{' '}
                  {hand.stakes.currency}
                  {hand.stakes.sb}/{hand.stakes.currency}
                  {hand.stakes.bb} ・ {hero?.position ?? '-'}
                  {hero && ` ・ ${formatBB(hero.startingStack, hand.stakes.bb)}`}
                  {` ・ ポット ${totalPot(hand)}${hand.stakes.currency}`}
                </div>
                {board.length > 0 && (
                  <div className="hand-list-board">
                    <span className="hand-list-board-label">ボード</span>
                    {board.map((c) => (
                      <InlineCard key={c} code={c} />
                    ))}
                  </div>
                )}
              </div>
              <div className={`hand-list-result ${hand.result.netAmount >= 0 ? 'positive' : 'negative'}`}>
                {hand.result.netAmount >= 0 ? '+' : ''}
                {hand.result.netAmount}
                {hand.stakes.currency}
              </div>
            </button>
            <button type="button" className="hand-list-delete" onClick={() => handleDelete(hand.id)}>
              削除
            </button>
          </li>
        )
      })}
    </ul>
  )
}
