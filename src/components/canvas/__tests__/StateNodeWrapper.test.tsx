// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { type NodeProps, ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { ScxmlFlowNode } from '@/bridge/scxmlToFlow';
import { AtomicStateNode } from '../nodes/AtomicStateNode';
import { CompoundStateNode } from '../nodes/CompoundStateNode';
import { HistoryNode } from '../nodes/HistoryNode';
import { ParallelNode } from '../nodes/ParallelNode';

const EXPECTED_HANDLES = [
  'target-top',
  'target-bottom',
  'target-left',
  'target-right',
  'source-top',
  'source-bottom',
  'source-left',
  'source-right',
];

function flowNode(overrides: Partial<ScxmlFlowNode['data']>): NodeProps<ScxmlFlowNode> {
  return {
    id: 'n1',
    type: 'atomic',
    selected: false,
    draggable: true,
    deletable: true,
    selectable: true,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    data: { kind: 'atomic', label: 'n1', ...overrides },
  };
}

// <Handle> requires a ReactFlow store; wrap every render in a provider.
function renderWithFlow(node: ReactNode) {
  return render(<ReactFlowProvider>{node}</ReactFlowProvider>);
}

function handleIds(container: HTMLElement): string[] {
  // React Flow renders handles as elements with a data-handleid attribute.
  const els = Array.from(container.querySelectorAll<HTMLElement>('[data-handleid]'));
  return els.map((el) => el.dataset.handleid!).sort();
}

describe('StateNodeWrapper handle integrity (Error #008 prevention)', () => {
  it('mounts all 8 namespaced handles for an atomic state', () => {
    const { container } = renderWithFlow(<AtomicStateNode {...flowNode({})} />);
    expect(handleIds(container)).toEqual([...EXPECTED_HANDLES].sort());
  });

  it('mounts all 8 handles for a compound state', () => {
    const { container } = renderWithFlow(<CompoundStateNode {...flowNode({ kind: 'compound' })} />);
    expect(handleIds(container)).toEqual([...EXPECTED_HANDLES].sort());
  });

  it('mounts all 8 handles for a parallel state', () => {
    const { container } = renderWithFlow(<ParallelNode {...flowNode({ kind: 'parallel' })} />);
    expect(handleIds(container)).toEqual([...EXPECTED_HANDLES].sort());
  });

  it('mounts all 8 handles for a history state', () => {
    const { container } = renderWithFlow(
      <HistoryNode {...flowNode({ kind: 'history', scxmlType: 'shallow' })} />,
    );
    expect(handleIds(container)).toEqual([...EXPECTED_HANDLES].sort());
  });
});
