import { usePreviewSettings } from '../store/previewSettings';

/** Switches the on-board ghost preview of the queued plan. */
export function PreviewToggle({ className = '' }: { className?: string }) {
  const show = usePreviewSettings((state) => state.showPlanPreview);
  const setShow = usePreviewSettings((state) => state.setShowPlanPreview);

  return (
    <button
      type="button"
      onClick={() => setShow(!show)}
      aria-pressed={show}
      aria-label="Toggle plan preview"
      title={show ? 'Hide plan preview (P)' : 'Show plan preview (P)'}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-ocean/80 text-lg shadow-lg backdrop-blur transition hover:bg-ocean active:scale-95 ${
        show ? 'text-parchment' : 'text-parchment/40'
      } ${className}`}
    >
      {show ? '👁' : '⊘'}
    </button>
  );
}
