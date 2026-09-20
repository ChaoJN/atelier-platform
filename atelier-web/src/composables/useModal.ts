import { reactive } from 'vue'

interface ConfirmOptions {
  confirmText?: string
  danger?: boolean
}

const state = reactive({
  alert: {
    visible: false,
    message: '',
    resolve: null as (() => void) | null,
  },
  confirm: {
    visible: false,
    message: '',
    confirmText: '確認',
    danger: false,
    resolve: null as ((value: boolean) => void) | null,
  },
})

export function useModal() {
  function alert(message: string) {
    return new Promise<void>((resolve) => {
      state.alert.message = message
      state.alert.resolve = resolve
      state.alert.visible = true
    })
  }

  function confirm(message: string, options: ConfirmOptions = {}) {
    return new Promise<boolean>((resolve) => {
      state.confirm.message = message
      state.confirm.confirmText = options.confirmText ?? '確認'
      state.confirm.danger = options.danger ?? false
      state.confirm.resolve = resolve
      state.confirm.visible = true
    })
  }

  return { state, alert, confirm }
}
