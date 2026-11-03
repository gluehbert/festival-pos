// Colours of the buzzer lanes, in lane order; the admin list uses the same
// ones, so a buzzer's dot there matches its lane on the screen.
export const LANE_COLORS: ReadonlyArray<{ name: string; border: string; bg: string; text: string }> = [
  { name: 'green', border: 'border-emerald-600', bg: 'bg-emerald-600', text: 'text-emerald-700' },
  { name: 'blue', border: 'border-blue-600', bg: 'bg-blue-600', text: 'text-blue-700' },
  { name: 'amber', border: 'border-amber-600', bg: 'bg-amber-600', text: 'text-amber-700' },
  { name: 'violet', border: 'border-violet-600', bg: 'bg-violet-600', text: 'text-violet-700' },
]

export function laneColor(lane: number): (typeof LANE_COLORS)[number] {
  return LANE_COLORS[(lane - 1) % LANE_COLORS.length]!
}
