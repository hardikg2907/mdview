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
  define: buildDefine(nodeEnv),
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
});

function buildDefine(env) {
  const define = { 'process.env.NODE_ENV': JSON.stringify(env) };
  // Outside development the local CLI override must be unreachable, so the
  // reference is substituted away and the branch drops out. In development the
  // real runtime value is read so a local CLI build can be pointed at.
  if (env !== 'development') {
    define['process.env.MDVIEW_CLI_PATH'] = 'undefined';
  }
  return define;
}

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching apps/vscode/src ...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
