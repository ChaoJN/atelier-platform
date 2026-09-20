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
    <div class="admin-modal-overlay" :class="{ show: state.confirm.visible }">
      <div class="admin-modal-box">
        <p class="admin-modal-msg">{{ state.confirm.message }}</p>
        <div class="admin-modal-actions">
          <button class="admin-modal-btn" @click="resolve(false)">取消</button>
          <button class="admin-modal-btn" :class="{ danger: state.confirm.danger }" @click="resolve(true)">
            {{ state.confirm.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.admin-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  align-items: center;
  justify-content: center;
}
.admin-modal-overlay.show {
  display: flex;
}
.admin-modal-box {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 28px 24px;
  max-width: 320px;
  width: 100%;
  margin: 0 20px;
  box-sizing: border-box;
  text-align: center;
}
.admin-modal-msg {
  margin: 0 0 24px;
  font-size: 15px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
}
.admin-modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.admin-modal-btn {
  padding: 8px 24px;
  border-radius: 20px;
  border: 1px solid #fff;
  background: transparent;
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, color 0.2s;
}
.admin-modal-btn:hover {
  background: #fff;
  color: #000;
}
.admin-modal-btn.danger {
  border-color: #ff6b6b;
  color: #ff6b6b;
}
.admin-modal-btn.danger:hover {
  background: #ff6b6b;
  color: #000;
}
</style>
