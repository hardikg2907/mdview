import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/shared/relative-time.js';

const NOW = new Date('2026-05-07T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('shows "just now" for < 30 seconds', () => {
    expect(formatRelativeTime(NOW - 5_000, NOW)).toBe('just now');
  });

  it('singular vs plural minutes', () => {
    expect(formatRelativeTime(NOW - 70_000, NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 minutes ago');
  });

  it('singular vs plural hours', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1 hour ago');
    expect(formatRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe('3 hours ago');
  });

  it('"yesterday" for ~24h ago', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('yesterday');
  });

  it('plural days', () => {
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60_000, NOW)).toBe('5 days ago');
  });

  it('falls back to absolute date past 30 days', () => {
    const result = formatRelativeTime(NOW - 60 * 24 * 60 * 60_000, NOW);
    expect(result).not.toContain('ago');
    expect(result).toMatch(/\d{4}/); // year somewhere
  });
});
