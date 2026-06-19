import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reservedTopLevelNames = new Set(['.git', 'node_modules', 'scripts'])

const usage = `Usage:
  node scripts/install-skills.mjs [--dry-run] [--list] [--target <path>] [skill-name ...]

Examples:
  node scripts/install-skills.mjs
  node scripts/install-skills.mjs supabase-react-ts
  node scripts/install-skills.mjs --dry-run
  node scripts/install-skills.mjs --target ~/.codex/skills supabase-react-ts`

const expandHome = (path) => (
  path === '~' || path.startsWith('~/')
    ? join(homedir(), path.slice(2))
    : path
)

const parseArgs = (args) => {
  const parsed = {
    dryRun: false,
    list: false,
    skillNames: [],
    target: process.env.CODEX_HOME
      ? join(process.env.CODEX_HOME, 'skills')
      : join(homedir(), '.codex', 'skills')
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      console.log(usage)
      process.exit(0)
    }

    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }

    if (arg === '--list') {
      parsed.list = true
      continue
    }

    if (arg === '--target') {
      const target = args[index + 1]

      if (!target) {
        throw new Error('--target requires a path.')
      }

      parsed.target = expandHome(target)
      index += 1
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }

    parsed.skillNames.push(arg)
  }

  parsed.target = resolve(parsed.target)

  return parsed
}

const isSkillName = (name) => /^[a-z0-9][a-z0-9-]*$/.test(name)

const readSkillFrontmatterName = async (skillPath) => {
  const skill = await readFile(join(skillPath, 'SKILL.md'), 'utf8')
  const match = skill.match(/^---\n([\s\S]*?)\n---/)

  if (!match) {
    throw new Error(`${skillPath} has no YAML frontmatter.`)
  }

  const nameMatch = match[1].match(/^name:\s*([a-z0-9-]+)\s*$/m)

  if (!nameMatch) {
    throw new Error(`${skillPath} has no valid frontmatter name.`)
  }

  return nameMatch[1]
}

const discoverSkills = async () => {
  const entries = await readdir(repoRoot, { withFileTypes: true })
  const skills = []

  for (const entry of entries) {
    if (!entry.isDirectory() || reservedTopLevelNames.has(entry.name)) {
      continue
    }

    if (!isSkillName(entry.name)) {
      continue
    }

    const skillPath = join(repoRoot, entry.name)

    if (!existsSync(join(skillPath, 'SKILL.md'))) {
      continue
    }

    const frontmatterName = await readSkillFrontmatterName(skillPath)

    if (frontmatterName !== entry.name) {
      throw new Error(`${entry.name}/SKILL.md declares name ${frontmatterName}. Folder and skill name must match.`)
    }

    skills.push({
      name: entry.name,
      path: skillPath
    })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

const requireInsideTarget = (targetRoot, path) => {
  const relative = resolve(path).slice(resolve(targetRoot).length)

  if (!relative.startsWith('/')) {
    throw new Error(`Refusing to operate outside target root: ${path}`)
  }
}

const backupExistingSkill = async (targetRoot, skillName, dryRun) => {
  const targetPath = join(targetRoot, skillName)

  if (!existsSync(targetPath)) {
    return undefined
  }

  const backupRoot = join(targetRoot, '.install-backups', new Date().toISOString().replace(/[:.]/g, '-'))
  const backupPath = join(backupRoot, skillName)

  requireInsideTarget(targetRoot, targetPath)
  requireInsideTarget(targetRoot, backupPath)

  if (dryRun) {
    return backupPath
  }

  await mkdir(backupRoot, { recursive: true })
  await rename(targetPath, backupPath)

  return backupPath
}

const installSkill = async (targetRoot, skill, dryRun) => {
  const targetPath = join(targetRoot, skill.name)
  const existingBackup = await backupExistingSkill(targetRoot, skill.name, dryRun)

  if (dryRun) {
    console.log(existingBackup
      ? `DRY ${skill.name}: would back up ${targetPath} to ${existingBackup}, then install`
      : `DRY ${skill.name}: would install to ${targetPath}`)
    return
  }

  await mkdir(targetRoot, { recursive: true })
  await cp(skill.path, targetPath, {
    recursive: true,
    errorOnExist: true,
    force: false
  })

  console.log(existingBackup
    ? `OK  ${skill.name}: installed; previous copy backed up to ${existingBackup}`
    : `OK  ${skill.name}: installed`)
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const skills = await discoverSkills()

  if (args.list) {
    for (const skill of skills) {
      console.log(skill.name)
    }

    return
  }

  const selectedSkills = args.skillNames.length
    ? skills.filter((skill) => args.skillNames.includes(skill.name))
    : skills
  const missing = args.skillNames.filter((skillName) => !skills.some((skill) => skill.name === skillName))

  if (missing.length) {
    throw new Error(`Unknown skill(s): ${missing.join(', ')}`)
  }

  if (selectedSkills.length === 0) {
    throw new Error(`No skills found in ${repoRoot}.`)
  }

  const targetStats = existsSync(args.target) ? await stat(args.target) : undefined

  if (targetStats && !targetStats.isDirectory()) {
    throw new Error(`Target is not a directory: ${args.target}`)
  }

  for (const skill of selectedSkills) {
    if (basename(skill.path) !== skill.name) {
      throw new Error(`Unexpected skill path for ${skill.name}.`)
    }

    await installSkill(args.target, skill, args.dryRun)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
