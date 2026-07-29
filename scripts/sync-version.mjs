import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Раскладывает версию из корневого package.json по остальным файлам.
 *
 * Версия нужна в четырёх местах, и manifest.json среди них — единственный, кто
 * реально уезжает пользователю. Забыть его при бампе очень легко, поэтому
 * скрипт повешен на npm-хук `version`: `npm version patch` в корне сам
 * протащит номер везде и включит правки в коммит версии.
 *
 * Правим точечно регуляркой, а не через JSON.stringify: так в диффе остаётся
 * одна строка, а форматирование файлов не переписывается.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = ['extension/package.json', 'server/package.json', 'extension/manifest.json'];

const VERSION_FIELD = /"version"\s*:\s*"[^"]*"/;

async function main() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const version = pkg.version;

  for (const target of TARGETS) {
    const path = join(root, target);
    const before = await readFile(path, 'utf8');

    if (!VERSION_FIELD.test(before)) {
      throw new Error(`в ${target} не нашлось поля version`);
    }

    const after = before.replace(VERSION_FIELD, `"version": "${version}"`);
    if (after === before) {
      console.log(`${target} — уже ${version}`);
      continue;
    }

    await writeFile(path, after);
    console.log(`${target} — ${version}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
