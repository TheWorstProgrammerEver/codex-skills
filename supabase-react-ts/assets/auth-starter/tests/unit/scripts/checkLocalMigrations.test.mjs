import { describe, expect, it } from 'vitest'
import {
  assertLocalMigrationAlignment,
  checkLocalMigrationAlignment,
  parseMigrationList
} from '../../../scripts/check-local-migrations.mjs'

const migrationTable = ({ checkoutHasSecondMigration, databaseHasSecondMigration }) => `
        LOCAL      │     REMOTE     │     TIME (UTC)
  ─────────────────┼────────────────┼──────────────────────
   20260619000000 │ 20260619000000 │ 2026-06-19 00:00:00
   ${checkoutHasSecondMigration ? '20260813000000' : '              '} │ ${databaseHasSecondMigration ? '20260813000000' : '              '} │ 2026-08-13 00:00:00
`

describe('local migration alignment', () => {
  it('passes on branch A when checkout and database contain its extra migration', () => {
    const migrations = parseMigrationList(migrationTable({
      checkoutHasSecondMigration: true,
      databaseHasSecondMigration: true
    }))

    expect(() => assertLocalMigrationAlignment(migrations)).not.toThrow()
  })

  it('fails after switching to branch B while the database retains branch A migration history', () => {
    const runCommand = () => ({
      status: 0,
      stdout: migrationTable({
        checkoutHasSecondMigration: false,
        databaseHasSecondMigration: true
      })
    })

    expect(() => checkLocalMigrationAlignment({ runCommand })).toThrow(
      /applied only in the database: 20260813000000/
    )
  })

  it('also fails when a checkout migration has not been applied', () => {
    const migrations = parseMigrationList(migrationTable({
      checkoutHasSecondMigration: true,
      databaseHasSecondMigration: false
    }))

    expect(() => assertLocalMigrationAlignment(migrations)).toThrow(
      /present only in this checkout: 20260813000000/
    )
  })

  it('fails closed when the CLI output shape is not recognized', () => {
    expect(() => parseMigrationList('unexpected output')).toThrow(
      /expected Local\/Remote table/
    )
  })
})
