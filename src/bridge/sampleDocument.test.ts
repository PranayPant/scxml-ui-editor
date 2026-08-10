import { describe, expect, it } from 'vitest';
import { DEFAULT_SCXML } from './sampleDocument';

describe('sampleDocument', () => {
  it('provides a non-empty starter SCXML document that parses', () => {
    expect(typeof DEFAULT_SCXML).toBe('string');
    expect(DEFAULT_SCXML.length).toBeGreaterThan(0);
    expect(DEFAULT_SCXML).toContain('<scxml');
    expect(DEFAULT_SCXML).toContain('initial="idle"');
  });
});
