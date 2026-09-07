<script setup>
import { RouterLink } from 'vue-router'
import { ArrowRight, ArrowUpRight, House } from '@lucide/vue'
import SiteFooter from '../components/SiteFooter.vue'
import '../styles/not-found.css'
</script>

<template>
  <div class="error-page lost-page">
    <a class="skip-link" href="#lost-content">跳至页面内容</a>
    <div class="site-shell">
      <header class="site-header">
        <RouterLink class="brand" to="/" aria-label="LCQ 主页"><img src="/lcq-icon.svg" width="56" height="56" alt="LCQ"><span class="brand-domain">19271949<span>.xyz</span></span></RouterLink>
        <RouterLink class="nav-link error-nav" to="/">回家的路在这里 <ArrowUpRight :size="17" aria-hidden="true" /></RouterLink>
      </header>
      <main class="lost-main" id="lost-content">
        <div class="lost-copy">
          <p class="lost-label"><span class="status-dot" aria-hidden="true"></span> 404 · 暂时偏离路线</p>
          <h1 tabindex="-1">啊哦，<br>迷路了<span class="lost-oh">哦<span class="lost-period">。</span></span></h1>
          <p class="lost-description">这里好像没有你要找的页面。<br>别着急，回到主页再逛逛吧。</p>
          <div class="lost-actions">
            <RouterLink class="primary-link" to="/"><House :size="18" aria-hidden="true" /> 带我回家 <ArrowUpRight :size="18" aria-hidden="true" /></RouterLink>
            <RouterLink class="secondary-link" :to="{ name: 'home', hash: '#projects' }">去看看项目 <ArrowRight :size="18" aria-hidden="true" /></RouterLink>
          </div>
          <p class="lost-destination"><span aria-hidden="true">↳</span> 下一站：<RouterLink to="/">19271949.xyz</RouterLink></p>
        </div>
        <div class="lost-aside" aria-hidden="true">
          <div class="lost-ticket">
            <div class="ticket-top"><span>LCQ / LOST &amp; FOUND</span><span>↗</span></div>
            <div class="ticket-code">4<span>0</span>4</div>
            <p class="ticket-oops">Oops! Wrong turn.</p>
            <div class="ticket-bottom"><span>页面没找到<br>回家的路还在</span><span class="ticket-arrow">↙</span></div>
          </div>
          <p class="lost-aside-note">偶尔走错路，也没关系。</p>
        </div>
      </main>
      <SiteFooter :show-error-link="false" />
    </div>
  </div>
</template>
