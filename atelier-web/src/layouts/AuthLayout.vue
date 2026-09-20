<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="auth-page">
    <header class="auth-header">
      <RouterLink to="/" class="logo">Rainstopha Select</RouterLink>
    </header>
    <main class="auth-main">
      <slot />
    </main>
    <footer class="auth-footer">Copyright © 2026 Rainstopha Select</footer>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
}
.auth-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #fff;
  border-bottom: 1px solid #eee;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #333;
  text-decoration: none;
}
.auth-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}
.auth-footer {
  text-align: center;
  padding: 20px 0;
  font-size: 11px;
  color: #aaa;
}
</style>
