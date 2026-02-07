import { create } from 'zustand'
import type { Toast } from '@/types'
import { onNotify } from '@/lib/notify'

type SidebarTab = 'conversations' | 'workspace' | 'settings'

interface UIState {
  sidebarTab: SidebarTab
  workspacePath: string | null
  selectedFilePath: string | null
  toasts: Toast[]

  setSidebarTab: (tab: SidebarTab) => void
  setWorkspacePath: (path: string | null) => void
  setSelectedFilePath: (path: string | null) => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

let toastCounter = 0

export const useUIStore = create<UIState>((set, get) => ({
  sidebarTab: 'conversations',
  workspacePath: null,
  selectedFilePath: null,
  toasts: [],

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  setWorkspacePath: (path) => set({ workspacePath: path }),

  setSelectedFilePath: (path) => set({ selectedFilePath: path }),

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`
    const duration = toast.duration ?? 4000

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }]
    }))

    // Auto-dismiss
    setTimeout(() => {
      get().removeToast(id)
    }, duration)
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
}))

// Bridge: route notify() calls into the UI store's toast system
onNotify((toast) => useUIStore.getState().addToast(toast))
