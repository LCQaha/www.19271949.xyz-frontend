<script setup>
import { RouterLink } from 'vue-router'
import { ArrowUpRight, Compass } from '@lucide/vue'
import GithubMark from './GithubMark.vue'

defineProps({ showErrorLink: { type: Boolean, default: true } })
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <p>© {{ year }} LCQ</p><span>保持好奇，继续创造。</span>
    <nav class="footer-links" aria-label="页脚导航">
      <a href="https://github.com/lcqaha" target="_blank" rel="noopener noreferrer" aria-label="GitHub：lcqaha（在新标签页打开）"><GithubMark /> GitHub / lcqaha <ArrowUpRight :size="15" aria-hidden="true" /></a>
      <RouterLink v-if="showErrorLink" to="/404"><Compass :size="17" aria-hidden="true" /> 迷路指南 / 404</RouterLink>
      <RouterLink v-else to="/">19271949.xyz <ArrowUpRight :size="15" aria-hidden="true" /></RouterLink>
    </nav>
  </footer>
</template>
