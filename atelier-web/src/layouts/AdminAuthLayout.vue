<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="admin-auth-page">
    <header class="admin-auth-header">
      <span class="logo" @click="router.push('/admin/dashboard')">Rainstopha Select 系統後台</span>
    </header>
    <main class="admin-auth-main">
      <slot />
    </main>
    <footer class="admin-auth-footer">Copyright © 2026 Rainstopha Select</footer>
  </div>
</template>

<style scoped>
.admin-auth-page {
  min-height: 100svh;
  background-color: #000;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif;
  display: flex;
  flex-direction: column;
}
.admin-auth-header {
  border-bottom: 1px solid #444;
  padding: 20px;
  text-align: center;
}
.logo {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.admin-auth-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}
.admin-auth-footer {
  text-align: center;
  padding: 20px 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}
</style>
