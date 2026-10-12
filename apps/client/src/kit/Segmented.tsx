import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * A row of mutually exclusive choices. The chosen one is filled and carries a
 * check, so selection never rests on colour alone.
 */
export function Segmented<T extends string | number | null>({
  value,
  choices,
  onChange,
  disabled = false,
  label,
  compact = false,
}: {
  value: T;
  choices: ReadonlyArray<{ label: string; value: T; ariaLabel?: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
  /** Tighter padding, for narrow columns such as the battle sidebar. */
  compact?: boolean;
}) {
  const selected = choices.findIndex((choice) => choice.value === value);
  return (
    <ToggleGroup
      type="single"
      spacing={2}
      value={selected < 0 ? '' : String(selected)}
      disabled={disabled}
      aria-label={label}
      // Clicking the chosen item again reports an empty value: keep the choice.
      onValueChange={(next) => {
        const choice = next === '' ? undefined : choices[Number(next)];
        if (choice) {
          onChange(choice.value);
        }
      }}
      className="flex w-full flex-wrap"
    >
      {choices.map((choice, index) => (
        <ToggleGroupItem
          key={choice.label}
          value={String(index)}
          aria-label={choice.ariaLabel}
          className={cn(
            'rounded-btn border-2 border-border bg-secondary/40 text-sm',
            compact ? 'min-h-10 px-2.5' : 'min-h-11 px-4',
            ' font-bold text-foreground hover:bg-secondary data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground disabled:opacity-60',
          )}
        >
          {choice.value === value && <Check className="size-4" aria-hidden />}
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
