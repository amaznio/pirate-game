import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** A number with minus and plus buttons. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  disabled = false,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <Button
        variant="secondary"
        size="icon"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={t('stepper.fewer', { label })}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-xl font-black tabular-nums">{value}</span>
      <Button
        variant="secondary"
        size="icon"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={t('stepper.more', { label })}
      >
        <Plus />
      </Button>
    </div>
  );
}
