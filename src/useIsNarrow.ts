import { useEffect, useState } from 'react'

/** Matches the mobile CSS breakpoint; drives the drum-roll picker UX. */
export function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 620px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 620px)')
    const listener = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [])
  return narrow
}
