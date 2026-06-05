'use client';
import { useState, useEffect, useCallback } from 'react';
import { getResultUrl, fetchPreviewContent } from '../lib/api';

type Lang = 'en' | 'vi';

interface Sections {
  en: string;
  vi: string;
  hasEN: boolean;
}

function splitBilingual(raw: string): Sections {
  const enRe = /^#{1,3}[^\S\r\n]*(english|en\b|english version)/im;
  const viRe = /^#{1,3}[^\S\r\n]*(tiếng việt|vietnamese|vi\b|bản dịch)/im;
  const enM = enRe.exec(raw);
  const viM = viRe.exec(raw);

  if (enM && viM) {
    const enStart = enM.index;
    const viStart = viM.index;
    if (enStart < viStart) {
      return { en: raw.slice(enStart + enM[0].length, viStart).trim(), vi: raw.slice(viStart + viM[0].length).trim(), hasEN: true };
    }
    return { en: raw.slice(enStart + enM[0].length).trim(), vi: raw.slice(viStart + viM[0].length, enStart).trim(), hasEN: true };
  }

  const parts = raw.split(/\n---\n/);
  if (parts.length >= 2) {
    return { en: parts[0].trim(), vi: parts.slice(1).join('\n---\n').trim(), hasEN: true };
  }

  return { en: '', vi: raw, hasEN: false };
}

function renderMarkdown(md: string): string {
  if (!md) return '';

  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  let h = md
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => { codeBlocks.push(c); return `\x00CB${codeBlocks.length - 1}\x00`; })
    .replace(/`([^`\n]+)`/g, (_, c) => { inlineCodes.push(c); return `\x00IC${inlineCodes.length - 1}\x00`; });

  h = h
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr/>')
    .split('\n\n')
    .map(block => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h[1-6]|pre|ul|ol|blockquote|hr|li)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  codeBlocks.forEach((c, i) => { h = h.replace(`\x00CB${i}\x00`, `<pre><code>${c}</code></pre>`); });
  inlineCodes.forEach((c, i) => { h = h.replace(`\x00IC${i}\x00`, `<code>${c}</code>`); });

  return h;
}

export function ResultView({ jobId, onReset }: { jobId: string; onReset: () => void }) {
  const [downloadUrl, setDownloadUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [sections, setSections] = useState<Sections | null>(null);
  const [tab, setTab] = useState<Lang>('vi');
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getResultUrl(jobId)
      .then(({ downloadUrl: url }) => {
        setDownloadUrl(url);
        setLoadingContent(true);
        return fetchPreviewContent(jobId)
          .then(text => {
            setRawContent(text);
            const parsed = splitBilingual(text);
            setSections(parsed);
            setTab(parsed.hasEN ? 'en' : 'vi');
          })
          .catch(() => { /* preview unavailable, download still works */ })
          .finally(() => setLoadingContent(false));
      })
      .catch(() => setError('Không thể lấy link tải về.'))
      .finally(() => setLoading(false));
  }, [jobId]);

  const handleCopy = useCallback(() => {
    const text = sections ? (tab === 'en' ? sections.en : sections.vi) : rawContent;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [sections, tab, rawContent]);

  const activeContent = sections ? (tab === 'en' ? sections.en : sections.vi) : rawContent;
  const hasPreview = !!activeContent;
  const enDisabled = !sections?.hasEN;

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pb-16" style={{ background: 'var(--bg-base)' }}>
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      {/* ── Header ── */}
      <header className="relative w-full max-w-5xl pt-12 pb-8 text-center animate-fade-up">
        <p className="text-xs font-semibold tracking-[0.22em] uppercase mb-8" style={{ color: 'var(--accent)' }}>
          VietAI Scholar
        </p>

        <div className="flex items-center justify-center gap-4 mb-3 animate-ring-in delay-100">
          {/* Checkmark badge */}
          <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--success-dim)', border: '1px solid rgba(74,222,128,0.25)' }} />
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ position: 'relative' }}>
              <path d="M14 22 L20 28 L30 16" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 40, animation: 'draw-check 0.55s cubic-bezier(0.22,1,0.36,1) 0.25s both' }} />
            </svg>
          </div>

          <h2 style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', fontWeight: 400, fontSize: '2rem', letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
            Dịch hoàn tất!
          </h2>
        </div>

        <p className="text-sm mb-8 delay-200 animate-fade-up" style={{ color: 'var(--text-secondary)' }}>
          Tài liệu của bạn đã được dịch sang tiếng Việt.
        </p>

        {/* Action row */}
        <div className="flex items-center justify-center gap-3 delay-300 animate-fade-up">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-2.5">
              <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Đang tạo link tải...</span>
            </div>
          ) : error ? (
            <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
          ) : downloadUrl ? (
            <a
              href={downloadUrl}
              download="analysis.md"
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200"
              style={{ background: 'var(--success)', color: '#080b12', textDecoration: 'none', letterSpacing: '0.01em' }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Tải về analysis.md
            </a>
          ) : null}

          <button
            onClick={onReset}
            className="rounded-xl px-5 py-2.5 text-sm transition-colors duration-200"
            style={{ background: 'transparent', border: '1px solid var(--border-normal)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-normal)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Dịch file mới
          </button>
        </div>
      </header>

      {/* ── Preview card ── */}
      <div
        className="relative w-full max-w-5xl rounded-2xl overflow-hidden delay-400 animate-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Tab bar */}
        <div
          className="flex items-center justify-between px-5 py-3 gap-3"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
        >
          {/* Language tabs */}
          <div className="flex items-center gap-1">
            {(['en', 'vi'] as Lang[]).map(lang => {
              const active = tab === lang;
              const disabled = lang === 'en' && enDisabled;
              return (
                <button
                  key={lang}
                  onClick={() => !disabled && setTab(lang)}
                  disabled={disabled}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150"
                  style={{
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    border: active ? '1px solid var(--border-normal)' : '1px solid transparent',
                    opacity: disabled ? 0.35 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {lang === 'en' ? 'EN · English' : 'VI · Tiếng Việt'}
                </button>
              );
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {hasPreview && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors duration-150"
                style={{ color: copied ? 'var(--success)' : 'var(--text-muted)', background: 'transparent' }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {copied ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Đã sao chép
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Sao chép
                  </>
                )}
              </button>
            )}

            {/* Language badge */}
            <span
              className="rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
            >
              {tab === 'en' ? 'English' : 'Tiếng Việt'}
            </span>
          </div>
        </div>

        {/* Markdown content */}
        <div className="overflow-y-auto px-8 py-7" style={{ minHeight: 320, maxHeight: 560 }}>
          {loadingContent ? (
            <div className="flex items-center justify-center gap-3" style={{ height: 240 }}>
              <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Đang tải bản xem trước...</span>
            </div>
          ) : !hasPreview ? (
            <div className="flex flex-col items-center justify-center gap-3" style={{ height: 240 }}>
              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                Không thể tải xem trước.<br />Vui lòng tải về để xem nội dung.
              </p>
            </div>
          ) : (
            <div
              className="markdown-preview animate-fade-in"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(activeContent) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
