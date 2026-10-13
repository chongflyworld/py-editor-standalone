import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 独立版：无需后端。base 用相对路径 "./"，使 dist/ 可放在任意子目录或网盘路径下直接打开。
export default defineConfig({
  base: "./",
  plugins: [vue()],
  server: { host: true, port: 5174 },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    chunkSizeWarningLimit: 1200,
  },
});
