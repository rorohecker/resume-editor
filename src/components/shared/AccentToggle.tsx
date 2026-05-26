import { Circle, Palette, Sparkles } from 'lucide-react';
import { useAccent, type AccentTheme } from '@/hooks/useAccent';

const OPTIONS: { value: AccentTheme; label: string; description: string; Icon: typeof Circle }[] = [
  { value: 'minimal', label: 'Minimal', description: 'Quiet greyscale chrome', Icon: Circle },
  { value: 'accent', label: 'Accent', description: 'Subtle blue accent', Icon: Palette },
  { value: 'distinct', label: 'Distinct', description: 'Warm teal palette', Icon: Sparkles },
];

// Picker for the three editor-chrome accents. Hooks the same compact pill
// style as the existing ThemeToggle for visual consistency.
export function AccentToggle({ compact = false }: { compact?: boolean }) {
  const { accent, setAccent } = useAccent();
  return (
    <div
      role="radiogroup"
      aria-label="Accent palette"
      className="inline-flex rounded-md border border-paper-edge bg-paper p-0.5"
    >
      {OPTIONS.map(({ value, label, description, Icon }) => {
        const active = accent === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={description}
            onClick={() => setAccent(value)}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              active
                ? 'bg-ink text-paper'
                : 'text-ink-muted hover:bg-paper-tint hover:text-ink'
            }`}
          >
            <Icon size={12} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
