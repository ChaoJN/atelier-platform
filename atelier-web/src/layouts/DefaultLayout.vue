<script setup lang="ts">
import HeaderNav from '@/components/layout/HeaderNav.vue'
import FooterSection from '@/components/layout/FooterSection.vue'
import GlobalAlert from '@/components/common/GlobalAlert.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import CartDrawer from '@/components/cart/CartDrawer.vue'
</script>

<template>
  <div class="app-shell">
    <HeaderNav />
    <main class="app-main">
      <RouterView />
    </main>
    <FooterSection />
    <CartDrawer />
    <GlobalAlert />
    <ConfirmModal />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
}
.app-main {
  flex: 1;
}
</style>
