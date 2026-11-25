import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

const CLUB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEMO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const demoClockStorage = new AsyncLocalStorage<Date>();

/**
 * Parses YYYY-MM-DD in Asia/Ho_Chi_Minh (+07:00), keeping current club time-of-day
 * so same-day ordering and UTC+7 clubDate conversions remain consistent.
 * Always disabled in production.
 */
export function parseDemoDate(raw: unknown): Date | null {
  if (process.env.NODE_ENV === 'production' || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!DEMO_DATE_RE.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map(Number);
  const nowClub = new Date(Date.now() + CLUB_OFFSET_MS);
  const utcMs =
    Date.UTC(
      year,
      month - 1,
      day,
      nowClub.getUTCHours(),
      nowClub.getUTCMinutes(),
      nowClub.getUTCSeconds(),
      nowClub.getUTCMilliseconds(),
    ) - CLUB_OFFSET_MS;
  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function demoClockMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    next();
    return;
  }
  const header = req.headers['x-demo-date'];
  const raw = Array.isArray(header) ? header[0] : header;
  const demoDate = parseDemoDate(raw);
  if (!demoDate) {
    next();
    return;
  }
  demoClockStorage.run(demoDate, () => next());
}

/** Returns request-scoped simulated Date in non-production when X-Demo-Date is set; otherwise real Date. */
export function effectiveNow(): Date {
  if (process.env.NODE_ENV === 'production') return new Date();
  return demoClockStorage.getStore() ?? new Date();
}

/** True only in non-production while a valid X-Demo-Date override is active for the current request. */
export function isDemoClockActive(): boolean {
  return process.env.NODE_ENV !== 'production' && demoClockStorage.getStore() !== undefined;
}
