// Spot what is new between two polls, to alert staff by sound / vibration.
// The first update only records the baseline: opening a screen is no news.

// IDs never seen before (new orders in the production queue). Remembers
// every ID, so an item that leaves and comes back (rollback) stays quiet.
export function createSeenTracker() {
  let seen: Set<string> | null = null
  return {
    update(ids: readonly string[]): string[] {
      if (!seen) {
        seen = new Set(ids)
        return []
      }
      const fresh = ids.filter((id) => !seen!.has(id))
      for (const id of fresh) seen.add(id)
      return fresh
    },
    reset(): void {
      seen = null
    },
  }
}

// Keys whose count grew since the last update (finished items per table).
// A key missing before counts as 0, so a new table with ready items alerts.
export function createIncreaseTracker() {
  let prev: Map<string, number> | null = null
  return {
    update(counts: ReadonlyMap<string, number>): string[] {
      const before = prev
      prev = new Map(counts)
      if (!before) return []
      return [...counts].filter(([key, n]) => n > (before.get(key) ?? 0)).map(([key]) => key)
    },
    reset(): void {
      prev = null
    },
  }
}

// Lanes that were empty and now hold a card: their person just got work.
// A lane refilled straight after "Done" was never empty between two polls,
// so it stays quiet; so does a lane that was not there before.
export function createLaneFillTracker() {
  let prev: Map<number, string | null> | null = null
  return {
    update(lanes: ReadonlyArray<{ lane: number; groupKey: string | null }>): number[] {
      const before = prev
      prev = new Map(lanes.map((l) => [l.lane, l.groupKey]))
      if (!before) return []
      return lanes.filter((l) => l.groupKey !== null && before.has(l.lane) && before.get(l.lane) === null).map((l) => l.lane)
    },
    reset(): void {
      prev = null
    },
  }
}
