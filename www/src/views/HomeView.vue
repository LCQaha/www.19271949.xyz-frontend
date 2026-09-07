<script setup>
import { RouterLink } from 'vue-router'
import { ArrowDown, ArrowUpRight, FolderOpen } from '@lucide/vue'
import ConstructionSign from '../components/ConstructionSign.vue'
import ProjectCard from '../components/ProjectCard.vue'
import GithubMark from '../components/GithubMark.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { projects } from '../data/projects.js'
</script>

<template>
  <a class="skip-link" href="#projects">跳至项目</a>
  <div class="site-shell">
    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="LCQ 主页">
        <img src="/lcq-icon.svg" width="56" height="56" alt="LCQ">
        <span class="brand-domain">19271949<span>.xyz</span></span>
      </RouterLink>
      <nav aria-label="主导航">
        <RouterLink class="nav-link" :to="{ name: 'home', hash: '#projects' }"><FolderOpen :size="17" aria-hidden="true" /> 项目</RouterLink>
        <a class="nav-github" href="https://github.com/lcqaha" target="_blank" rel="noopener noreferrer" aria-label="LCQ 的 GitHub（在新标签页打开）"><GithubMark /><ArrowUpRight :size="14" aria-hidden="true" /></a>
        <span class="header-status"><span class="status-dot" aria-hidden="true"></span>持续构建中</span>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow"><span class="tiny-cross" aria-hidden="true">✳</span> LCQ'S PERSONAL SPACE</p>
          <h1 id="hero-title" tabindex="-1">想法在这里<br>变成<span class="word-highlight">作品<span class="full-stop">。</span></span></h1>
          <p class="hero-description">你好，我是 LCQ。<br>这里收纳我的项目，也记录从 0 到 1 的过程。</p>
          <RouterLink class="text-link" :to="{ name: 'home', hash: '#projects' }">探索我的项目 <span class="circle-arrow" aria-hidden="true"><ArrowDown :size="18" /></span></RouterLink>
        </div>
        <div class="hero-aside">
          <ConstructionSign />
          <p class="aside-caption"><span aria-hidden="true">↳</span> 每一个完成，都从开始算起。</p>
        </div>
      </section>

      <section class="projects-section" id="projects" aria-labelledby="projects-title">
        <div class="section-heading">
          <div><p class="eyebrow">THE PROJECT INDEX</p><h2 id="projects-title">项目档案<span class="project-count">{{ String(projects.length).padStart(2, '0') }}</span></h2></div>
          <p class="section-note">小步前进，持续更新。<span aria-hidden="true"> ↘</span></p>
        </div>
        <div class="project-list">
          <ProjectCard v-for="(project, index) in projects" :key="project.id" :project="project" :number="String(index + 1).padStart(2, '0')" />
        </div>
        <div class="next-project"><span class="next-plus" aria-hidden="true">+</span><p>更多页面，敬请期待。</p><span class="eyebrow">TO BE CONTINUED</span></div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>
