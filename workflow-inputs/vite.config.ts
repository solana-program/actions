import { defineConfig } from "vite-plus";

export default defineConfig({
  // Test runner (Vitest) configuration.
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },

  // Linter (Oxlint) configuration. Enable type-aware checks and full
  // type-checking via tsgo so `vp check` covers fmt + lint + typecheck.
  // The `dist/` folder is committed (it's the action's bundled output)
  // but it's a generated artifact and shouldn't be linted/formatted.
  lint: {
    ignorePatterns: ["dist/**", "node_modules/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },

  // Formatter (Oxfmt) — same dist/ exclusion.
  fmt: {
    ignorePatterns: ["dist/**", "node_modules/**"],
  },

  // Library bundling (tsdown) configuration.
  // We bundle the action entrypoint as a single self-contained ESM file
  // so it can be invoked directly by GitHub Actions' node24 runtime.
  pack: {
    entry: { index: "src/main.ts" },
    format: "esm",
    platform: "node",
    target: "node24",
    outDir: "dist",
    dts: false,
    sourcemap: false,
    clean: true,
    // Use `.js` rather than the default `.mjs` so action.yml's
    // `main: dist/index.js` matches the JS Action ecosystem convention.
    // The package.json has `"type": "module"`, so Node treats `.js` as ESM.
    fixedExtension: false,
    // Inline every dependency so the runner doesn't need a node_modules folder.
    deps: {
      alwaysBundle: [/.*/],
    },
  },
});
