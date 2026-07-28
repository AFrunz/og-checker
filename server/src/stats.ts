/**
 * Простейшая статистика без БД: счётчики по дням в JSON-файле.
 * Инкремент в памяти + отложенная атомарная запись (temp + rename).
 * day/week/month считаются как скользящие окна (последние 1/7/30 UTC-суток).
 */
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

const DAY_MS = 86_400_000;

type Buckets = Record<string, number>; // "YYYY-MM-DD" (UTC) -> count

export interface StatsSummary {
  day: number;
  week: number;
  month: number;
  total: number;
}

export interface Stats {
  ready(): Promise<void>;
  record(n?: number): void;
  summary(now?: number): StatsSummary;
  flush(): Promise<void>;
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Заглушка: статистика выключена (файл не задан) — ничего не пишет. */
export const nullStats: Stats = {
  async ready() {},
  record() {},
  summary() {
    return { day: 0, week: 0, month: 0, total: 0 };
  },
  async flush() {}
};

export class FileStats implements Stats {
  private buckets: Buckets = {};
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly loaded: Promise<void>;

  constructor(
    private readonly file: string,
    private readonly maxDays = 400
  ) {
    this.loaded = this.load();
  }

  private async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as { sessions?: Buckets };
      this.buckets = parsed.sessions ?? {};
    } catch {
      this.buckets = {}; // файла нет или он битый — начинаем с нуля
    }
  }

  ready(): Promise<void> {
    return this.loaded;
  }

  record(n = 1): void {
    const key = dayKey(Date.now());
    this.buckets[key] = (this.buckets[key] ?? 0) + n;
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      // Ошибка записи не должна ронять процесс (unhandled rejection):
      // статистика вторична, логируем и живём дальше.
      this.flush().catch((err: Error) => {
        this.dirty = true; // не потеряли инкременты — попробуем при следующей записи
        console.error('[stats] flush failed:', err.message);
      });
    }, 2000);
    this.flushTimer.unref?.();
  }

  summary(now = Date.now()): StatsSummary {
    const window = (days: number): number => {
      let sum = 0;
      for (let i = 0; i < days; i++) sum += this.buckets[dayKey(now - i * DAY_MS)] ?? 0;
      return sum;
    };
    let total = 0;
    for (const v of Object.values(this.buckets)) total += v;
    return { day: window(1), week: window(7), month: window(30), total };
  }

  async flush(): Promise<void> {
    await this.loaded;
    if (!this.dirty) return;
    this.prune();
    this.dirty = false;
    const tmp = `${this.file}.tmp`;
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify({ sessions: this.buckets }));
    await fs.rename(tmp, this.file);
  }

  private prune(): void {
    const cutoff = dayKey(Date.now() - this.maxDays * DAY_MS);
    for (const k of Object.keys(this.buckets)) {
      if (k < cutoff) delete this.buckets[k];
    }
  }
}
