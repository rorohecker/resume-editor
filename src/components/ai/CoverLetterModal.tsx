import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FileText, Sparkles } from 'lucide-react';
import { useStore } from '@/store';
import { generateCoverLetter } from '@/utils/aiAssist';
import { generateAiText, loadAiSettings, promptForCoverLetter } from '@/utils/aiByok';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';

export function CoverLetterModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.coverLetterOpen);
  const setOpen = useStore((s) => s.setCoverLetterOpen);
  const resume = useStore((s) => s.currentResume);
  const [jobDescription, setJobDescription] = useState('');
  const [letter, setLetter] = useState('');
  const [busy, setBusy] = useState(false);

  const settings = loadAiSettings();
  const hasKey = Boolean(settings.apiKey.trim());

  const generate = async () => {
    if (!resume) return;
    setBusy(true);
    try {
      const text = hasKey
        ? await generateAiText(settings, promptForCoverLetter(resume, jobDescription), 900)
        : generateCoverLetter(resume, jobDescription);
      setLetter(text);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('cover.generationFailed'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const downloadText = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!letter || !resume) return;
    const base = `${(resume.header.name || resume.name).replace(/\s+/g, '_').replace(/[^a-z0-9_-]/gi, '')}_CoverLetter`;
    if (format === 'txt') {
      downloadBlob(new Blob([letter], { type: 'text/plain;charset=utf-8' }), `${base}.txt`);
      toast(t('cover.downloaded', { format: 'TXT' }), { tone: 'success' });
      return;
    }
    if (format === 'docx') {
      const docx = await import('docx');
      const { Document, Packer, Paragraph } = docx;
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: letter.split('\n').map((line) => new Paragraph(line)),
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${base}.docx`);
      toast(t('cover.downloaded', { format: 'DOCX' }), { tone: 'success' });
      return;
    }
    const pdfModule = await import('@react-pdf/renderer');
    const { Document, Page, Text, StyleSheet, pdf } = pdfModule;
    const styles = StyleSheet.create({
      page: { padding: 64, fontSize: 11, lineHeight: 1.45 },
      paragraph: { marginBottom: 8 },
    });
    const blob = await pdf(
      <Document title={t('cover.pdfTitle', { name: resume.header.name || resume.name })}>
        <Page size="LETTER" style={styles.page}>
          {letter.split('\n').map((line, idx) => (
            <Text key={idx} style={styles.paragraph}>
              {line || ' '}
            </Text>
          ))}
        </Page>
      </Document>,
    ).toBlob();
    downloadBlob(blob, `${base}.pdf`);
    toast(t('cover.downloaded', { format: 'PDF' }), { tone: 'success' });
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('cover.title')}
      maxWidth="4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => {
              setLetter('');
              setJobDescription('');
            }}
          >
            {t('cover.clear')}
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!letter}
              onClick={() => {
                void navigator.clipboard.writeText(letter);
                toast(t('cover.copied'), { tone: 'success', ttl: 1500 });
              }}
            >
              <Copy size={13} /> {t('common.copy')}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={!letter}
              onClick={() => void downloadText('txt')}
            >
              <FileText size={13} /> {t('cover.txt')}
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={!letter}
              onClick={() => void downloadText('docx')}
            >
              <Download size={13} /> {t('cover.docx')}
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={!letter}
              onClick={() => void downloadText('pdf')}
            >
              <Download size={13} /> {t('cover.pdf')}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">{t('cover.jobOptional')}</span>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={t('cover.jobPlaceholder')}
            className="input min-h-32 resize-y"
            spellCheck
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={!resume || busy}
          onClick={() => void generate()}
        >
          <Sparkles size={14} />
          {busy ? t('cover.generating') : hasKey ? t('cover.generateBYOK') : t('cover.generateLocal')}
        </button>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">{t('cover.draftLabel')}</span>
          <textarea
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            placeholder={t('cover.draftPlaceholder')}
            className="input min-h-72 resize-y"
            spellCheck
          />
        </label>
      </div>
    </Modal>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
