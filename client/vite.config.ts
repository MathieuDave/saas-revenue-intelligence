import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lets the phone reach the app through an ngrok tunnel.
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev'],
    // Relays /api calls to the backend, so the browser only needs one address.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
