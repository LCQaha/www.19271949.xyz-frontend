import { createRouter } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import NotFoundView from '../views/NotFoundView.vue'

export function createSiteRouter(history) {
  return createRouter({
    history,
    sensitive: true,
    strict: true,
    routes: [
      { path: '/', alias: '/index.html', name: 'home', component: HomeView },
      { path: '/404', name: '404', component: NotFoundView, meta: { notFound: true } },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { notFound: true } },
    ],
    scrollBehavior(to, from, savedPosition) {
      if (savedPosition) return savedPosition
      if (to.hash) return { el: to.hash, top: 32 }
      return { top: 0 }
    },
  })
}
