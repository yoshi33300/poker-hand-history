import { parseCard, suitInfo } from '../cards'
import type { CardCode } from '../types'
import SuitIcon from './SuitIcon'

interface PlayingCardProps {
  code?: CardCode
  size?: 'sm' | 'md' | 'lg'
}

// Compact rank + suit icon for inline text contexts (list rows, summaries).
export function InlineCard({ code }: { code: CardCode }) {
  const { rank, suit } = parseCard(code)
  const info = suitInfo(suit)
  return (
    <span className={`inline-card ${info.color}`}>
      {rank}
      <SuitIcon suit={suit} />
    </span>
  )
}

export default function PlayingCard({ code, size = 'md' }: PlayingCardProps) {
  if (!code) {
    return <div className={`playing-card empty size-${size}`} />
  }
  const { rank, suit } = parseCard(code)
  const info = suitInfo(suit)
  return (
    <div className={`playing-card size-${size} ${info.color}`}>
      <span className="index index-top">
        <span className="rank">{rank}</span>
        <SuitIcon suit={suit} className="index-suit" />
      </span>
      <SuitIcon suit={suit} className="suit-center" />
      <span className="index index-bottom">
        <span className="rank">{rank}</span>
        <SuitIcon suit={suit} className="index-suit" />
      </span>
    </div>
  )
}
