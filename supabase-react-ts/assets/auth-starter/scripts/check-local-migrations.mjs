#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')

const splitRow = (line) => line
  .split(/[|│]/)
  .map((cell) => cell.replaceAll('`', '').trim())

export const parseMigrationList = (output) => {
  const lines = output.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => {
    const cells = splitRow(line).map((cell) => cell.toLowerCase())
    return cells.includes('local') && cells.includes('remote')
  })

  if (headerIndex < 0) {
    throw new Error('Supabase migration output did not contain the expected Local/Remote table.')
  }

  const header = splitRow(lines[headerIndex]).map((cell) => cell.toLowerCase())
  const localIndex = header.indexOf('local')
  const databaseIndex = header.indexOf('remote')
  const migrations = []

  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitRow(line)
    const local = cells[localIndex] ?? ''
    const database = cells[databaseIndex] ?? ''

    if (!/^\d+$/.test(local) && !/^\d+$/.test(database)) {
      continue
    }

    migrations.push({
      database: /^\d+$/.test(database) ? database : undefined,
      local: /^\d+$/.test(local) ? local : undefined
    })
  }

  return migrations
}

export const assertLocalMigrationAlignment = (migrations) => {
  const databaseAhead = migrations
    .filter(({ database, local }) => database && !local)
    .map(({ database }) => database)
  const checkoutAhead = migrations
    .filter(({ database, local }) => local && !database)
    .map(({ local }) => local)

  if (databaseAhead.length === 0 && checkoutAhead.length === 0) {
    return
  }

  const details = []
  if (databaseAhead.length > 0) {
    details.push(`applied only in the database: ${databaseAhead.join(', ')}`)
  }
  if (checkoutAhead.length > 0) {
    details.push(`present only in this checkout: ${checkoutAhead.join(', ')}`)
  }

  throw new Error([
    `Local Supabase migration drift detected (${details.join('; ')}).`,
    'Service startup can restore persistent database state from another branch; it does not prove schema alignment.',
    'If local data is disposable, run npm run supabase:reset, then rerun this check.',
    'If local data must be preserved, do not reset it. Stop and choose a non-destructive reconciliation or isolated stack.'
  ].join('\n'))
}

export const checkLocalMigrationAlignment = ({ runCommand } = {}) => {
  const supabaseCli = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'supabase.cmd' : 'supabase'
  )
  const result = (runCommand ?? spawnSync)(
    supabaseCli,
    ['migration', 'list', '--local', '--output-format', 'text'],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )

  if (result.error || result.status !== 0) {
    throw new Error([
      'Could not inspect the local Supabase migration history.',
      'Run npm install and npm run get-going, then retry this check.'
    ].join('\n'))
  }

  const migrations = parseMigrationList(result.stdout)
  assertLocalMigrationAlignment(migrations)
  return migrations
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const migrations = checkLocalMigrationAlignment()
    console.log(`Local Supabase migration history matches this checkout (${migrations.length} migration rows).`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
