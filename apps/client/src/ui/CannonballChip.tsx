import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useAmmo } from './useAmmo';

/** Cannonball count: free-to-queue / total held. */
export function CannonballChip() {
  const { t } = useTranslation();
  const { ammo, remaining } = useAmmo();
  return (
    <Badge variant="secondary" className="gap-1.5 text-sm">
      <span
        className="inline-block size-3 rounded-full bg-ink ring-1 ring-parchment/50"
        aria-hidden
      />
      {remaining} / {ammo}
      <span className="sr-only">{t('plan.cannonballs')}</span>
    </Badge>
  );
}
