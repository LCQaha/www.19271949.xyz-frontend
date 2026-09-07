import assert from 'node:assert/strict'

// Run against Nginx after deploying www/dist, not the Vite development server.
const origin = process.env.SITE_URL
assert.ok(origin, 'Set SITE_URL to the actual Nginx site URL. Vite preview does not apply the Nginx 404 configuration.')
const home = await fetch(`${origin}/`)
assert.equal(home.status, 200, 'The home page must return 200')
const html = await home.text()
assert.match(html, /<div id="app"><\/div>/, 'The built Vue entry must be served')
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1])
assert.ok(assets.some(path => path.endsWith('.js')), 'A built JavaScript entry is required')
for (const path of [...assets, '/lcq-icon.svg']) {
  const response = await fetch(`${origin}${path}`)
  assert.equal(response.status, 200, `${path} must load`)
}
for (const path of ['/404', '/__404_check__/missing', '/__404_check__/deep/path/?from=check', '/www', '/www/missing', '/INDEX.HTML', '/index.html/']) {
  const response = await fetch(`${origin}${path}`)
  assert.equal(response.status, 404, `${path} must retain HTTP 404`)
  assert.match(await response.text(), /<div id="app"><\/div>/, `${path} must load Vue Router to render the custom 404`)
  assert.equal(response.url, `${origin}${path}`, 'Keep the original URL on a direct request')
  const head = await fetch(`${origin}${path}`, { method: 'HEAD' })
  assert.equal(head.status, 404, `HEAD ${path} must retain HTTP 404`)
  console.log(`PASS 404 ${path}`)
}
for (const path of ['/assets/__missing__.js', '/icons/__missing__.svg', '/404.html']) {
  const response = await fetch(`${origin}${path}`)
  assert.equal(response.status, 404, `${path} must return 404`)
  assert.match(await response.text(), /LCQ \/ LOST & FOUND/, `${path} must retain the standalone 404 fallback`)
}
for (const path of ['/index.html', '/icons/github.svg', '/icons/vuedotjs.svg', '/icons/react.svg']) {
  assert.equal((await fetch(`${origin}${path}`)).status, 200, `${path} must load`)
}
console.log(`PASS home and ${assets.length + 1} assets at ${origin}`)
