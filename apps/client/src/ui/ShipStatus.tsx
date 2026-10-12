import { useTranslation } from 'react-i18next';

interface HullBarProps {
  hp: number;
  maxHp: number;
}

/** Segmented hull health bar. Displays only real mechanics. */
export function HullBar({ hp, maxHp }: HullBarProps) {
  const { t } = useTranslation();
  const segments = Array.from({ length: maxHp }, (_, index) => index < hp);
  return (
    <div className="flex items-center gap-1" aria-label={t('shipStatus.hull', { hp, maxHp })}>
      {segments.map((filled, index) => (
        <span
          key={index}
          className={`h-3 w-4 rounded-sm border border-black/30 ${
            filled ? 'bg-hull' : 'bg-black/30'
          }`}
        />
      ))}
    </div>
  );
}
