import { Check, Info } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** A list of mutually exclusive rows, each with a title and its rules behind an info button. */
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

/**
 * One choice: a radio and its title, and an info button that opens the rule on
 * tap. The rule stays out of the row so a list of choices stays short. The
 * info button sits beside the radio, not inside it, because a button cannot
 * hold a button.
 */
export function ChoiceRow({
  value,
  title,
  rule,
  showRule = false,
}: {
  value: string;
  title: string;
  rule: string;
  /** Show the rule under the title instead of behind an info button. */
  showRule?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-stretch rounded-card border-2 border-border bg-card transition has-[[role=radio][data-state=checked]]:border-primary has-[[role=radio][data-state=checked]]:bg-secondary">
      <RadioGroup.Item
        value={value}
        className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-l-card py-3 pr-2 pl-4 text-left outline-none transition hover:bg-secondary/60 focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground"
        >
          <Check className="size-4 opacity-0 group-data-[state=checked]:opacity-100" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-bold text-foreground">{title}</span>
          {showRule && <span className="text-sm text-muted-foreground">{rule}</span>}
        </span>
      </RadioGroup.Item>
      {showRule ? (
        <span className="w-2 shrink-0" aria-hidden />
      ) : (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('menu.details', { name: title })}
            className="flex w-12 shrink-0 items-center justify-center rounded-r-card text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <Info className="size-5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="rounded-btn border-2 border-border text-sm">
          <p className="font-bold text-foreground">{title}</p>
          <p className="mt-1 text-muted-foreground">{rule}</p>
        </PopoverContent>
      </Popover>
      )}
    </div>
  );
}
