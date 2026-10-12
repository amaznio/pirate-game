import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { usePreviewSettings } from '../store/previewSettings';

/** Switches the on-board ghost preview of the queued plan. */
export function PreviewToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const show = usePreviewSettings((state) => state.showPlanPreview);
  const setShow = usePreviewSettings((state) => state.setShowPlanPreview);

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => setShow(!show)}
      aria-pressed={show}
      aria-label={t('preview.toggle')}
      title={show ? t('preview.hide') : t('preview.show')}
      className={`rounded-full bg-card/90 shadow-lg backdrop-blur hover:bg-card ${className}`}
    >
      {show ? <Eye /> : <EyeOff />}
    </Button>
  );
}
