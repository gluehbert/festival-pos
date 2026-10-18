// Downloads one report of an event as a CSV file through the browser.
export async function downloadReportCsv(eventId: string, type: string): Promise<void> {
  const res = await fetch(`/api/admin/events/${eventId}/reports?type=${encodeURIComponent(type)}&format=csv`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
