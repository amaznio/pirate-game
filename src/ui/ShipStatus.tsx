interface HullBarProps {
  hp: number;
  maxHp: number;
}

/** Segmented hull health bar. Displays only real mechanics. */
export function HullBar({ hp, maxHp }: HullBarProps) {
  const segments = Array.from({ length: maxHp }, (_, index) => index < hp);
  return (
    <div className="flex items-center gap-1" aria-label={`Hull ${hp} of ${maxHp}`}>
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
