import type { EventDto } from '~/../server/lib/contracts/admin'

// The guided setup of an event: the workspace tabs in the order someone who
// sets up the festival once a year should go through them. Each step is one
// tab; the guide bar walks from one to the next ("Weiter"), and the overview
// lists them with what is done. A step is done when the data shows it
// (items on the menu, a rehearsal held) or, where nothing shows it, when the
// admin went past it with "Weiter".

export type SetupStepKey = 'branding' | 'settings' | 'menu' | 'pricing' | 'staff' | 'qr' | 'start'

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

export interface SetupFacts {
  // null while the menu is not loaded yet.
  menuCount: number | null
  // Steps the admin went past with "Weiter".
  confirmed: ReadonlySet<SetupStepKey>
}

type SetupEvent = Pick<EventDto, 'isActive' | 'trialMode' | 'trialOrders' | 'activatedAt'>

export function stepDone(key: SetupStepKey, ev: SetupEvent, facts: SetupFacts): boolean {
  if (key === 'menu') return (facts.menuCount ?? 0) > 0
  // The festival has started for real: live and out of rehearsal.
  if (key === 'start') return ev.isActive && !ev.trialMode
  return facts.confirmed.has(key)
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
export function openSteps(ev: SetupEvent, facts: SetupFacts): SetupStepKey[] {
  return SETUP_STEPS.filter((s) => !s.optional && !stepDone(s.key, ev, facts)).map((s) => s.key)
}
