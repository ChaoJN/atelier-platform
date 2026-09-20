<script setup lang="ts">
import GlobalAlert from '@/components/common/GlobalAlert.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import CartDrawer from '@/components/cart/CartDrawer.vue'
</script>

<template>
  <RouterView />
  <CartDrawer />
  <GlobalAlert />
  <ConfirmModal />
</template>
