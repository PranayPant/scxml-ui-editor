import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useRef } from 'react';
import type { ValidationDiagnostic } from 'scxml-parser';

import { useEditorStore } from '@/store/useEditorStore';

const SYNTAX_DEBOUNCE_MS = 200;
const MARKER_OWNER = 'scxml';
const DARK_THEME_ID = 'scxml-dark';

/**
 * Define + register the app's custom dark Monaco theme once before the editor
 * mounts, so the code surface matches the semantic token system (zinc-950 bg,
 * slate strokes, functional accent colors) instead of Monaco's default bright
 * gray. Tokens mirror `src/index.css`'s `--monaco-*` variables.
 */
const handleEditorWillMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(DARK_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'tag', foreground: '38bdf8' }, // sky-400 for XML/SCXML tags
      { token: 'attribute.name', foreground: 'a5b4fc' }, // indigo-300 attributes
      { token: 'attribute.value', foreground: 'fbbf24' }, // amber-400 values
      { token: 'comment', foreground: '52525b' }, // zinc-600 comments
      { token: 'string', foreground: '86efac' }, // green-300 strings
    ],
    colors: {
      'editor.background': '#09090b',
      'editor.lineHighlightBackground': '#18181b',
      'editorGutter.background': '#09090b',
      'editorLineNumber.foreground': '#52525b',
      'editorLineNumber.activeForeground': '#f4f4f5',
      'editor.selectionBackground': '#1e3a8a',
      'editorCursor.foreground': '#38bdf8',
    },
  });
  monaco.editor.setTheme(DARK_THEME_ID);
};

function diagnosticToMarker(d: ValidationDiagnostic, monaco: Monaco): editor.IMarkerData {
  return {
    message: d.message,
    severity:
      d.severity === 'error'
        ? monaco.MarkerSeverity.Error
        : d.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
    startLineNumber: d.line ?? 1,
    startColumn: d.column ?? 1,
    endLineNumber: d.line ?? 1,
    endColumn: (d.column ?? 1) + 1,
  };
}

/**
 * Monaco-backed SCXML code editor.
 *
 * Responsibilities (per spec §3.2):
 *   - Binds to the store's `rawXml`.
 *   - Reports user keystrokes with a 200ms debounce to `updateCodeFromUser`.
 *   - Highlights the source range when a canvas node is selected.
 *   - Emits Monaco markers when partial parsing surfaces syntax diagnostics.
 */
export function MonacoEditor() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const rawXml = useEditorStore((s) => s.rawXml);
  const parseErrors = useEditorStore((s) => s.parseErrors);
  const activeSourceRange = useEditorStore((s) => s.activeSourceRange);
  const updateCodeFromUser = useEditorStore((s) => s.updateCodeFromUser);

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
  };

  // Debounced CODE -> AST -> CANVAS pipeline on user typing.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = useCallback(
    (value: string | undefined) => {
      const xml = value ?? '';
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateCodeFromUser(xml);
      }, SYNTAX_DEBOUNCE_MS);
    },
    [updateCodeFromUser],
  );

  // Push diagnostics into Monaco markers whenever they change.
  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      parseErrors.map((d) => diagnosticToMarker(d, monaco)),
    );
  }, [parseErrors]);

  // Scroll to + highlight the source range when a canvas node is selected.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !activeSourceRange) return;
    ed.revealRangeInCenterIfOutsideViewport({
      startLineNumber: activeSourceRange.startLine,
      startColumn: activeSourceRange.startColumn,
      endLineNumber: activeSourceRange.endLine,
      endColumn: activeSourceRange.endColumn,
    });
    ed.setSelection({
      startLineNumber: activeSourceRange.startLine,
      startColumn: activeSourceRange.startColumn,
      endLineNumber: activeSourceRange.endLine,
      endColumn: activeSourceRange.endColumn,
    });
  }, [activeSourceRange]);

  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="xml"
        theme={DARK_THEME_ID}
        beforeMount={handleEditorWillMount}
        value={rawXml}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 2,
        }}
      />
    </div>
  );
}
