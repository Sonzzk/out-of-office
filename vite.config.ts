import { defineConfig } from "vitest/config";

// Relative base so the build works from any folder (Artifact, GitHub Pages, itch.io).
// Dot reporter keeps test output terse; failures still print in full.
export default defineConfig({
  base: "./",
  test: { reporters: "dot" },
});
