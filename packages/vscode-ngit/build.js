const esbuild = require("esbuild")

esbuild
  .build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "out/extension.js",
    external: ["vscode"], // VS Code API is provided by the host
    format: "cjs",
    platform: "node",
    sourcemap: true,
    minify: false, // Keep code readable for debugging
    tsconfig: "tsconfig.json",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  })
  .catch(() => process.exit(1))
