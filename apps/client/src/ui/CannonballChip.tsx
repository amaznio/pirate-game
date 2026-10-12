import { useTranslation } from 'react-i18next';
import { useAmmo } from './useAmmo';

/** Cannonball count: free-to-queue / total held. */
export function CannonballChip() {
  const { t } = useTranslation();
  const { ammo, remaining } = useAmmo();
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-parchment">
      <span
        className="inline-block h-3 w-3 rounded-full bg-ink ring-1 ring-parchment/40"
        aria-hidden
      />
      {remaining} / {ammo}
      <span className="sr-only">{t('plan.cannonballs')}</span>
    </span>
  );
}
