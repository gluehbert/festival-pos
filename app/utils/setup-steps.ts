import type { EventDto } from '~/../server/lib/contracts/admin'
import type { Setup, SetupStepKey } from '~/../server/lib/contracts/setup'

export type { SetupStepKey }

// The guided setup of an event: the workspace tabs in the order someone who
// sets up the festival once a year should go through them. Each step is one
// tab; the guide bar walks from one to the next ("Weiter"), and the overview
// lists them with what is done. The server keeps both (lib/event-setup.ts),
// so every admin device shows the same ticks. A step is done when the data
// shows it (logo or greeting, menu items, helpers let in, QR codes
// downloaded, a rehearsal held) or, where nothing shows it, when the admin
// went past it with "Weiter".

export interface SetupStep {
  key: SetupStepKey
  // Path below /admin/events/<id>; '' is the overview.
  path: string
  optional: boolean
}

export const SETUP_STEPS: readonly SetupStep[] = [
  { key: 'branding', path: '/branding', optional: false },
  { key: 'settings', path: '/settings', optional: false },
  { key: 'menu', path: '/menu', optional: false },
  { key: 'pricing', path: '/pricing', optional: true },
  { key: 'staff', path: '/staff', optional: false },
  { key: 'qr', path: '/qr-codes', optional: false },
  { key: 'start', path: '', optional: false },
]

// null while the setup is not loaded yet: nothing is ticked then.
export type SetupFacts = Setup | null

type SetupEvent = Pick<EventDto, 'isActive' | 'trialMode' | 'tableRangeFrom' | 'tableRangeTo'>

export function stepDone(key: SetupStepKey, ev: SetupEvent, setup: SetupFacts): boolean {
  if (!setup) return false
  const { facts } = setup
  const confirmed = setup.confirmed.includes(key)
  switch (key) {
    case 'branding': return facts.branded || confirmed
    case 'settings': return confirmed
    case 'menu': return facts.menuItems > 0
    case 'pricing': return facts.priceRules > 0 || confirmed
    case 'staff': return facts.helpers > 0 || confirmed
    // Only a downloaded PDF puts codes on the tables.
    case 'qr': return facts.qrDownloadedAt !== null
    // Live, out of rehearsal, and rehearsed at least once.
    case 'start': return ev.isActive && !ev.trialMode && facts.trialHeldAt !== null
  }
}

// One line of what the data says per step, for the overview: an i18n key
// below admin.setup.detail and its values, or null.
export function stepDetail(key: SetupStepKey, ev: SetupEvent, setup: SetupFacts): { key: string; values: Record<string, string | number> } | null {
  if (!setup) return null
  const { facts } = setup
  switch (key) {
    case 'branding': return facts.branded ? { key: 'branded', values: {} } : null
    case 'settings': return { key: 'tables', values: { from: ev.tableRangeFrom, to: ev.tableRangeTo } }
    case 'menu': return { key: 'menuItems', values: { n: facts.menuItems } }
    case 'pricing': return facts.priceRules > 0 ? { key: 'priceRules', values: { n: facts.priceRules } } : null
    case 'staff': return { key: 'helpers', values: { n: facts.helpers } }
    case 'qr': return facts.qrDownloadedAt ? { key: 'qrDownloaded', values: { date: facts.qrDownloadedAt } } : null
    case 'start':
      if (facts.trialHeldAt) return { key: 'trialHeld', values: { date: facts.trialHeldAt } }
      return ev.isActive && !ev.trialMode ? { key: 'noTrial', values: {} } : null
  }
}

// Which step a workspace path is, or null for tabs outside the guide.
export function stepAt(subPath: string): SetupStep | null {
  const clean = subPath.replace(/\/+$/, '')
  return SETUP_STEPS.find((s) => s.path === clean) ?? null
}

export function nextStep(key: SetupStepKey): SetupStep | null {
  const i = SETUP_STEPS.findIndex((s) => s.key === key)
  return SETUP_STEPS[i + 1] ?? null
}

export function prevStep(key: SetupStepKey): SetupStep | null {
  const i = SETUP_STEPS.findIndex((s) => s.key === key)
  return i > 0 ? SETUP_STEPS[i - 1]! : null
}

// Steps still open, optional ones not counted.
export function openSteps(ev: SetupEvent, setup: SetupFacts): SetupStepKey[] {
  return SETUP_STEPS.filter((s) => !s.optional && !stepDone(s.key, ev, setup)).map((s) => s.key)
}
