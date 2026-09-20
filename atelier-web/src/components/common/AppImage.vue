<script setup lang="ts">
withDefaults(
  defineProps<{
    src: string
    alt?: string
    aspectRatio?: string
  }>(),
  { alt: '', aspectRatio: '6 / 9' },
)

function hideBroken(event: Event) {
  ;(event.target as HTMLImageElement).style.opacity = '0'
}
</script>

<template>
  <div class="app-image" :style="{ aspectRatio }">
    <img :src="src" :alt="alt" loading="lazy" @error="hideBroken" />
  </div>
</template>

<style scoped>
.app-image {
  background: #f5f5f5;
  overflow: hidden;
}
.app-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
