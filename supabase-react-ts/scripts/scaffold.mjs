#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const skillRoot = path.resolve(scriptDir, '..')
const authStarterRoot = path.join(skillRoot, 'assets', 'auth-starter')

const usage = `Usage:
  node scripts/scaffold.mjs --name "Spotter" [--target .] [--purpose "..."] [--welcome-copy "..."]

Options:
  --name              Display name, required.
  --target            Project root to write into. Defaults to the current directory.
  --package-name      npm package name. Defaults to a hyphen-case display name.
  --package           Alias for --package-name.
  --project-id        Supabase local project_id. Defaults to an underscore-case display name.
  --purpose           Short README product phrase. Defaults to "a small MicroSaaS product".
  --welcome-copy      Protected home screen copy. Defaults to a generic feature-coming-soon sentence.
  --force             Allow copying into a non-empty target.
`

const parseArgs = () => {
  const parsed = {
    force: false,
    purpose: 'a small MicroSaaS product',
    target: process.cwd(),
    welcomeCopy: 'Your workspace is ready. Product features will take shape here.'
  }
  const args = process.argv.slice(2)

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--force') {
      parsed.force = true
      continue
    }

    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} needs a value.\n\n${usage}`)
    }

    if (arg === '--name') {
      parsed.name = value
    } else if (arg === '--target') {
      parsed.target = path.resolve(value)
    } else if (arg === '--package-name' || arg === '--package') {
      parsed.packageName = value
    } else if (arg === '--project-id') {
      parsed.projectId = value
    } else if (arg === '--purpose') {
      parsed.purpose = value
    } else if (arg === '--welcome-copy') {
      parsed.welcomeCopy = value
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }

    index += 1
  }

  if (!parsed.name?.trim()) {
    throw new Error(`--name is required.\n\n${usage}`)
  }

  return parsed
}

const wordsFrom = (value) => value
  .normalize('NFKD')
  .replace(/['’]/g, '')
  .match(/[A-Za-z0-9]+/g) ?? []

const toPackageName = (value) => {
  const packageName = wordsFrom(value).join('-').toLowerCase()

  if (!packageName) {
    throw new Error(`Could not derive a package name from "${value}".`)
  }

  return packageName
}

const toPascalName = (value) => {
  const pascal = wordsFrom(value)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('')

  if (!pascal) {
    throw new Error(`Could not derive a component prefix from "${value}".`)
  }

  return /^[A-Za-z]/.test(pascal) ? pascal : `App${pascal}`
}

const toProjectId = (value) => {
  const projectId = wordsFrom(value).join('_').toLowerCase()

  if (!projectId) {
    throw new Error(`Could not derive a Supabase project id from "${value}".`)
  }

  return projectId
}

const meaningfulEntries = async (target) => {
  if (!existsSync(target)) {
    return []
  }

  const allowed = new Set(['.git', '.DS_Store'])
  const entries = await readdir(target)

  return entries.filter((entry) => !allowed.has(entry))
}

const copyStarter = async (target, force) => {
  const entries = await meaningfulEntries(target)

  if (entries.length > 0 && !force) {
    throw new Error(`Target is not empty: ${target}\nExisting entries: ${entries.join(', ')}\nUse --force only when overwriting is intentional.`)
  }

  await mkdir(target, { recursive: true })

  for (const entry of await readdir(authStarterRoot)) {
    await cp(path.join(authStarterRoot, entry), path.join(target, entry), {
      recursive: true,
      force: true
    })
  }
}

const walk = async (root) => {
  const paths = []

  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    paths.push(fullPath)

    if (entry.isDirectory()) {
      paths.push(...await walk(fullPath))
    }
  }

  return paths
}

const renderValue = (value, replacements) => (
  replacements.reduce((current, [token, replacement]) => current.split(token).join(replacement), value)
)

const renderFiles = async (target, replacements) => {
  const paths = await walk(target)

  for (const filePath of paths) {
    const stats = await stat(filePath)
    if (!stats.isFile()) {
      continue
    }

    const text = await readFile(filePath, 'utf8')
    const rendered = renderValue(text, replacements)

    if (rendered !== text) {
      await writeFile(filePath, rendered)
    }
  }
}

const renderPaths = async (target, replacements) => {
  const paths = (await walk(target)).sort((left, right) => right.length - left.length)

  for (const currentPath of paths) {
    const dirname = path.dirname(currentPath)
    const basename = path.basename(currentPath)
    const renderedName = renderValue(basename, replacements)

    if (renderedName !== basename) {
      await rename(currentPath, path.join(dirname, renderedName))
    }
  }
}

const findUnrenderedTokens = async (target) => {
  const misses = []

  for (const currentPath of await walk(target)) {
    if (/__APP_[A-Z_]+__/.test(currentPath)) {
      misses.push(path.relative(target, currentPath))
    }

    const stats = await stat(currentPath)
    if (!stats.isFile()) {
      continue
    }

    const text = await readFile(currentPath, 'utf8')
    if (/__APP_[A-Z_]+__/.test(text)) {
      misses.push(path.relative(target, currentPath))
    }
  }

  return [...new Set(misses)]
}

const main = async () => {
  const args = parseArgs()
  const displayName = args.name.trim()
  const packageName = args.packageName?.trim() || toPackageName(displayName)
  const pascalName = toPascalName(displayName)
  const projectId = args.projectId?.trim() || toProjectId(displayName)
  const replacements = [
    ['__APP_DISPLAY_NAME__', displayName],
    ['__APP_PACKAGE_NAME__', packageName],
    ['__APP_PASCAL_NAME__', pascalName],
    ['__APP_SUPABASE_PROJECT_ID__', projectId],
    ['__APP_PURPOSE__', args.purpose.trim()],
    ['__APP_WELCOME_COPY__', args.welcomeCopy.trim()]
  ]

  await copyStarter(args.target, args.force)
  await renderFiles(args.target, replacements)
  await renderPaths(args.target, replacements)

  const misses = await findUnrenderedTokens(args.target)
  if (misses.length > 0) {
    throw new Error(`Unrendered template tokens remain:\n${misses.map((miss) => `- ${miss}`).join('\n')}`)
  }

  console.log(`Scaffolded ${displayName}`)
  console.log(`Target: ${args.target}`)
  console.log(`Package: ${packageName}`)
  console.log(`Supabase project_id: ${projectId}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
