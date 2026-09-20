<script setup lang="ts">
import { useModal } from '@/composables/useModal'

const { state } = useModal()

function resolve(value: boolean) {
  state.confirm.visible = false
  state.confirm.resolve?.(value)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" :class="{ show: state.confirm.visible }">
      <div class="modal-box">
        <p class="modal-msg">{{ state.confirm.message }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="resolve(false)">取消</button>
          <button class="modal-btn" :class="{ danger: state.confirm.danger }" @click="resolve(true)">
            {{ state.confirm.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
