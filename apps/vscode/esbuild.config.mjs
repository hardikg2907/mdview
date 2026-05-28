import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const nodeEnv = process.env.NODE_ENV || 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode', '@hardikg/mdview'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
  },
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching apps/vscode/src ...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
