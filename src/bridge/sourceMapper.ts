import type { SCXMLDocument } from 'scxml-parser';
import type { SourceRange } from '@/store/slices/codeSlice';

import { collectStateNodes } from './metadataRegistry';

/**
 * Convert a `Position` (line/column 1-based, offset 0-based) into a Monaco
 * `IRange`. Monaco columns are 1-based and lines are 1-based, so `line` and
 * `column` map 1:1; we use a range of length 1 for the highlight cursor.
 */
function positionToMonaco(
  line: number,
  column: number,
): { startLineNumber: number; startColumn: number } {
  return {
    startLineNumber: Math.max(1, line),
    startColumn: Math.max(1, column),
  };
}

/**
 * Map a node `id` to a Monaco source range using the parser's captured
 * `scxmlStringRange` (present only when `captureStringPositions` is enabled).
 *
 * Because the range reflects the in-memory snapshot the AST was parsed from,
 * callers should re-parse before relying on it after any mutation/serialization.
 */
export function sourceToMonacoRange(doc: SCXMLDocument | null, id: string): SourceRange {
  if (!doc) return fallback();

  const node = collectStateNodes(doc).find((n) => n.id === id);
  const range = node?.scxmlStringRange;

  if (!range) return fallback();

  const start = positionToMonaco(range.start.line, range.start.column);
  // End position is 1-based; Monaco end is inclusive-of-column margin.
  const endLine = Math.max(start.startLineNumber, range.end.line);
  const endColumn = Math.max(start.startColumn, range.end.column);

  return {
    startLine: start.startLineNumber,
    startColumn: start.startColumn,
    endLine,
    endColumn,
  };
}

function fallback(): SourceRange {
  return { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };
}
