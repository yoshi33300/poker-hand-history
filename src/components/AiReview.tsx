import { useEffect, useRef, useState } from 'react'
import type { Hand } from '../types'
import { describeReviewError, reviewHand } from '../aiReview'

interface AiReviewProps {
  hand: Hand
}

export default function AiReview({ hand }: AiReviewProps) {
  const [review, setReview] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Cancel an in-flight request when leaving the screen.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function runReview() {
    setReview('')
    setError('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await reviewHand(hand, (delta) => setReview((prev) => prev + delta), controller.signal)
    } catch (e) {
      const message = describeReviewError(e)
      if (message) setError(message)
    } finally {
      setLoading(false)
    }
  }

  function stopReview() {
    abortRef.current?.abort()
  }

  return (
    <div className="ai-review">
      <div className="ai-review-header">
        <h3>AIレビュー</h3>
      </div>
      <p className="ai-review-note">Claudeがこのハンドをコーチ目線で講評します。</p>
      <div className="ai-review-actions">
        {loading ? (
          <button type="button" onClick={stopReview}>
            中止
          </button>
        ) : (
          <button type="button" className="primary" onClick={runReview}>
            {review ? 'もう一度レビュー' : 'このハンドをレビュー'}
          </button>
        )}
        {loading && <span className="ai-review-status">Claudeが分析中...</span>}
      </div>
      {error && <p className="ai-review-error">{error}</p>}
      {review && <div className="ai-review-text">{review}</div>}
    </div>
  )
}
