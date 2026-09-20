<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import BareLayout from '@/layouts/BareLayout.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'

const route = useRoute()

const CUSTOMER_FAVICON = 'https://img.icons8.com/?size=100&id=hRlGryuq38s4&format=png&color=000000'
const ADMIN_FAVICON = 'https://img.icons8.com/?size=100&id=G3G1vdYJV3lU&format=png&color=000000'

watch(
  () => route.path,
  (path) => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = path.startsWith('/admin') ? ADMIN_FAVICON : CUSTOMER_FAVICON
  },
  { immediate: true },
)
</script>

<template>
  <AdminLayout v-if="route.meta.layout === 'admin'" />
  <BareLayout v-else-if="route.meta.layout === 'bare'" />
  <DefaultLayout v-else />
</template>
