import type { Toast } from '@/types'

/**
 * Tiny pub-sub for toast notifications.
 * Decouples domain stores from the UI store — stores call notify(),
 * and the UI store subscribes to receive toasts.
 *
 * This removes the circular-feeling import where conversationStore
 * and settingsStore reach into useUIStore.getState().addToast().
 */

type ToastData = Omit<Toast, 'id'>
type Listener = (toast: ToastData) => void

let listener: Listener | null = null

export function onNotify(fn: Listener): () => void {
  listener = fn
  return () => { listener = null }
}

export function notify(toast: ToastData): void {
  if (listener) listener(toast)
}
