import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),
  tailwindcss()],
  /* Always 5173, and fail loudly if it's taken instead of silently moving to
     5174/5175. The backend's FRONTEND_URL (where Square sends customers back
     after paying) points at 5173, so a dev server on any other port looks like
     it's running but checkout returns to the wrong place. If this errors, an
     old dev server is still running — stop it (see the error message). */
  server: {
    port: 5173,
    strictPort: true,
  },
})
