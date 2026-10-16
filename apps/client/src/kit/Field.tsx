import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A setting: its name, the control, and a short explanation under it. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-sm font-bold text-foreground">{label}</span>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The heading row of a card that has none of its own padding: bold, with a rule under it (as Advanced has). */
export function CardHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex min-h-14 items-center border-b border-border px-4 text-base font-bold">{children}</h2>
  );
}

/** A small caps heading for a card. */
export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  );
}
