import { createApp, nextTick } from 'vue'
import { createWebHistory } from 'vue-router'
import App from './App.vue'
import { createSiteRouter } from './router'
import './styles/original.css'
import './styles/projects.css'

const router = createSiteRouter(createWebHistory(import.meta.env.BASE_URL))
router.afterEach(async (to, from) => {
  document.title = to.meta.notFound ? '404 · 啊哦，迷路了哦 | LCQ' : 'LCQ · 19271949.xyz'
  let robots = document.querySelector('meta[name="robots"]')
  if (to.meta.notFound && !robots) {
    robots = document.createElement('meta')
    robots.name = 'robots'
    document.head.append(robots)
  }
  if (to.meta.notFound) robots.content = 'noindex, follow'
  else robots?.remove()
  await nextTick()
  if (to.path !== from.path && !to.hash) document.querySelector('main h1')?.focus({ preventScroll: true })
})
createApp(App).use(router).mount('#app')
