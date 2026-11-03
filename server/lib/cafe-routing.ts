import type { Event } from '../db/schema'

type Station = 'kitchen' | 'bar' | 'cafe'

// After the Kaffeeklatsch the cafe counter closes and the kitchen serves
// coffee and cake. The station is fixed on the order line when it is booked,
// so items already at the counter stay there until it has finished them.
export function routeStation(station: Station, ev: Pick<Event, 'cafeClosed'>): Station {
  return station === 'cafe' && ev.cafeClosed ? 'kitchen' : station
}

// Menu stations whose articles a production station looks after right now
// (orders and "sold out"): with the counter closed the kitchen takes the cafe's.
export function servedStations(station: Station, ev: Pick<Event, 'cafeClosed'>): Station[] {
  return station === 'kitchen' && ev.cafeClosed ? ['kitchen', 'cafe'] : [station]
}
