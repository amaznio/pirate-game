import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** A one-line message under a form (errors, hints): icon and text, never colour alone. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 rounded-btn bg-destructive px-3 py-2 text-center text-sm font-bold text-white"
    >
      <Info className="size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
