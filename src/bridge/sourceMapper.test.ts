import { parseSCXMLPartial } from 'scxml-parser';
import { describe, expect, it } from 'vitest';
import { sourceToMonacoRange } from './sourceMapper';

describe('sourceToMonacoRange', () => {
  it('maps a node id to a 1-based SourceRange using captured positions', () => {
    const scxml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" initial="a">
  <state id="a" />
</scxml>`;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    expect(data).toBeTruthy();

    const range = sourceToMonacoRange(data!, 'a');
    expect(range.startLine).toBeGreaterThanOrEqual(1);
    expect(range.startColumn).toBeGreaterThanOrEqual(1);
    expect(range.endLine).toBeGreaterThanOrEqual(range.startLine);
    // The `a` id appears on the state's opening tag line (line 2).
    expect(range.startLine).toBe(2);
  });

  it('returns a fallback range for null doc and for unknown id', () => {
    expect(sourceToMonacoRange(null, 'x')).toEqual({
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    });
    const { data } = parseSCXMLPartial(
      `<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="a"/></scxml>`,
      { captureStringPositions: true },
    );
    expect(sourceToMonacoRange(data!, 'missing')).toEqual({
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    });
  });
});
