// A guest PIN nobody has to make up: six characters guests can type from a
// sign without mix-ups (no 0/O, 1/I/L). Fits the server's /^[A-Z0-9]{4,10}$/.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateEventPin(length = 6): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
