import { Check } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

/** A list of mutually exclusive rows, each with a title and a one-line rule. */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  label,
  className,
  children,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => onChange(next as T)}
      aria-label={label}
      className={cn('flex flex-col gap-2', className)}
    >
      {children}
    </RadioGroup.Root>
  );
}

export function ChoiceRow({
  value,
  title,
  rule,
}: {
  value: string;
  title: string;
  rule: string;
}) {
  return (
    <RadioGroup.Item
      value={value}
      className="group flex min-h-14 items-center gap-3 rounded-card border-2 border-border bg-card px-4 py-3 text-left outline-none transition hover:bg-secondary/60 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-secondary"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-bold text-foreground">{title}</span>
        <span className="text-sm text-muted-foreground">{rule}</span>
      </span>
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground"
      >
        <Check className="size-4 opacity-0 group-data-[state=checked]:opacity-100" />
      </span>
    </RadioGroup.Item>
  );
}
