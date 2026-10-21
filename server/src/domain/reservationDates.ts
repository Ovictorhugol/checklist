/** Date-only arithmetic in UTC avoids daylight-saving and local timezone shifts. */
export function minimumReservationEndDate(startDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return ''
  const date = new Date(`${startDate}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) return ''
  date.setUTCDate(date.getUTCDate() + 1)
  const result = date.toISOString()
  return result.startsWith('+') ? '' : result.slice(0, 10)
}
