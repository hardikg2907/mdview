import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli.js';

describe('parseArgs --port 0', () => {
  it('accepts 0 as a valid ephemeral-port request', () => {
    const result = parseArgs(['--port', '0', './']);
    expect(result.kind).toBe('run');
    if (result.kind === 'run') {
      expect(result.args.port).toBe(0);
      expect(result.args.portExplicit).toBe(true);
    }
  });

  it('still rejects negative ports', () => {
    expect(() => parseArgs(['--port', '-1', './'])).toThrow(/--port/i);
  });

  it('still rejects non-integer ports', () => {
    expect(() => parseArgs(['--port', '7.5', './'])).toThrow(/--port/i);
  });

  it('accepts 65535 and rejects ports above 65535', () => {
    const ok = parseArgs(['--port', '65535', './']);
    expect(ok.kind).toBe('run');
    if (ok.kind === 'run') expect(ok.args.port).toBe(65535);
    expect(() => parseArgs(['--port', '65536', './'])).toThrow(/--port/i);
    expect(() => parseArgs(['--port', '70000', './'])).toThrow(/--port/i);
  });
});
