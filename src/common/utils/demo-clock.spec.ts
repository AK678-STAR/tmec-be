import { demoClockMiddleware, effectiveNow, parseDemoDate } from './demo-clock';

describe('demo-clock', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('parses YYYY-MM-DD in development and returns null in production or for invalid dates', () => {
    process.env.NODE_ENV = 'development';
    const parsed = parseDemoDate('2026-12-15');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString().slice(0, 10)).toMatch(/^2026-12-1[45]$/);
    expect(parseDemoDate('not-a-date')).toBeNull();

    process.env.NODE_ENV = 'production';
    expect(parseDemoDate('2026-12-15')).toBeNull();
  });

  it('scopes effectiveNow() per request via demoClockMiddleware in development', () => {
    process.env.NODE_ENV = 'development';
    let capturedInside: Date | null = null;
    demoClockMiddleware({ headers: { 'x-demo-date': '2030-05-10' } } as any, {} as any, () => {
      capturedInside = effectiveNow();
    });
    expect(capturedInside).toBeInstanceOf(Date);
    expect((capturedInside as unknown as Date).getUTCFullYear()).toBe(2030);
    // Outside middleware scope, effectiveNow() falls back to real server year
    expect(effectiveNow().getUTCFullYear()).toBe(new Date().getUTCFullYear());
  });
});
