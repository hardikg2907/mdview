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
});
