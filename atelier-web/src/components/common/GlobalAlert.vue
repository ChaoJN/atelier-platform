<script setup lang="ts">
import { useModal } from '@/composables/useModal'

const { state } = useModal()

function close() {
  state.alert.visible = false
  state.alert.resolve?.()
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" :class="{ show: state.alert.visible }">
      <div class="modal-box">
        <p class="modal-msg">{{ state.alert.message }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="close">確定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
