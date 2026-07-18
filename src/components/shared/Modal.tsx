import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEscape } from '@/hooks/useEscape';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | '7xl';
  ariaLabel?: string;
}

const WIDTH_CLASS: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
};

export function Modal({ open, onClose, title, children, footer, maxWidth = 'lg', ariaLabel }: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useFocusTrap(open, dialogRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        className={`flex max-h-[90vh] w-full ${WIDTH_CLASS[maxWidth]} flex-col overflow-hidden rounded-lg bg-paper shadow-page`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={ariaLabel ?? title}
      >
        <div className="flex items-center justify-between border-b border-paper-edge px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-paper-edge px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  side?: 'right' | 'left';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  ariaLabel?: string;
}

const DRAWER_WIDTH: Record<NonNullable<DrawerProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Drawer({
  open,
  onClose,
  title,
  icon,
  badge,
  side = 'right',
  maxWidth = 'xl',
  children,
  ariaLabel,
}: DrawerProps) {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useFocusTrap(open, drawerRef);

  if (!open) return null;

  const sideClass = side === 'right' ? 'right-0 border-l' : 'left-0 border-r';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} aria-hidden />
      <aside
        ref={drawerRef}
        className={`fixed top-0 z-50 flex h-full w-full ${DRAWER_WIDTH[maxWidth]} flex-col bg-paper shadow-page ${sideClass} border-paper-edge`}
        role="dialog"
        aria-label={ariaLabel ?? title}
      >
        <div className="flex items-center justify-between border-b border-paper-edge px-4 py-3">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {badge}
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
