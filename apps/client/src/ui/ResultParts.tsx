import { useTranslation } from 'react-i18next';

/** A pixel-art picture (from public/assets), kept crisp when it is scaled up. */
export function PixelIcon({ src, size, className = '' }: { src: string; size: number; className?: string }) {
  return <img src={src} width={size} height={size} alt="" className={`shrink-0 [image-rendering:pixelated] ${className}`} />;
}

/** The hull pips are 8 x 14 pixels of art, drawn at this many times that size. */
const PIP = { width: 8, height: 14 };

/**
 * Hull as a row of little hulls: solid timber for hull left, an empty outline for hull lost. Shape and count
 * carry the meaning, so it reads without colour; the numbers are there for screen readers.
 */
export function PixelHullBar({ hp, maxHp, scale = 2 }: { hp: number; maxHp: number; scale?: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1" role="img" aria-label={t('shipStatus.hull', { hp, maxHp })}>
      {Array.from({ length: maxHp }, (_, index) => (
        <img
          key={index}
          src={`/assets/result/${index < hp ? 'hull-full' : 'hull-empty'}.png`}
          width={PIP.width * scale}
          height={PIP.height * scale}
          alt=""
          className="[image-rendering:pixelated]"
        />
      ))}
    </div>
  );
}

/** One number with its picture and its name. */
export function StatTile({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-btn bg-background/40 px-3 py-2">
      <PixelIcon src={icon} size={32} />
      <div className="flex min-w-0 flex-col">
        <dd className="font-head text-2xl font-bold leading-tight tabular-nums">{value}</dd>
        <dt className="truncate text-xs font-semibold text-muted-foreground">{label}</dt>
      </div>
    </div>
  );
}
