import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom/client')) return 'react-dom-client';
            if (id.includes('react-dom')) return 'react-dom';
            if (id.includes('react/jsx')) return 'react-jsx';
            if (id.includes('react')) return 'react';
            if (id.includes('leaflet/dist/images')) return 'leaflet-images';
            if (id.includes('leaflet')) return 'leaflet';
            if (id.includes('axios')) return 'axios';
            return 'vendor';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 100,
    sourcemap: false,
  },
})