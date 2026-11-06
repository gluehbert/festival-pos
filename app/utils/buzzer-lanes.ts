import { LANE_COLOR_NAMES, type LaneColor } from '~/../server/lib/contracts/production'

// Classes of the lane colours. A buzzer's lane takes the buzzer's own colour
// (set in the admin list, which shows the same dots), so the colour on the
// screen matches the buzzer in the hand; other lanes take free defaults.
export const LANE_COLORS: Readonly<Record<LaneColor, { name: LaneColor; border: string; bg: string; text: string }>> = {
  green: { name: 'green', border: 'border-emerald-600', bg: 'bg-emerald-600', text: 'text-emerald-700' },
  blue: { name: 'blue', border: 'border-blue-600', bg: 'bg-blue-600', text: 'text-blue-700' },
  amber: { name: 'amber', border: 'border-amber-600', bg: 'bg-amber-600', text: 'text-amber-700' },
  violet: { name: 'violet', border: 'border-violet-600', bg: 'bg-violet-600', text: 'text-violet-700' },
  red: { name: 'red', border: 'border-red-600', bg: 'bg-red-600', text: 'text-red-700' },
  orange: { name: 'orange', border: 'border-orange-600', bg: 'bg-orange-600', text: 'text-orange-700' },
  pink: { name: 'pink', border: 'border-pink-600', bg: 'bg-pink-600', text: 'text-pink-700' },
  gray: { name: 'gray', border: 'border-neutral-600', bg: 'bg-neutral-600', text: 'text-neutral-700' },
}

export function laneColor(color: LaneColor): (typeof LANE_COLORS)[LaneColor] {
  return LANE_COLORS[color] ?? LANE_COLORS[LANE_COLOR_NAMES[0]]
}
