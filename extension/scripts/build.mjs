/**
 * Сборка расширения: esbuild бандлит TS-энтрипоинты в dist/,
 * HTML/CSS копируются рядом с бандлами.
 */
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [
    join(root, 'src/background.ts'),
    join(root, 'src/content.ts'),
    join(root, 'src/popup/popup.ts'),
    join(root, 'src/options/options.ts')
  ],
  outdir: join(root, 'dist'),
  outbase: join(root, 'src'),
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox115'],
  sourcemap: 'inline',
  logLevel: 'info'
};

function copyStatic() {
  for (const rel of ['popup/popup.html', 'popup/popup.css', 'options/options.html', 'options/options.css']) {
    const dst = join(root, 'dist', rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(root, 'src', rel), dst);
  }
}

copyStatic();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watch: пересборка при изменениях (статика копируется только на старте)');
} else {
  await build(options);
}
