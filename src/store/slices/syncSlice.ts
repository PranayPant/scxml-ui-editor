import type { StateCreator } from 'zustand';

export type SyncOrigin = 'CODE' | 'CANVAS' | 'IDLE';

export interface SyncState {
  /** Who originated the current transaction, to prevent circular sync loops. */
  syncOrigin: SyncOrigin;
  /** Whether the document has unsaved changes. */
  isDirty: boolean;

  beginTransaction: (origin: SyncOrigin) => void;
  endTransaction: () => void;
  markDirty: () => void;
  markClean: () => void;
}

export const createSyncSlice: StateCreator<SyncState, [], [], SyncState> = (set) => ({
  syncOrigin: 'IDLE',
  isDirty: false,

  beginTransaction: (origin) => set({ syncOrigin: origin, isDirty: true }),
  endTransaction: () => set({ syncOrigin: 'IDLE' }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
});
