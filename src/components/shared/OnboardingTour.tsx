import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const FLAG = 'resume-editor:onboarding-tour:v2';
const TOTAL_STEPS = 5;

// Each step can spotlight a specific element via `data-tour` attribute on
// existing UI. The backdrop punches a hole around the target so the user's
// eye follows the explanation.
const STEP_TARGETS = ['preview', 'sortable', 'ai-button', 'tailor-button', 'library-button'];

export function OnboardingTour() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(FLAG) !== '1') setShow(true);
    } catch {
      // ignore
    }
  }, []);

  // Measure the spotlight target each step / on resize.
  useLayoutEffect(() => {
    if (!show) return;
    const tag = STEP_TARGETS[index];
    if (!tag) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${tag}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [show, index]);

  const dismiss = () => {
    try {
      localStorage.setItem(FLAG, '1');
    } catch {
      // ignore
    }
    setShow(false);
  };

  // Keyboard: Escape dismisses; Tab is trapped inside the dialog so focus can't
  // wander into the (inert) app behind the modal.
  useEffect(() => {
    if (!show) return;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, index]);

  if (!show) return null;
  const titles = t('tour.titles', { returnObjects: true }) as string[];
  const bodies = t('tour.bodies', { returnObjects: true }) as string[];
  const title = titles[index] ?? '';
  const body = bodies[index] ?? '';
  const isLast = index === TOTAL_STEPS - 1;

  // Spotlight: a single dark backdrop with a soft inset shadow around the
  // target rectangle. Falls back to a flat overlay when no target is found.
  const hasTarget = !!targetRect;
  const padding = 8;
  const radius = 12;

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={t('tour.ariaLabel', { defaultValue: 'Welcome tour' })}
    >
      {hasTarget ? (
        <>
          <div
            aria-hidden
            className="pointer-events-auto absolute inset-0 transition-opacity"
            style={{
              background: 'rgba(0,0,0,0.55)',
              clipPath: `polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                ${targetRect.left - padding}px ${targetRect.top - padding}px,
                ${targetRect.left - padding}px ${targetRect.top + targetRect.height + padding}px,
                ${targetRect.left + targetRect.width + padding}px ${targetRect.top + targetRect.height + padding}px,
                ${targetRect.left + targetRect.width + padding}px ${targetRect.top - padding}px,
                ${targetRect.left - padding}px ${targetRect.top - padding}px
              )`,
            }}
            onClick={dismiss}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-md ring-2 ring-accent"
            style={{
              top: targetRect.top - padding,
              left: targetRect.left - padding,
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
              borderRadius: radius,
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-ink/30" onClick={dismiss} aria-hidden />
      )}

      <div className="absolute inset-0 flex items-end justify-end p-4 sm:items-center sm:justify-center">
        <div
          ref={dialogRef}
          className="pointer-events-auto relative w-full max-w-md rounded-lg border border-paper-edge bg-paper p-5 shadow-page"
        >
          <div className="mb-1 flex items-center justify-between text-xs text-ink-subtle">
            <span>{t('tour.step', { n: index + 1, total: TOTAL_STEPS })}</span>
            <button type="button" className="icon-btn h-6 w-6" onClick={dismiss} aria-label={t('tour.dismiss')}>
              <X size={14} />
            </button>
          </div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="mt-2 text-sm text-ink-muted">{body}</p>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="btn-ghost text-xs" onClick={dismiss}>
              {t('tour.skip')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ChevronLeft size={13} /> {t('common.back')}
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => (isLast ? dismiss() : setIndex((i) => i + 1))}
              >
                {isLast ? t('tour.gotIt') : t('common.next')}
                {!isLast && <ChevronRight size={13} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
