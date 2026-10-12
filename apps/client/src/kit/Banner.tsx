import { AlertTriangle, Info, Target, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  objective: { icon: Target, className: 'bg-secondary text-foreground' },
  info: { icon: Info, className: 'bg-background/60 text-foreground' },
  warning: { icon: AlertTriangle, className: 'bg-gold text-ink' },
  bad: { icon: XCircle, className: 'bg-destructive text-white' },
} as const;

/** A short message with an icon and text, so its tone never rests on colour alone. */
export function Banner({
  tone = 'info',
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <div
      role={tone === 'bad' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-2 rounded-btn px-3 py-2 text-sm font-bold',
        toneClass,
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
