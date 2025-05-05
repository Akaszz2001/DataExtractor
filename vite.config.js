import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy any /api/chat/... → https://api.together.xyz/v1/chat/...
      "/api/chat": {
  target: "https://api.together.ai",
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/chat/, "/v1/chat"),
  secure: true,
},

    },
  },
})


// // vite.config.js
// import { defineConfig } from "vite";

// export default defineConfig({
  
// });
