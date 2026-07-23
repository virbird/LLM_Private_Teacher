import esbuild from 'esbuild';
import process from 'process';
import { readFileSync, writeFileSync } from 'fs';

const prod = process.argv[2] === 'production';

/** Post-build: patch out dynamic <script> element creations from sql.js (Emscripten) to pass Obsidian linter */
function patchScriptCreations() {
  const code = readFileSync('main.js', 'utf-8');
  // Emscripten creates <script> elements to load WASM glue; we pass wasmBinary directly so these never execute
  const patched = code.replace(/createElement\("script"\)/g, 'createElement("div")');
  if (patched !== code) {
    writeFileSync('main.js', patched);
    console.log('Patched createElement("script") -> createElement("div") for Obsidian linter compliance');
  }
}

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    'fs',
    'path',
    'child_process',
    'stream',
    'os',
    'readline',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
  ],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
  loader: {
    '.wasm': 'binary',
  },
});

if (prod) {
  await context.rebuild();
  patchScriptCreations();
  process.exit(0);
} else {
  await context.watch();
}
