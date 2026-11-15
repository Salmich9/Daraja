// Construction spéciale pour le test des écrans : mode démo, un seul fichier classique (lisible par jsdom).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  define: { __VERSION__: JSON.stringify('test'), 'import.meta.env.VITE_MOCK': JSON.stringify('1') },
  build: { outDir: 'node_modules/.screens', emptyOutDir: true, minify: false, cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } } },
  logLevel: 'error',
})
