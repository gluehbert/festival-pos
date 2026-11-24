import type { Breadcrumb, ErrorEvent } from '@sentry/vue'

// Privacy filters for browser error reports (plugins/sentry.client.ts).

// A dropped connection at a festival is normal and handled on screen.
export const NETWORK_NOISE = [
  'Failed to fetch',
  'NetworkError when attempting to fetch resource.',
  'Load failed',
  'Network request failed',
  'The network connection was lost.',
]

export function stripQuery(url: string): string {
  const i = url.search(/[?#]/)
  return i === -1 ? url : url.slice(0, i)
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const data = crumb.data
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = stripQuery(data[key] as string)
    }
  }
  return crumb
}

export function scrubBrowserEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) event.request.url = stripQuery(event.request.url)
  if (event.request?.headers?.Referer) event.request.headers.Referer = stripQuery(event.request.headers.Referer)
  delete event.user
  return event
}
