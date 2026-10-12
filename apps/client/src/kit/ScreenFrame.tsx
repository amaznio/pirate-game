import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The frame every menu screen shares: the title on the ocean, an optional back
 * button and header actions, the content, and an optional footer that stays at
 * the bottom of the screen (the main action, within thumb reach on a phone).
 */
export function ScreenFrame({
  title,
  onBack,
  actions,
  footer,
  wide = true,
  children,
}: {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Two-column screens use the wide frame; single-column ones stay narrow. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <div className="flex-1 overflow-y-auto">
        <div className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-6', wide ? 'max-w-5xl' : 'max-w-xl')}>
          <header className="flex flex-wrap items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('menu.back')}>
                <ChevronLeft />
              </Button>
            )}
            <h1 className="font-head text-3xl font-bold tracking-wide">{title}</h1>
            {actions && <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div>}
          </header>
          {children}
        </div>
      </div>
      {footer && (
        <div className="border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={cn('mx-auto flex w-full gap-3', wide ? 'max-w-5xl' : 'max-w-xl')}>{footer}</div>
        </div>
      )}
    </div>
  );
}
