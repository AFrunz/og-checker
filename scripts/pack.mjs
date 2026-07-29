import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Упаковка расширения в архивы для релиза.
 *
 * В архив едет не вся папка extension/, а только то, что грузит браузер:
 * manifest.json, иконки и бандлы из dist/. Исходники, тесты, скрипты сборки
 * и design/ остаются снаружи.
 *
 * Zip пишем сами: формат простой, а ради одной функции тянуть зависимость,
 * которую больше негде применить, смысла нет.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'extension');
const outDir = join(root, 'dist');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Фиксированная дата (начало эпохи DOS) — чтобы архив собирался побайтово одинаково. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

async function collect(dir, base = dir) {
  const out = [];
  for (const entry of (await readdir(dir)).sort()) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) out.push(...(await collect(full, base)));
    else out.push(full.slice(base.length + 1).split(sep).join('/'));
  }
  return out;
}

function localHeader(entry) {
  const name = Buffer.from(entry.name, 'utf8');
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0, 6);
  head.writeUInt16LE(8, 8);
  head.writeUInt16LE(DOS_TIME, 10);
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(entry.crc, 14);
  head.writeUInt32LE(entry.compressed.length, 18);
  head.writeUInt32LE(entry.size, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  return Buffer.concat([head, name]);
}

function centralHeader(entry) {
  const name = Buffer.from(entry.name, 'utf8');
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0, 8);
  head.writeUInt16LE(8, 10);
  head.writeUInt16LE(DOS_TIME, 12);
  head.writeUInt16LE(DOS_DATE, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.compressed.length, 20);
  head.writeUInt32LE(entry.size, 24);
  head.writeUInt16LE(name.length, 28);
  head.writeUInt16LE(0, 30);
  head.writeUInt16LE(0, 32);
  head.writeUInt16LE(0, 34);
  head.writeUInt16LE(0, 36);
  head.writeUInt32LE(0, 38);
  head.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([head, name]);
}

function buildZip(files) {
  const parts = [];
  const entries = [];
  let offset = 0;

  for (const file of files) {
    const entry = {
      name: file.name,
      size: file.data.length,
      crc: crc32(file.data),
      compressed: deflateRawSync(file.data, { level: 9 }),
      offset
    };
    const head = localHeader(entry);
    parts.push(head, entry.compressed);
    offset += head.length + entry.compressed.length;
    entries.push(entry);
  }

  const central = entries.map(centralHeader);
  const centralSize = central.reduce((sum, buf) => sum + buf.length, 0);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, ...central, end]);
}

/** Читает архив обратно через центральный каталог — им же проверяем результат. */
export function readZip(buf) {
  const eocd = buf.length - 22;
  if (buf.readUInt32LE(eocd) !== 0x06054b50) throw new Error('не найдена сигнатура EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);

  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error('битая запись каталога');
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const compSize = buf.readUInt32LE(cursor + 20);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    const local = buf.readUInt32LE(cursor + 42);

    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`битый локальный заголовок ${name}`);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.set(name, inflateRawSync(buf.subarray(dataAt, dataAt + compSize)));

    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Пути, которые манифест обещает браузеру. Их отсутствие — сломанное расширение. */
export function referencedPaths(manifest) {
  const out = new Set();
  const add = (value) => {
    if (typeof value === 'string') out.add(value);
  };

  Object.values(manifest.icons ?? {}).forEach(add);
  add(manifest.background?.service_worker);
  (manifest.background?.scripts ?? []).forEach(add);
  for (const script of manifest.content_scripts ?? []) {
    (script.js ?? []).forEach(add);
    (script.css ?? []).forEach(add);
  }
  add(manifest.action?.default_popup);
  Object.values(manifest.action?.default_icon ?? {}).forEach(add);
  add(manifest.options_ui?.page);

  return [...out];
}

async function payload(manifest) {
  const names = ['manifest.json'];

  // Иконки берём только растровые: icon.svg — исходник, браузеру он не нужен.
  for (const entry of (await readdir(join(extensionDir, 'icons'))).sort()) {
    if (entry.endsWith('.png')) names.push(`icons/${entry}`);
  }

  let bundles;
  try {
    bundles = await collect(join(extensionDir, 'dist'));
  } catch {
    throw new Error('extension/dist пуст — сначала соберите: npm run build --workspace extension');
  }
  if (bundles.length === 0) {
    throw new Error('extension/dist пуст — сначала соберите: npm run build --workspace extension');
  }
  names.push(...bundles.map((name) => `dist/${name}`));

  const files = [];
  for (const name of names.sort()) {
    files.push({ name, data: await readFile(join(extensionDir, name)) });
  }

  // Манифест обещает браузеру конкретные файлы — сверяемся до упаковки,
  // иначе расширение сломается уже у пользователя.
  const packed = new Set(files.map((file) => file.name));
  const missing = referencedPaths(manifest).filter((path) => !packed.has(path));
  if (missing.length > 0) {
    throw new Error(`манифест ссылается на файлы, которых нет в сборке: ${missing.join(', ')}`);
  }

  return files;
}

async function main() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(extensionDir, 'manifest.json'), 'utf8'));

  // Версия живёт в четырёх файлах и синхронизируется scripts/sync-version.mjs.
  // Если её правили руками, релиз лучше остановить здесь, а не после публикации.
  if (manifest.version !== pkg.version) {
    throw new Error(
      `версии разошлись: package.json ${pkg.version}, extension/manifest.json ${manifest.version}. ` +
        'Выровняйте их: npm run sync-version'
    );
  }

  const files = await payload(manifest);
  const archive = buildZip(files);

  // Проверяем то, что реально записали: ошибка в смещениях иначе всплыла бы
  // только в браузере, с бесполезным «повреждённый файл».
  const back = readZip(archive);
  for (const file of files) {
    const got = back.get(file.name);
    if (!got || got.length !== file.data.length) {
      throw new Error(`архив не читается обратно корректно: ${file.name}`);
    }
  }

  await mkdir(outDir, { recursive: true });

  // Манифест универсальный (в background есть и service_worker, и scripts),
  // поэтому обе сборки — один и тот же архив под разными именами: Chrome ждёт
  // .zip, Firefox ставит из файла только .xpi.
  const targets = [
    `og-checker-${pkg.version}-chrome.zip`,
    `og-checker-${pkg.version}-firefox.xpi`
  ];
  for (const name of targets) {
    await writeFile(join(outDir, name), archive);
    console.log(`dist/${name} — ${files.length} файлов, ${archive.length} байт`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
