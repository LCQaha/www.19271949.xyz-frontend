<script setup>
import { computed } from 'vue'
import { ChartNoAxesCombined, CodeXml, Compass, Database, Layers } from '@lucide/vue'

const props = defineProps({ label: { type: String, required: true } })
const brands = {
  'Vue 3': { file: 'vuedotjs', color: '#23845c' },
  React: { file: 'react', color: '#087da2' },
  'Spring Boot': { file: 'springboot', color: '#4d8224' },
  'Node.js': { file: 'nodedotjs', color: '#487932' },
  Markdown: { file: 'markdown', color: '#343934' },
}
const brand = computed(() => brands[props.label])
const fallbackIcon = computed(() => ({
  ECharts: ChartNoAxesCombined,
  '对象存储': Database,
  '方向探索中': Compass,
  '项目 02': Layers,
})[props.label] || CodeXml)
</script>

<template>
  <li>
    <span v-if="brand" class="tech-brand" :style="{ maskImage: `url(/icons/${brand.file}.svg)`, backgroundColor: brand.color }" aria-hidden="true"></span>
    <component v-else :is="fallbackIcon" :size="15" :stroke-width="1.7" aria-hidden="true" />
    {{ label }}
  </li>
</template>
