import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const nodeEnv = process.env.NODE_ENV || 'production';

// Emits stable begin/end markers (and esbuild errors with their location) that
// the editor's background task watcher keys on to know when a rebuild settles.
const watchLogPlugin = {
  name: 'watch-log',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
      }
      console.log('[watch] build finished');
    });
  },
};

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
  logLevel: watch ? 'silent' : 'info',
  plugins: watch ? [watchLogPlugin] : [],
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
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
