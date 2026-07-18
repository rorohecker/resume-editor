import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  Flower2,
  Orbit,
  Palette,
  Sparkles,
  Sunset,
  type LucideIcon,
} from 'lucide-react';
import { useAccent, type AccentTheme } from '@/hooks/useAccent';

const OPTIONS: {
  value: AccentTheme;
  label: string;
  description: string;
  Icon: LucideIcon;
  swatches: [string, string, string];
}[] = [
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Quiet grayscale focus',
    Icon: Circle,
    swatches: ['#171717', '#737373', '#fafafa'],
  },
  {
    value: 'accent',
    label: 'Professional',
    description: 'Crisp editorial blue',
    Icon: Palette,
    swatches: ['#1d4ed8', '#93c5fd', '#f6f8fc'],
  },
  {
    value: 'distinct',
    label: 'Coastal',
    description: 'Warm paper and ocean teal',
    Icon: Sparkles,
    swatches: ['#115e59', '#f97316', '#f7f5f0'],
  },
  {
    value: 'sakura',
    label: 'Sakura',
    description: 'Cherry bloom glass and jade light',
    Icon: Flower2,
    swatches: ['#f43f8c', '#34d399', '#fff1f6'],
  },
  {
    value: 'sunset',
    label: 'Golden Hour',
    description: 'Coral glow, amber glass, plum ink',
    Icon: Sunset,
    swatches: ['#f97316', '#fbbf24', '#4c1d3d'],
  },
  {
    value: 'cosmic',
    label: 'Cosmic',
    description: 'Neon nebula and animated starlight',
    Icon: Orbit,
    swatches: ['#22d3ee', '#c084fc', '#09051d'],
  },
];

// Rich palette picker. A dropdown keeps six options usable in the compact top
// navigation while giving the expressive themes room for previews.
export function AccentToggle({ compact = false }: { compact?: boolean }) {
  const { accent, setAccent } = useAccent();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = OPTIONS.find((option) => option.value === accent) ?? OPTIONS[1];
  const ActiveIcon = active.Icon;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-paper-edge bg-paper px-2 text-xs text-ink transition-all hover:-translate-y-0.5 hover:shadow-sm ${
          open ? 'ring-2 ring-accent/30' : ''
        }`}
        aria-label={`Theme: ${active.label}`}
        title={`Theme: ${active.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ActiveIcon size={13} />
        {!compact && <span>{active.label}</span>}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="App theme"
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-paper-edge bg-paper/95 p-2 shadow-page backdrop-blur-xl"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="text-xs font-semibold text-ink">Choose your atmosphere</p>
            <p className="text-[10px] text-ink-subtle">Animations respect reduced-motion settings.</p>
          </div>
          <div className="grid gap-1">
            {OPTIONS.map(({ value, label, description, Icon, swatches }) => {
              const selected = accent === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setAccent(value);
                    setOpen(false);
                  }}
                  className={`group flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                    selected
                      ? 'border-accent/50 bg-paper-tint'
                      : 'border-transparent hover:border-paper-edge hover:bg-paper-tint'
                  }`}
                >
                  <span className="relative flex h-9 w-12 shrink-0 overflow-hidden rounded-md border border-paper-edge shadow-inner">
                    {swatches.map((color) => (
                      <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
                    ))}
                    <span className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/30" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Icon size={12} />
                      {label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-subtle">
                      {description}
                    </span>
                  </span>
                  {selected && <Check size={14} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
