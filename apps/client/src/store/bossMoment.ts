import { create } from 'zustand';

/** A big moment of the boss fight the board announces over itself: it rises, or it is slain. */
export interface BossMoment {
  readonly kind: 'rise' | 'slain';
  readonly title: string;
}

interface BossMomentStore {
  moment: BossMoment | null;
  /** Shows a moment for a while, then clears it (a newer moment replaces an older one). */
  show(moment: BossMoment, ms: number): void;
  clear(): void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useBossMoment = create<BossMomentStore>((set) => ({
  moment: null,
  show: (moment, ms) => {
    clearTimeout(timer);
    set({ moment });
    timer = setTimeout(() => set({ moment: null }), ms);
  },
  clear: () => {
    clearTimeout(timer);
    set({ moment: null });
  },
}));
