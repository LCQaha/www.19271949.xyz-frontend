import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory } from 'vue-router'

const server = await createServer({ root: 'www', server: { middlewareMode: true, hmr: false } })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.vue')
  const { createSiteRouter } = await server.ssrLoadModule('/src/router/index.js')
  const router = createSiteRouter(createMemoryHistory())
  const render = () => renderToString(createSSRApp(App).use(router))

  for (const path of ['/', '/index.html']) {
    await router.push(path)
    const html = await render()
    assert.equal(router.currentRoute.value.name, 'home')
    assert.equal((html.match(/<article /g) || []).length, 2)
    assert.ok((html.match(/data-icon="github"/g) || []).length >= 5, 'Repository controls and footer should use the GitHub mark')
    assert.ok(html.includes('http://dashboard.19271949.xyz/'))
    assert.ok(html.includes('https://github.com/LCQaha/user-center-frontend'))
    assert.ok(html.includes('https://github.com/LCQaha/user-center-backend'))
    assert.ok(html.includes('WORK IN PROGRESS'))
  }

  for (const path of ['/404', '/missing/deep?from=check#lost-content', '/www/missing', '/INDEX.HTML', '/index.html/']) {
    await router.push(path)
    const html = await render()
    assert.equal(router.currentRoute.value.fullPath, path, 'Keep the original missing address')
    assert.equal(router.currentRoute.value.meta.notFound, true)
    assert.ok(html.includes('LCQ / LOST &amp; FOUND'), 'Render the existing www 404 ticket')
    assert.ok(html.includes('带我回家') && html.includes('href="/"'))
    assert.ok(html.includes('href="/#projects"'))
    assert.equal((html.match(/<article /g) || []).length, 0)
  }

  await router.push({ name: 'home', hash: '#projects' })
  assert.equal(router.currentRoute.value.fullPath, '/#projects')
  assert.equal(router.currentRoute.value.meta.notFound, undefined)
  assert.equal((await render()).includes('WORK IN PROGRESS'), true)
  for (const asset of ['github', 'vuedotjs', 'react', 'springboot', 'nodedotjs', 'markdown']) {
    await access(`www/public/icons/${asset}.svg`)
  }
  console.log('PASS: home, GitHub icons, two cards, /404, catch-all, preserved URL, return-home navigation, icon assets')
} finally {
  await server.close()
}
