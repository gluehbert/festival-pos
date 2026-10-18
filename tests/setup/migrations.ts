import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(import.meta.dirname, '../../server/db/migrations')

// All committed migrations, in journal order, concatenated.
export function readAllMigrationsSql(): string {
  const journal = JSON.parse(readFileSync(resolve(dir, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  return journal.entries
    .map((e) => readFileSync(resolve(dir, `${e.tag}.sql`), 'utf8'))
    .join('\n--> statement-breakpoint\n')
}
