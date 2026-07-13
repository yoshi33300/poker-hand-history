import { useEffect, useState } from 'react'
import { deleteHands, getAllHands } from '../db'
import { formatBB } from '../bb'
import { formatPosition } from '../players'
import { totalPot } from '../pot'
import type { Hand } from '../types'
import PlayingCard, { InlineCard } from './PlayingCard'
import TrashIcon from './TrashIcon'

interface HandListProps {
  refreshToken: number
  onOpen: (hand: Hand) => void
}

export default function HandList({ refreshToken, onOpen }: HandListProps) {
  const [hands, setHands] = useState<Hand[]>([])
  const [loading, setLoading] = useState(true)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

  function enterSelectionMode() {
    setSelectionMode(true)
    setSelectedIds(new Set())
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = hands.length > 0 && selectedIds.size === hands.length

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(hands.map((h) => h.id)))
  }

  async function handleDeleteSelected() {
    const count = selectedIds.size
    if (count === 0) return
    if (!window.confirm(`${count}件のハンドを削除します。この操作は元に戻せません。続けますか？`)) return
    await deleteHands([...selectedIds])
    setHands((prev) => prev.filter((h) => !selectedIds.has(h.id)))
    exitSelectionMode()
  }

  return (
    <div className="hand-list-page">
      <div className="hand-list-toolbar">
        {selectionMode ? (
          <>
            <span className="hand-list-selection-count">{selectedIds.size}件選択中</span>
            <button type="button" className="secondary" onClick={toggleSelectAll}>
              {allSelected ? '選択解除' : '全選択'}
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              aria-label="選択したハンドを削除"
              title="選択したハンドを削除"
            >
              <TrashIcon />
            </button>
            <button type="button" className="secondary" onClick={exitSelectionMode}>
              キャンセル
            </button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={enterSelectionMode} disabled={hands.length === 0}>
            選択
          </button>
        )}
      </div>
      {loading ? (
        <p className="hand-list-empty">読み込み中...</p>
      ) : hands.length === 0 ? (
        <p className="hand-list-empty">記録されたハンドはまだありません</p>
      ) : (
        <ul className="hand-list">
          {hands.map((hand) => {
            const hero = hand.players.find((p) => p.isHero)
            const board = [
              ...hand.streets.flop.board,
              ...hand.streets.turn.board,
              ...hand.streets.river.board,
            ]
            const selected = selectedIds.has(hand.id)
            return (
              <li key={hand.id} className={`hand-list-item ${selectionMode && selected ? 'selected' : ''}`}>
                {selectionMode && (
                  <input
                    type="checkbox"
                    className="hand-select-checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(hand.id)}
                    aria-label={`${hand.title}を選択`}
                  />
                )}
                <button
                  type="button"
                  className="hand-list-item-main"
                  onClick={() => (selectionMode ? toggleSelect(hand.id) : onOpen(hand))}
                >
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
                      {hand.stakes.bb} ・ {hero ? formatPosition(hero.position, hand.stakes.straddle) : '-'}
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
