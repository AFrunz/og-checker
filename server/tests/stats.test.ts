import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStats } from '../src/stats';

test('stats: запись, summary и персистентность в файл', async (t) => {
  const file = join(tmpdir(), `ogc-stats-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rm(file, { force: true }));

  const s = new FileStats(file);
  await s.ready();
  s.record();
  s.record();
  s.record(3);

  const sum = s.summary();
  assert.equal(sum.day, 5);
  assert.equal(sum.week, 5);
  assert.equal(sum.month, 5);
  assert.equal(sum.total, 5);

  await s.flush();

  // перезагрузка из файла — счётчик сохранился
  const s2 = new FileStats(file);
  await s2.ready();
  assert.equal(s2.summary().total, 5);
});

test('stats: старые записи (за пределами окна) не попадают в day/week/month, но входят в total', async () => {
  const file = join(tmpdir(), `ogc-stats-old-${process.pid}-${Date.now()}.json`);
  const oldDay = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
  await fs.writeFile(file, JSON.stringify({ sessions: { [oldDay]: 7 } }));

  const s = new FileStats(file);
  await s.ready();
  s.record(); // сегодня

  const sum = s.summary();
  assert.equal(sum.day, 1);
  assert.equal(sum.month, 1); // 30-дневное окно не включает 40-дневной давности
  assert.equal(sum.total, 8);

  await fs.rm(file, { force: true });
});
