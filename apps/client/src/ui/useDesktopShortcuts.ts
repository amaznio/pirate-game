import { useEffect } from 'react';
import { useGameUIStore } from '../store/useGameUIStore';
import { usePreviewSettings } from '../store/previewSettings';
import { TOKEN_ORDER } from './tokenMeta';

/** Keyboard shortcuts for the desktop layout. */
export function useDesktopShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        return;
      }

      const store = useGameUIStore.getState();
      if (!store.canPlan) {
        return;
      }

      // Cannons fire in the phase of the most recently queued move.
      const lastMove = store.queue.map((slot) => slot !== null).lastIndexOf(true);
      const lastPhase = Math.max(0, lastMove);

      switch (event.key.toLowerCase()) {
        case '1':
        case '2':
        case '3':
          store.queuePlayerAction(TOKEN_ORDER[Number(event.key) - 1]);
          break;
        case 'q':
          store.toggleCannon(lastPhase, 'left');
          break;
        case 'e':
          store.toggleCannon(lastPhase, 'right');
          break;
        case 'backspace':
          if (lastMove >= 0) {
            store.removePlayerAction(lastMove);
          }
          break;
        case 'c':
          store.clearPlayerActions();
          break;
        case 'enter':
          store.lockIn();
          break;
        case 'p': {
          const preview = usePreviewSettings.getState();
          preview.setShowPlanPreview(!preview.showPlanPreview);
          break;
        }
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
