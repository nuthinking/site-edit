import { defineConfig } from "tsup";

// Three entries: the client widget (a client component), the Next wrapper, and the server handlers.
// The client entries carry "use client" so Next treats them as client modules; the server one must not.
const shared = { format: ["esm"] as const, dts: true, sourcemap: true, target: "es2022", external: ["react", "react-dom", "next", "next/navigation", "marked"] };

export default defineConfig([
  { ...shared, entry: { "client/index": "src/client/index.ts" }, outDir: "dist", splitting: true, banner: { js: '"use client";' } },
  { ...shared, entry: { "next/index": "src/next/index.tsx" }, outDir: "dist", splitting: false, banner: { js: '"use client";' } },
  { ...shared, entry: { "server/index": "src/server/index.ts" }, outDir: "dist", splitting: false, platform: "neutral" },
]);
