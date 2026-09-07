import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { releaseVersion } from './lib/release-version.mjs'

test('release identifiers keep package, tag and mounting directory aligned', () => {
  assert.deepEqual(releaseVersion('1.0.0', 'v1.0.0'), { version: '1.0.0', tag: 'v1.0.0', archiveName: 'www-v1.0.0.tar.gz' })
  assert.equal(releaseVersion('2.1.0-rc.1').tag, 'v2.1.0-rc.1')
  assert.equal(releaseVersion('0.3.0-beta.2').archiveName, 'www-v0.3.0-beta.2.tar.gz')
})

test('invalid identifiers and mismatched tags fail before creating a release', () => {
  for (const value of ['../outside', '/tmp/site', 'v1.0.0', '01.0.0', '1.0', '1.0.0-rc.01', '1.0.0+build.1', '1.0.0;exit']) {
    assert.throws(() => releaseVersion(value), /version/i)
  }
  assert.throws(() => releaseVersion('1.0.0', 'v1.0.1'), /tag/i)
})

test('Pages portal links to the real site and supports repository subpaths', async () => {
  const page = await readFile('pages-entry/index.html', 'utf8')
  assert.match(page, /href="https:\/\/www\.19271949\.xyz\/"/)
  assert.match(page, /href="https:\/\/www\.19271949\.xyz\/#projects"/)
  assert.doesNotMatch(page, /(?:src|href)="\/(?!\/)/, 'Portal assets must be relative on project Pages')
  assert.doesNotMatch(page, /http-equiv="refresh"|window\.location|location\.replace/, 'Let visitors choose the real-site link')
  await readFile('pages-entry/assets/lcq-icon.svg')
  await readFile('pages-entry/assets/github.svg')
})

test('GitHub release workflow marks supported prerelease tags', async () => {
  const workflow = await readFile('.github/workflows/release.yml', 'utf8')
  assert.match(workflow, /if \[\[ "\$RELEASE_TAG" == \*-\* \]\]/)
  assert.match(workflow, /release_options\+=\(--prerelease\)/)
  assert.match(workflow, /"\$\{release_options\[@\]\}"/)
})
