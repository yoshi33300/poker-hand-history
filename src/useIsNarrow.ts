import { useEffect, useState } from 'react'

/** Matches the mobile CSS breakpoint; drives the drum-roll picker UX. */
export function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 620px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 620px)')
    const update = () => setNarrow(mq.matches)
    // Some environments (embedded webviews) don't fire matchMedia change
    // events reliably — window resize covers them and device rotation.
    mq.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return narrow
}
