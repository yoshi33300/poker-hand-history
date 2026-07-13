import { useEffect, useRef, useState } from 'react'
import { deleteHands, getAllHands, importHands, isHand } from '../db'
import { formatBB } from '../bb'
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
  const [status, setStatus] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setStatus(null)
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

  function handleExport() {
    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([JSON.stringify(hands, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poker-hand-history-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    setStatus(null)
    fileInputRef.current?.click()
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setStatus('ファイルの読み込みに失敗しました。JSON形式のバックアップファイルを選んでください。')
      return
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed]
    const valid = candidates.filter(isHand)
    if (valid.length === 0) {
      setStatus('有効なハンドが見つかりませんでした。')
      return
    }
    const skipped = candidates.length - valid.length
    const confirmMessage =
      `${valid.length}件のハンドを読み込みます。同じIDのハンドは上書きされます。続けますか？` +
      (skipped > 0 ? `\n(${skipped}件は形式が不正なためスキップされます)` : '')
    if (!window.confirm(confirmMessage)) return
    await importHands(valid)
    const refreshed = await getAllHands()
    setHands(refreshed)
    setStatus(`${valid.length}件のハンドを読み込みました。`)
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
          <>
            <button type="button" className="secondary" onClick={handleExport} disabled={hands.length === 0}>
              エクスポート
            </button>
            <button type="button" className="secondary" onClick={handleImportClick}>
              インポート
            </button>
            <button type="button" className="secondary" onClick={enterSelectionMode} disabled={hands.length === 0}>
              選択
            </button>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
      </div>
      {status && <p className="hand-list-status">{status}</p>}
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
