import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'better-sqlite3'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(extensionConfig);
  await ctx.watch();
  console.log('[esbuild] Watching extension...');
} else {
  await esbuild.build(extensionConfig);
  console.log('[esbuild] Extension built.');
}
