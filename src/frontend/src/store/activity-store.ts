// ============================================================
// 活动日志 Store
// ============================================================

import { create } from 'zustand';
import type { ActivityEntry } from '../types';

const MAX_ENTRIES = 200;

interface ActivityState {
  entries: ActivityEntry[];
  addEntry: (entry: Omit<ActivityEntry, 'id' | 'is_new'>) => void;
  setEntries: (entries: ActivityEntry[]) => void;
  clearNewFlags: () => void;
}

let entryCounter = 0;

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],

  addEntry: (entry) =>
    set((state) => {
      const newEntry: ActivityEntry = {
        ...entry,
        id: `act-${Date.now()}-${++entryCounter}`,
        is_new: true,
      };
      const entries = [newEntry, ...state.entries].slice(0, MAX_ENTRIES);

      // Clear is_new flag after 1 second
      setTimeout(() => {
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === newEntry.id ? { ...e, is_new: false } : e,
          ),
        }));
      }, 1000);

      return { entries };
    }),

  setEntries: (entries) => set({ entries }),

  clearNewFlags: () =>
    set((state) => ({
      entries: state.entries.map((e) => ({ ...e, is_new: false })),
    })),
}));
