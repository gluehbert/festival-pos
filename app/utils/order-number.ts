// Short order number for people: the last 6 characters of the order UUID in
// upper case, e.g. "#3FA9C2". Guest, kitchen/bar and service all show the
// same one, so "Bestellung 3FA9C2" means the same order everywhere. Always
// shown next to the table: two open orders sharing it are practically ruled
// out (16.7 million values), and no counter or extra column is needed.
export function shortOrderNo(orderId: string): string {
  return orderId.replace(/-/g, '').slice(-6).toUpperCase()
}
