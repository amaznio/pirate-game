import { create } from 'zustand';

const STORAGE_KEY = 'pirate-game:show-plan-preview';

function load(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface PreviewSettings {
  /** Draw ghost ships and cannon lines for the queued plan on the board. */
  showPlanPreview: boolean;
  setShowPlanPreview: (show: boolean) => void;
}

/** Presentation-only setting, deliberately kept out of the game rules. */
export const usePreviewSettings = create<PreviewSettings>((set) => ({
  showPlanPreview: load(),
  setShowPlanPreview: (show) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, show ? 'on' : 'off');
    } catch {
      // Storage can be unavailable (private mode); the setting still applies.
    }
    set({ showPlanPreview: show });
  },
}));
