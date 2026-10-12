import { useTranslation } from 'react-i18next';

interface HullBarProps {
  hp: number;
  maxHp: number;
  /** Smaller pips, for the phone HUD. */
  small?: boolean;
}

/**
 * Hull pips: a solid pip is hull left, a hollow one is hull lost. Shape and
 * count carry the meaning, so it reads without colour.
 */
export function HullBar({ hp, maxHp, small = false }: HullBarProps) {
  const { t } = useTranslation();
  const segments = Array.from({ length: maxHp }, (_, index) => index < hp);
  return (
    <div className={small ? 'flex items-center gap-0.5' : 'flex items-center gap-1'} role="img" aria-label={t('shipStatus.hull', { hp, maxHp })}>
      {segments.map((filled, index) => (
        <span
          key={index}
          className={`${small ? 'size-2.5' : 'size-3'} rounded-full border-2 border-hull ${filled ? 'bg-hull' : 'bg-transparent'}`}
        />
      ))}
    </div>
  );
}
