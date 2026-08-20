import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Allow tunnel hostnames (trycloudflare.com) so the app is reachable via
    // HTTPS from other devices; otherwise Vite blocks the request with 403.
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Long-lived deps get their own cached chunks; the app code already
          // lazy-loads each screen, so only react/motion/firebase/lucide stay
          // in the shared chunks.
          'vendor-react': ['react', 'react-dom', 'scheduler'],
          'vendor-motion': ['motion', 'motion-dom', 'motion-utils'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
})
