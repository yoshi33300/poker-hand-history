import type { Suit } from '../types'

// Classic print-style silhouettes (Bicycle-deck proportions).
const PATHS: Record<'s' | 'h' | 'd', string> = {
  s: 'M12 1.5C10.5 4 3.5 9.5 3.5 14C3.5 17.5 6.2 19.6 9 19.6C10.2 19.6 11.2 19.1 11.8 18.3C11.7 20.5 10.8 22 8.8 23.2H15.2C13.2 22 12.3 20.5 12.2 18.3C12.8 19.1 13.8 19.6 15 19.6C17.8 19.6 20.5 17.5 20.5 14C20.5 9.5 13.5 4 12 1.5Z',
  h: 'M12 21.3C12 21.3 3.2 14.6 3.2 8.6C3.2 5.5 5.7 3 8.8 3C10.3 3 11.6 3.7 12 4.6C12.4 3.7 13.7 3 15.2 3C18.3 3 20.8 5.5 20.8 8.6C20.8 14.6 12 21.3 12 21.3Z',
  d: 'M12 1.2L19.3 12L12 22.8L4.7 12Z',
}

function ClubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="6.6" r="4.7" />
      <circle cx="6.9" cy="13.6" r="4.7" />
      <circle cx="17.1" cy="13.6" r="4.7" />
      <path d="M12 11C11.85 16 11 20.3 8.3 22.7H15.7C13 20.3 12.15 16 12 11Z" />
    </svg>
  )
}

interface SuitIconProps {
  suit: Suit
  className?: string
}

export default function SuitIcon({ suit, className }: SuitIconProps) {
  if (suit === 'c') return <ClubIcon className={className} />
  return (
    <svg viewBox="0 0 24 24" className={className} width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d={PATHS[suit]} />
    </svg>
  )
}
