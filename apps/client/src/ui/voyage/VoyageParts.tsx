import { Circle, Package, Ship } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Banner } from '@/kit/Banner';
import { cargoCapFor, classForHullLevel, maxHullFor } from '@pirate/run-core/run/rules';
import type { RunEvent, RunState } from '@pirate/run-core/run/types';
import { shipLabel } from '../menu/shipClasses';
import { runStore } from '../../run/runStore';
import { eventMessages } from './voyageText';

/** The ship's numbers at a glance: area, class, hull, supplies and cannonballs. */
export function VoyageStats({ run }: { run: RunState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="text-sm">
        {t('voyage.area', { n: run.areaIndex + 1, total: run.areaCount })}
      </Badge>
      <Badge variant="secondary" className="gap-1.5 text-sm">
        <Ship aria-hidden />
        {shipLabel(t, classForHullLevel(run.hullLevel).id)} · {t('voyage.hull')}: {run.hull}/{maxHullFor(run.hullLevel)}
      </Badge>
      <Badge variant="secondary" className="gap-1.5 text-sm">
        <Package aria-hidden />
        {t('voyage.supplies')}: {run.supplies}/{cargoCapFor(run.hullLevel)}
      </Badge>
      <Badge variant="secondary" className="gap-1.5 text-sm">
        <Circle aria-hidden />
        {t('voyage.cannonballs')}: {run.ammo}
      </Badge>
    </div>
  );
}

/** What happened in the last step, as banners. */
export function EventBanners({ events }: { events: readonly RunEvent[] }) {
  const { t } = useTranslation();
  const messages = eventMessages(t, events);
  if (messages.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <Banner key={message.text} tone={message.tone === 'warning' ? 'warning' : 'info'}>
          {message.text}
        </Banner>
      ))}
    </div>
  );
}

/** Gives up the voyage, after asking. */
export function AbandonButton() {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t('voyage.abandon')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-head text-2xl font-bold">{t('voyage.abandonTitle')}</DialogTitle>
          <DialogDescription className="text-base">{t('voyage.abandonBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-col-reverse">
          <Button variant="destructive" onClick={() => runStore.getState().apply({ type: 'abandon' })}>
            {t('voyage.abandon')}
          </Button>
          <DialogClose asChild>
            <Button size="lg">{t('voyage.keepSailing')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
