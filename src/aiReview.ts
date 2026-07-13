import type { Hand } from './types'
import { buildHandText } from './shareText'
import { formatPosition } from './players'

/** The hand history text plus context the share format omits (stacks, result). */
function buildReviewInput(hand: Hand): string {
  const lines = [buildHandText(hand)]
  lines.push('')
  lines.push(
    `スタック: ${hand.players.map((p) => `${formatPosition(p.position, hand.stakes.straddle)} ${p.startingStack}`).join(' / ')}`,
  )
  const net = hand.result.netAmount
  lines.push(`結果: ${net >= 0 ? '+' : ''}${net}${hand.stakes.currency} (HERO)`)
  return lines.join('\n')
}

type ReviewErrorCode = 'daily_limit' | 'upstream_error' | 'network' | 'unknown'

export class ReviewError extends Error {
  code: ReviewErrorCode

  constructor(code: ReviewErrorCode) {
    super(code)
    this.code = code
  }
}

export async function reviewHand(
  hand: Hand,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handText: buildReviewInput(hand) }),
      signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ReviewError('network')
  }

  if (!response.ok) {
    if (response.status === 429) throw new ReviewError('daily_limit')
    if (response.status === 502 || response.status === 503) throw new ReviewError('upstream_error')
    throw new ReviewError('unknown')
  }

  const reader = response.body?.getReader()
  if (!reader) throw new ReviewError('unknown')
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onDelta(decoder.decode(value, { stream: true }))
  }
}

/** Maps errors to a short Japanese message for the UI. */
export function describeReviewError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  if (error instanceof ReviewError) {
    switch (error.code) {
      case 'daily_limit':
        return '本日の利用上限に達しました。また明日お試しください。'
      case 'upstream_error':
        return 'AIレビューサービスが一時的に利用できません。しばらくしてから再試行してください。'
      case 'network':
        return 'サーバーに接続できません。レビューサーバーが起動しているか確認してください。'
      default:
        return 'レビューの取得に失敗しました。'
    }
  }
  return 'レビューの取得に失敗しました。'
}
