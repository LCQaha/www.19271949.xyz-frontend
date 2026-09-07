import { constants } from 'node:fs'
import { access, cp, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { releaseVersion } from './lib/release-version.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const wwwRoot = join(projectRoot, 'www')
const outputRoot = join(projectRoot, 'release')
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--expect-tag')) throw new Error('Usage: npm run release -- [--expect-tag vX.Y.Z]')
const manifest = JSON.parse(await readFile(join(wwwRoot, 'package.json'), 'utf8'))
const { version, tag, archiveName } = releaseVersion(manifest.version, args[1])
const finalDirectory = join(outputRoot, tag)
const archive = join(outputRoot, archiveName)
const checksum = `${archive}.sha256`
const lock = join(outputRoot, `.lock-${tag}`)
const stage = join(outputRoot, `.tmp-${tag}-${randomUUID()}`)
const stagedArchive = `${stage}.tar.gz`
const stagedChecksum = `${stagedArchive}.sha256`

async function exists(path) {
  try { await access(path, constants.F_OK); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

// Recursive cleanup is restricted to this run's staging directory inside release/.
function assertOutputChild(path) {
  if (dirname(resolve(path)) !== resolve(outputRoot)) throw new Error(`Refusing operation outside ${outputRoot}`)
}

async function collectFiles(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in a release: ${name}`)
    if (['node_modules', '.git'].includes(entry.name) || entry.name.startsWith('.env')) throw new Error(`Unexpected private/build input: ${name}`)
    if (entry.isDirectory()) files.push(...await collectFiles(join(directory, entry.name), name))
    else if (entry.isFile()) files.push(name)
  }
  return files.sort()
}

await mkdir(outputRoot, { recursive: true })
await mkdir(lock).catch(error => {
  if (error.code === 'EEXIST') throw new Error(`Release ${tag} is locked. Check for an active build before removing ${lock}.`)
  throw error
})
let publishedArchive = false
let publishedChecksum = false
let publishedDirectory = false
try {
  for (const destination of [finalDirectory, archive, checksum]) {
    assertOutputChild(destination)
    if (await exists(destination)) throw new Error(`${destination} already exists. Released versions are immutable; increment the version instead of overwriting it.`)
  }
  execFileSync('tar', ['--version'], { stdio: 'ignore' })
  await build({ root: wwwRoot, configFile: join(wwwRoot, 'vite.config.js') })
  const dist = join(wwwRoot, 'dist')
  for (const required of ['index.html', '404.html', 'assets', 'icons', 'licenses', 'THIRD_PARTY_NOTICES.md']) await access(join(dist, required))
  await collectFiles(dist)
  assertOutputChild(stage)
  await cp(dist, stage, { recursive: true, force: false, errorOnExist: true })
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', windowsHide: true })
  const commit = git.status === 0 ? git.stdout.trim() : null
  await writeFile(join(stage, 'version.json'), `${JSON.stringify({ name: '19271949.xyz', version, tag, builtAt: new Date().toISOString(), commit }, null, 2)}\n`)
  const files = await collectFiles(stage)
  const manifestLines = await Promise.all(files.map(async file => `${createHash('sha256').update(await readFile(join(stage, file))).digest('hex')}  ${file}`))
  await writeFile(join(stage, 'manifest.sha256'), `${manifestLines.join('\n')}\n`)
  execFileSync('tar', ['-czf', stagedArchive, '-C', stage, '.'], { stdio: 'inherit', windowsHide: true })
  const digest = createHash('sha256').update(await readFile(stagedArchive)).digest('hex')
  await writeFile(stagedChecksum, `${digest}  ${archiveName}\n`)
  await rename(stagedArchive, archive)
  publishedArchive = true
  await rename(stagedChecksum, checksum)
  publishedChecksum = true
  // Publish the mountable directory only after the archive and checksum are ready.
  await rename(stage, finalDirectory)
  publishedDirectory = true
  console.log(`\nRelease ready: ${finalDirectory}\nArchive: ${archive}\nSHA256: ${digest}`)
} finally {
  assertOutputChild(stage)
  await rm(stage, { recursive: true, force: true })
  for (const temporary of [stagedArchive, stagedChecksum]) {
    assertOutputChild(temporary)
    await rm(temporary, { force: true })
  }
  if (!publishedDirectory) {
    if (publishedArchive) await rm(archive, { force: true })
    if (publishedChecksum) await rm(checksum, { force: true })
  }
  await rmdir(lock)
}
