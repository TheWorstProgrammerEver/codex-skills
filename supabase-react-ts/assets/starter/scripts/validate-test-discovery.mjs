import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')

const globToRegex = (glob) => {
  let pattern = '^'

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]

    if (character === '*') {
      if (glob[index + 1] === '*') {
        if (glob[index + 2] === '/') {
          pattern += '(?:.*/)?'
          index += 2
        } else {
          pattern += '.*'
          index += 1
        }
      } else {
        pattern += '[^/]*'
      }
      continue
    }

    if (character === '{') {
      const closingIndex = glob.indexOf('}', index + 1)
      if (closingIndex === -1) {
        throw new Error(`Unsupported Vitest include glob: ${glob}`)
      }

      const alternatives = glob.slice(index + 1, closingIndex).split(',')
      if (alternatives.some((alternative) => !alternative)) {
        throw new Error(`Unsupported Vitest include glob: ${glob}`)
      }

      pattern += `(?:${alternatives.map(escapeRegex).join('|')})`
      index = closingIndex
      continue
    }

    pattern += character === '?' ? '[^/]' : escapeRegex(character)
  }

  return new RegExp(`${pattern}$`)
}

const readIncludeGlobs = async (starterRoot) => {
  const config = await readFile(path.join(starterRoot, 'vitest.config.ts'), 'utf8')
  const include = config.match(/include\s*:\s*\[([\s\S]*?)\]/)?.[1]

  if (!include) {
    throw new Error('vitest.config.ts must declare a test.include array')
  }

  const globs = [...include.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
  if (globs.length === 0) {
    throw new Error('vitest.config.ts test.include must contain at least one glob')
  }

  return globs
}

const walkFiles = async (root) => {
  const files = []

  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

export const validateTestDiscovery = async (starterRoot = process.cwd()) => {
  const unitRoot = path.join(starterRoot, 'tests', 'unit')
  const testFiles = (await walkFiles(unitRoot))
    .map((filePath) => path.relative(starterRoot, filePath).split(path.sep).join('/'))
    .filter((filePath) => /\.test\.[^/]+$/.test(filePath))
    .sort()

  if (testFiles.length === 0) {
    throw new Error('No committed unit test files were found under tests/unit')
  }

  const includeGlobs = await readIncludeGlobs(starterRoot)
  const includePatterns = includeGlobs.map(globToRegex)
  const skippedFiles = testFiles.filter((filePath) => (
    !includePatterns.some((includePattern) => includePattern.test(filePath))
  ))

  if (skippedFiles.length > 0) {
    throw new Error([
      'Vitest test.include does not discover every committed unit test:',
      ...skippedFiles.map((filePath) => `- ${filePath}`)
    ].join('\n'))
  }

  return { includeGlobs, testFiles }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const result = await validateTestDiscovery()
    console.log(`Vitest discovery covers ${result.testFiles.length} committed unit test files.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
