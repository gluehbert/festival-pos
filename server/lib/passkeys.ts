import process from 'node:process'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { getRequestURL, type H3Event } from 'h3'
import type { Db } from '../db/client'
import { staff } from '../db/schema'
import { staffPasskeys, webauthnChallenges } from '../db/schema-auth'
import { writeAudit } from './audit'
import { AppError } from './errors'
import { PasskeyDtoSchema, type PasskeyDto } from './contracts/passkeys'

// A challenge must be answered within this time, and only once.
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const RP_NAME = 'Festival POS'

export interface RelyingParty {
  rpID: string
  origin: string
}

// A passkey belongs to a domain (the RP ID). By default that is the host the
// app is served from, so every Vercel preview has its own passkeys.
// WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN pin it, e.g. for a shared parent domain.
// The host comes from the Host header only (a client can send any
// X-Forwarded-Host); the proxy's X-Forwarded-Proto makes the origin https.
export function relyingParty(event: H3Event): RelyingParty {
  const url = getRequestURL(event, { xForwardedProto: true })
  return {
    rpID: process.env.WEBAUTHN_RP_ID || url.hostname,
    origin: process.env.WEBAUTHN_ORIGIN || url.origin,
  }
}

export type ChallengeKind = 'register' | 'login'

export async function saveChallenge(db: Db, challenge: string, kind: ChallengeKind, staffId: string | null): Promise<void> {
  await db.insert(webauthnChallenges).values({
    challenge,
    kind,
    staffId,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  })
}

// Deletes the challenge and says whether it was valid: an answer can never be
// replayed, and a registration challenge only counts for whoever asked for it.
export async function consumeChallenge(db: Db, challenge: string, kind: ChallengeKind, staffId: string | null): Promise<boolean> {
  const deleted = await db
    .delete(webauthnChallenges)
    .where(and(
      eq(webauthnChallenges.challenge, challenge),
      eq(webauthnChallenges.kind, kind),
      staffId ? eq(webauthnChallenges.staffId, staffId) : isNull(webauthnChallenges.staffId),
      gt(webauthnChallenges.expiresAt, new Date()),
    ))
    .returning({ challenge: webauthnChallenges.challenge })
  return deleted.length > 0
}

export async function deleteExpiredChallenges(db: Db, now = new Date()): Promise<void> {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now))
}

export function toPasskeyDto(row: typeof staffPasskeys.$inferSelect): PasskeyDto {
  return PasskeyDtoSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.createdAt).toISOString(),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
  })
}

export async function listPasskeys(db: Db, staffId: string): Promise<PasskeyDto[]> {
  const rows = await db.select().from(staffPasskeys).where(eq(staffPasskeys.staffId, staffId)).orderBy(staffPasskeys.createdAt)
  return rows.map(toPasskeyDto)
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Deletes a passkey of ownerId (404 otherwise) with its audit entry; with
// revokeSessions every session of the owner ends. Returns the owner's row.
export async function removePasskey(
  db: Db,
  opts: { passkeyId: string; ownerId: string; actorId: string; revokeSessions: boolean },
): Promise<typeof staff.$inferSelect> {
  return await db.transaction(async (tx) => {
    const removed = (await tx
      .delete(staffPasskeys)
      .where(and(eq(staffPasskeys.id, opts.passkeyId), eq(staffPasskeys.staffId, opts.ownerId)))
      .returning())[0]
    if (!removed) throw new AppError('NOT_FOUND', 404, 'Passkey not found')
    const owner = opts.revokeSessions
      ? (await tx.update(staff).set({ sessionVersion: sql`${staff.sessionVersion} + 1` }).where(eq(staff.id, opts.ownerId)).returning())[0]!
      : (await tx.select().from(staff).where(eq(staff.id, opts.ownerId)).limit(1))[0]!
    await writeAudit(tx, {
      action: 'passkey_remove',
      staffId: opts.actorId,
      targetKind: 'staff',
      targetId: opts.ownerId,
      payload: { passkeyId: removed.id, name: removed.name, sessionsRevoked: opts.revokeSessions },
    })
    return owner
  })
}
