import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve('electron/main.ts')
      },
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve('electron/preload.ts')
      },
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'preload.js'
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('index.html')
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  }
})
