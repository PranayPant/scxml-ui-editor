import { describe, expect, it, vi } from 'vitest';

// Force `addState` (used by `addStateNode`) to throw, so we can verify the
// error-handling contract: `addStateNode` must catch and return null instead of
// propagating an exception. This isolates the defensive `catch` branch without
// affecting the main flowToScxml suite.
vi.mock('scxml-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('scxml-parser')>();
  return {
    ...actual,
    addState: () => {
      throw new Error('boom');
    },
  };
});

import { parseSCXMLPartial } from 'scxml-parser';
import { addStateNode } from './flowToScxml';

describe('addStateNode error handling', () => {
  it('returns null (not throws) when addState fails', () => {
    const { data } = parseSCXMLPartial(
      `<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="a"/></scxml>`,
      { captureStringPositions: true },
    );
    expect(data).toBeTruthy();
    expect(addStateNode(data!, 'new', 'atomic')).toBeNull();
  });
});
