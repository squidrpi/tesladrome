import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  // Keep the existing Navidrome subdirectory deployment by default. The
  // standalone Docker image sets VITE_BASE=/ so it can be served at its root.
  base: process.env.VITE_BASE || "/tesla/",
  plugins: [react()],
})
