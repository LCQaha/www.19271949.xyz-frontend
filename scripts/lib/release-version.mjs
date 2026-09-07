// Project convention: SemVer core, optionally alpha.N / beta.N / rc.N.
export function releaseVersion(version, expectedTag) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(0|[1-9]\d*))?$/.test(version)) {
    throw new Error('Invalid release version. Use X.Y.Z or X.Y.Z-alpha.N / beta.N / rc.N, without a v prefix or build metadata.')
  }
  const tag = `v${version}`
  if (expectedTag !== undefined && expectedTag !== tag) throw new Error(`Tag ${expectedTag} does not match www/package.json version ${tag}.`)
  return { version, tag, archiveName: `www-${tag}.tar.gz` }
}
