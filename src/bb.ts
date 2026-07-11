/** Format a chip amount as a BB multiple, e.g. 194 chips at bb=2 -> "97bb". */
export function formatBB(chips: number, bb: number): string {
  if (!bb) return `${chips}`
  const value = chips / bb
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
  return `${text}bb`
}
