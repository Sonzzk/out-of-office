import { defineConfig, type Plugin } from "vite";

// three's GLTFLoader probes for AVIF/WebP support with tiny base64 images; the
// Artifact host refuses a version whose scripts carry embedded images, and we
// never load AVIF/WebP textures, so blank the probes out.
const noEmbeddedImages: Plugin = {
  name: "no-embedded-images",
  transform(code, id) {
    if (!id.includes("node_modules/three")) return;
    return code.replace(/data:image\/(avif|webp);base64,[A-Za-z0-9+/=]+/g, "");
  },
};

// Relative base so the build works from any folder (Artifact, GitHub Pages, itch.io).
// three.js (only used when you stand up in the office) is loaded lazily in its own chunks.
export default defineConfig({
  base: "./",
  plugins: [noEmbeddedImages],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("three/examples")) return "three-loaders";
          if (id.includes("node_modules/three")) return "three-core";
        },
      },
    },
  },
});
