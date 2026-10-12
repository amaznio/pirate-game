import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * A big tile on the home screen. A tile with no `onClick` is a disabled
 * preview: it says "coming soon" and cannot be pressed.
 */
export function Tile({
  title,
  blurb,
  cta,
  icon,
  badge,
  primary = false,
  onClick,
  className,
}: {
  title: string;
  blurb: string;
  cta?: string;
  icon: ReactNode;
  badge?: string;
  primary?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const disabled = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex flex-col items-start gap-3 rounded-tile border-2 p-5 text-left outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        primary
          ? 'border-primary bg-primary text-primary-foreground shadow-xl hover:brightness-105 active:scale-[0.98]'
          : disabled
            ? 'border-dashed border-border bg-card/50 text-muted-foreground'
            : 'border-border bg-card text-card-foreground hover:bg-secondary active:scale-[0.98]',
        className,
      )}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="flex size-12 items-center justify-center rounded-btn bg-black/15 [&_svg]:size-7">
          {icon}
        </span>
        {badge && <Badge variant="outline">{badge}</Badge>}
      </span>
      <span className="font-head text-2xl font-bold">{title}</span>
      <span className={cn('text-base', primary ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
        {blurb}
      </span>
      {cta && !disabled && (
        <span className="mt-auto flex items-center gap-1 pt-2 text-base font-black">
          {cta}
          <ChevronRight className="size-5 transition group-hover:translate-x-1" aria-hidden />
        </span>
      )}
    </button>
  );
}
