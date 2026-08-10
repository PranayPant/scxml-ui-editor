import type { ValidationDiagnostic } from 'scxml-parser';
import type { StateCreator } from 'zustand';

export interface SourceRange {
  /** 1-based line number of the range start. */
  startLine: number;
  /** 1-based start column (0-based offset within the line). */
  startColumn: number;
  /** 1-based end line (inclusive-ish, as used by Monaco). */
  endLine: number;
  /** 1-based end column. */
  endColumn: number;
}

export interface CodeState {
  /** Raw SCXML text bound to the Monaco model. */
  rawXml: string;
  /** Parse/validation diagnostics keyed for Monaco markers. */
  parseErrors: ValidationDiagnostic[];
  /** Whether the last partial parse produced a degraded fallback tree. */
  livePreviewPaused: boolean;
  /** Currently active source range (from canvas selection) -> Monaco highlight. */
  activeSourceRange: SourceRange | null;

  /** Set raw text (from user typing). */
  setRawXml: (xml: string) => void;
  /** Set diagnostics (from CODE pipeline). */
  setParseErrors: (errors: ValidationDiagnostic[], livePreviewPaused: boolean) => void;
  /** Highlight a range in Monaco from a canvas selection. */
  setActiveSourceRange: (range: SourceRange | null) => void;
}

export const createCodeSlice: StateCreator<CodeState, [], [], CodeState> = (set) => ({
  rawXml: '',
  parseErrors: [],
  livePreviewPaused: false,
  activeSourceRange: null,

  setRawXml: (xml) => set({ rawXml: xml }),
  setParseErrors: (errors, livePreviewPaused) => set({ parseErrors: errors, livePreviewPaused }),
  setActiveSourceRange: (range) => set({ activeSourceRange: range }),
});
