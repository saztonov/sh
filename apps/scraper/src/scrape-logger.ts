import type { ScrapeLogLevel, ScrapeLogStep } from '@homework/shared';
import { logger } from './logger.js';
import { supabase } from './db.js';

interface LogEntry {
  run_id: string;
  level: ScrapeLogLevel;
  step: ScrapeLogStep | null;
  message: string;
  details: Record<string, unknown> | null;
  duration_ms: number | null;
}

const BATCH_SIZE = 5;

export class ScrapeLogger {
  private runId: string;
  private buffer: LogEntry[] = [];

  constructor(runId: string) {
    this.runId = runId;
  }

  info(step: ScrapeLogStep | null, message: string, details?: Record<string, unknown>): void {
    this.add('info', step, message, details);
  }

  warn(step: ScrapeLogStep | null, message: string, details?: Record<string, unknown>): void {
    this.add('warn', step, message, details);
  }

  error(step: ScrapeLogStep | null, message: string, details?: Record<string, unknown>): void {
    this.add('error', step, message, details);
  }

  async timed<T>(
    step: ScrapeLogStep,
    message: string,
    fn: () => Promise<T>,
    details?: Record<string, unknown>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.add('info', step, message, { ...details, duration_ms: Date.now() - start });
      return result;
    } catch (err) {
      this.add('error', step, `${message} — ошибка`, {
        ...details,
        duration_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0);
    await this.insert(entries);
  }

  private add(
    level: ScrapeLogLevel,
    step: ScrapeLogStep | null,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const durationMs = details?.duration_ms as number | undefined;
    const cleanDetails = details ? { ...details } : null;
    if (cleanDetails) delete cleanDetails.duration_ms;

    const entry: LogEntry = {
      run_id: this.runId,
      level,
      step,
      message,
      details: cleanDetails && Object.keys(cleanDetails).length > 0 ? cleanDetails : null,
      duration_ms: durationMs ?? null,
    };

    // Параллельный вывод в Pino
    const pinoMsg = step ? `[${step}] ${message}` : message;
    if (level === 'error') logger.error(details ?? {}, pinoMsg);
    else if (level === 'warn') logger.warn(details ?? {}, pinoMsg);
    else logger.info(details ?? {}, pinoMsg);

    this.buffer.push(entry);
    if (this.buffer.length >= BATCH_SIZE) {
      const batch = this.buffer.splice(0);
      void this.insert(batch);
    }
  }

  private async insert(entries: LogEntry[]): Promise<void> {
    try {
      await supabase.from('scrape_logs').insert(entries);
    } catch (err) {
      logger.error({ err }, 'Failed to insert scrape_logs');
    }
  }
}
