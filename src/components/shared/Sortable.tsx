import { type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SortableListProps<T extends { id: string }> {
  items: T[];
  onReorder: (next: T[]) => void;
  children: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
  // Passthrough for `data-*` attributes (used by the onboarding tour to find
  // a sortable list to spotlight).
  ['data-tour']?: string;
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
  className,
  ...rest
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Touch: a 250ms long-press before drag starts so taps still scroll the page,
    // with a small tolerance so a finger wobble doesn't cancel.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  // Alt+arrow on a focused row reorders without grabbing the drag handle.
  // Complements dnd-kit's Space+arrow grip-based ARIA pattern.
  const handleKeyboardMove = (id: string, delta: -1 | 1) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    onReorder(arrayMove(items, index, target));
  };

  const tourTag = rest['data-tour'];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className={className} data-tour={tourTag}>
          {items.map((item) => (
            <SortableItem
              key={item.id}
              id={item.id}
              onKeyboardMove={(delta) => handleKeyboardMove(item.id, delta)}
            >
              {(handle) => children(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  children,
  onKeyboardMove,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
  onKeyboardMove?: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };
  // Touch-friendlier hit area: 32px on touch devices, 24px on pointer where it
  // only appears on hover.
  const handle = (
    <button
      type="button"
      className="icon-btn h-8 w-8 cursor-grab text-ink-subtle [@media(hover:hover)]:h-6 [@media(hover:hover)]:w-6 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-hover/sortable:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
      aria-label={t('common.drag')}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/sortable"
      onKeyDown={(event) => {
        if (!onKeyboardMove || !event.altKey) return;
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onKeyboardMove(-1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onKeyboardMove(1);
        }
      }}
    >
      {children(handle)}
    </div>
  );
}
