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
  }
})
