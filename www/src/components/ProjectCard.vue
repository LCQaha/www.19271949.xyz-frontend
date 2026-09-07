<script setup>
import { computed } from 'vue'
import { ArrowUpRight, BookOpen, CalendarCheck, CodeXml, FlaskConical, GitBranch, HardDrive, Sparkles, Users } from '@lucide/vue'
import GithubMark from './GithubMark.vue'
import TechTag from './TechTag.vue'

const props = defineProps({
  project: { type: Object, required: true },
  number: { type: String, required: true },
})
const projectIcon = computed(() => ({
  'user-center': Users,
  'next-project': Sparkles,
  'example-notes': BookOpen,
  'example-habits': CalendarCheck,
  'example-files': HardDrive,
})[props.project.id] || CodeXml)
</script>

<template>
  <article class="project-card" :class="{ 'is-planned': project.status === 'planned', 'is-example': project.status === 'example' }" :data-project="project.id" :aria-labelledby="`project-title-${project.id}`">
    <div class="project-visual" aria-hidden="true">
      <div class="visual-top"><span class="visual-index"><GitBranch :size="15" /> PROJECT / {{ number }}</span><span class="visual-dots"><i></i><i></i><i></i></span></div>
      <div class="visual-center">
        <span class="project-icon-tile"><component :is="projectIcon" :size="38" :stroke-width="1.6" /></span>
        <div class="project-monogram">{{ project.shortName }}<span class="monogram-dot">.</span></div>
      </div>
      <div class="visual-bottom"><span>{{ project.englishName }}</span><CodeXml :size="20" :stroke-width="1.5" /></div>
    </div>
    <div class="project-detail">
      <div class="project-meta">
        <span class="eyebrow">{{ number }} / {{ project.category }}</span>
        <span class="project-status"><FlaskConical v-if="project.status === 'example'" :size="14" aria-hidden="true" /><span v-else class="status-dot" aria-hidden="true"></span>{{ project.statusLabel }}</span>
      </div>
      <h3 :id="`project-title-${project.id}`">{{ project.name }}</h3>
      <p class="project-description"><span v-for="(line, index) in project.description" :key="index">{{ line }}</span></p>
      <ul class="project-tags" aria-label="项目标签"><TechTag v-for="tag in project.tags" :key="tag" :label="tag" /></ul>
      <div class="project-repositories" :aria-label="`${project.name} GitHub 开源仓库`">
        <span class="repository-heading"><GitBranch :size="15" aria-hidden="true" /> 开源代码 <span class="repository-platform">GITHUB</span></span>
        <div class="repository-list">
          <template v-for="repository in project.repositories" :key="repository.label">
            <a v-if="repository.url" class="repository-link" :href="repository.url" target="_blank" rel="noopener noreferrer" :aria-label="`${project.name} ${repository.label}（GitHub，新标签页打开）`">
              <GithubMark />
              {{ repository.label }} <ArrowUpRight class="repository-arrow" :size="16" aria-hidden="true" />
            </a>
            <span v-else class="repository-link is-pending" aria-disabled="true">
              <GithubMark />
              {{ repository.label }} <span class="repository-note">待补充</span>
            </span>
          </template>
        </div>
      </div>
      <div class="project-card-bottom">
        <span class="project-stage">{{ project.stage }}</span>
        <a v-if="project.url" class="project-link" :href="project.url" target="_blank" rel="noopener noreferrer" :aria-label="`访问 ${project.name}（新标签页打开）`">访问项目 <ArrowUpRight :size="17" aria-hidden="true" /></a>
        <span v-else class="project-pending" aria-disabled="true">{{ project.status === 'example' ? '示例展示' : '敬请期待' }} <ArrowUpRight :size="17" aria-hidden="true" /></span>
      </div>
    </div>
  </article>
</template>
