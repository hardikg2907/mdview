import { describe, it, expect } from 'vitest';
import { isSupportedNodeVersion } from '../../src/nodeProbe';

describe('isSupportedNodeVersion', () => {
  it('rejects below 22', () => {
    expect(isSupportedNodeVersion('20.18.1')).toBe(false);
    expect(isSupportedNodeVersion('18.19.0')).toBe(false);
    expect(isSupportedNodeVersion('16.20.2')).toBe(false);
    expect(isSupportedNodeVersion('0.10.0')).toBe(false);
  });
  it('accepts 22 and above', () => {
    expect(isSupportedNodeVersion('22.0.0')).toBe(true);
    expect(isSupportedNodeVersion('22.15.1')).toBe(true);
    expect(isSupportedNodeVersion('24.5.1')).toBe(true);
  });
  it('rejects empty / malformed strings', () => {
    expect(isSupportedNodeVersion('')).toBe(false);
    expect(isSupportedNodeVersion('garbage')).toBe(false);
    expect(isSupportedNodeVersion('v20.10.0')).toBe(false); // expects bare numeric prefix
  });
});
