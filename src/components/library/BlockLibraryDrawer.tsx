import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Library, Search, Tag, X } from 'lucide-react';
import { Drawer } from '@/components/shared/Modal';
import { useStore } from '@/store';
import { allTagsIn, listAllBlocks } from '@/utils/blockSelection';
import type { Bullet, Entry } from '@/types';
import { toast } from '@/hooks/useToast';

type View = 'visible' | 'hidden' | 'all';

export function BlockLibraryDrawer() {
  const { t } = useTranslation();
  const open = useStore((s) => s.libraryOpen);
  const setOpen = useStore((s) => s.setLibraryOpen);
  const resume = useStore((s) => s.currentResume);
  const updateResume = useStore((s) => s.updateCurrentResume);

  const [view, setView] = useState<View>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const blocks = useMemo(
    () => (resume ? listAllBlocks(resume) : { entries: [], bullets: [] }),
    [resume],
  );
  const tags = useMemo(() => (resume ? allTagsIn(resume) : []), [resume]);

  if (!resume) return null;

  const matches = (entry: Entry, bullet?: Bullet) => {
    if (view === 'visible') {
      const entryVisible = entry.visible !== false;
      const bulletVisible = bullet ? bullet.visible : entryVisible;
      if (!bulletVisible) return false;
    }
    if (view === 'hidden') {
      const entryHidden = entry.visible === false;
      const bulletHidden = bullet ? !bullet.visible : entryHidden;
      if (!bulletHidden) return false;
    }
    if (activeTag) {
      const targetTags = bullet?.tags ?? entry.tags ?? [];
      if (!targetTags.includes(activeTag)) return false;
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      const text = bullet
        ? bullet.content.replace(/<[^>]*>/g, '').toLowerCase()
        : [entry.title, entry.subtitle, entry.location].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  };

  const filteredEntries = blocks.entries.filter(({ entry }) => matches(entry));
  const filteredBullets = blocks.bullets.filter(({ entry, bullet }) => matches(entry, bullet));

  const toggleEntry = (entryId: string, nextVisible: boolean) => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          entry.id === entryId ? { ...entry, visible: nextVisible } : entry,
        ),
      })),
    }));
  };

  const toggleBullet = (bulletId: string, nextVisible: boolean) => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: entry.bullets?.map((bullet) =>
            bullet.id === bulletId ? { ...bullet, visible: nextVisible } : bullet,
          ),
        })),
      })),
    }));
  };

  const setEntryTags = (entryId: string, tagsIn: string[]) => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) =>
          entry.id === entryId ? { ...entry, tags: tagsIn } : entry,
        ),
      })),
    }));
  };

  const setBulletTags = (bulletId: string, tagsIn: string[]) => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: entry.bullets?.map((bullet) =>
            bullet.id === bulletId ? { ...bullet, tags: tagsIn } : bullet,
          ),
        })),
      })),
    }));
  };

  const showAll = () => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          visible: true,
          bullets: entry.bullets?.map((bullet) => ({ ...bullet, visible: true })),
        })),
      })),
    }));
    toast(t('library.allShown'), { tone: 'success', ttl: 1500 });
  };

  const hideAll = () => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          visible: false,
          bullets: entry.bullets?.map((bullet) => ({ ...bullet, visible: false })),
        })),
      })),
    }));
    toast(t('library.allHidden'), { tone: 'info', ttl: 1500 });
  };

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title={t('library.title')}
      icon={<Library size={16} className="text-accent" />}
      maxWidth="xl"
    >
      <div className="space-y-3 border-b border-paper-edge px-4 py-3">
        <p className="text-xs text-ink-muted">{t('library.hint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label={t('library.view')} className="inline-flex rounded-md border border-paper-edge bg-paper p-0.5">
            {(['all', 'visible', 'hidden'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={`rounded px-2 py-1 text-xs ${
                  view === v ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-paper-tint'
                }`}
              >
                {t(`library.${v}`)}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={showAll}>
            {t('library.showAll')}
          </button>
          <button type="button" className="btn-ghost text-xs" onClick={hideAll}>
            {t('library.hideAll')}
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-paper-edge bg-paper px-2 py-1.5">
          <Search size={14} className="text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none"
          />
          {query && (
            <button
              type="button"
              className="text-ink-subtle hover:text-ink"
              onClick={() => setQuery('')}
              aria-label={t('library.clearSearch')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t('library.tags')}
            </span>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  activeTag === tag
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-paper-edge bg-paper text-ink-muted hover:bg-paper-tint'
                }`}
              >
                <Tag size={9} />
                {tag}
              </button>
            ))}
            {activeTag && (
              <button
                type="button"
                className="text-[10px] text-ink-subtle hover:text-ink"
                onClick={() => setActiveTag(null)}
              >
                {t('library.clearTag')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 p-4 text-sm">
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            {t('library.entries')} ({filteredEntries.length})
          </h3>
          <div className="space-y-2">
            {filteredEntries.length === 0 && (
              <p className="text-xs text-ink-subtle">{t('library.noResults')}</p>
            )}
            {filteredEntries.map(({ section, entry }) => {
              const entryVisible = entry.visible !== false;
              return (
                <div
                  key={entry.id}
                  className={`rounded-md border p-2 ${
                    entryVisible ? 'border-paper-edge bg-paper' : 'border-dashed border-paper-edge bg-paper-tint'
                  }`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                        {section.title}
                      </div>
                      <div className="text-sm font-medium text-ink">
                        {entry.title || entry.subtitle || t('library.untitled')}
                      </div>
                      {entry.subtitle && entry.title && (
                        <div className="text-xs text-ink-muted">{entry.subtitle}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleEntry(entry.id, !entryVisible)}
                      className={`icon-btn h-7 w-7 ${entryVisible ? 'text-ink' : 'text-ink-subtle'}`}
                      title={entryVisible ? t('library.hideEntry') : t('library.showEntry')}
                      aria-label={entryVisible ? t('library.hideEntry') : t('library.showEntry')}
                    >
                      {entryVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                  </div>
                  <TagEditor tags={entry.tags ?? []} onChange={(next) => setEntryTags(entry.id, next)} />
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            {t('library.bullets')} ({filteredBullets.length})
          </h3>
          <div className="space-y-2">
            {filteredBullets.length === 0 && (
              <p className="text-xs text-ink-subtle">{t('library.noResults')}</p>
            )}
            {filteredBullets.map(({ section, entry, bullet }) => (
              <div
                key={bullet.id}
                className={`rounded-md border p-2 ${
                  bullet.visible ? 'border-paper-edge bg-paper' : 'border-dashed border-paper-edge bg-paper-tint'
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                      {section.title} · {entry.title || entry.subtitle || t('library.untitled')}
                    </div>
                    <div className="text-xs text-ink">{bullet.content.replace(/<[^>]*>/g, '')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBullet(bullet.id, !bullet.visible)}
                    className={`icon-btn h-7 w-7 ${bullet.visible ? 'text-ink' : 'text-ink-subtle'}`}
                    title={bullet.visible ? t('library.hideBullet') : t('library.showBullet')}
                    aria-label={bullet.visible ? t('library.hideBullet') : t('library.showBullet')}
                  >
                    {bullet.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
                <TagEditor tags={bullet.tags ?? []} onChange={(next) => setBulletTags(bullet.id, next)} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </Drawer>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const remove = (tag: string) => onChange(tags.filter((existing) => existing !== tag));
  const add = () => {
    const next = draft.trim().toLowerCase();
    if (!next) return;
    if (tags.includes(next)) {
      setDraft('');
      return;
    }
    onChange([...tags, next]);
    setDraft('');
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-paper-tint px-2 py-0.5 text-[10px] text-ink-muted"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="text-ink-subtle hover:text-danger"
            aria-label={t('library.removeTag', { tag })}
          >
            <X size={9} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={t('library.tagPlaceholder')}
        className="min-w-[80px] flex-1 bg-transparent text-[10px] text-ink outline-none"
      />
    </div>
  );
}
