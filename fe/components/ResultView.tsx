'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getResultUrl, fetchPreviewContent, resetMockProgress } from '../lib/api';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useSession, signOut } from 'next-auth/react';
import { LoginModal } from './LoginModal';
import { ProfileModal } from './ProfileModal';

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
  const blockMaths: { raw: string; html: string }[] = [];
  const inlineMaths: { raw: string; html: string }[] = [];

  // Extract code blocks and inline code first
  let h = md
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => { codeBlocks.push(c); return `\x00CB${codeBlocks.length - 1}\x00`; })
    .replace(/`([^`\n]+)`/g, (_, c) => { inlineCodes.push(c); return `\x00IC${inlineCodes.length - 1}\x00`; });

  // Extract block math next (so we don't process internal symbols)
  h = h.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, c) => {
    let renderedHtml = '';
    try {
      renderedHtml = katex.renderToString(c, { displayMode: true, throwOnError: false });
    } catch {
      renderedHtml = `<code class="math-error">${c}</code>`;
    }
    blockMaths.push({ raw: c, html: renderedHtml });
    return `\x00BM${blockMaths.length - 1}\x00`;
  });

  // Extract inline math next
  h = h.replace(/\$([^\$\n]+?)\$/g, (_, c) => {
    let renderedHtml = '';
    try {
      renderedHtml = katex.renderToString(c, { displayMode: false, throwOnError: false });
    } catch {
      renderedHtml = `<code class="math-error">${c}</code>`;
    }
    inlineMaths.push({ raw: c, html: renderedHtml });
    return `\x00IM${inlineMaths.length - 1}\x00`;
  });

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
      const anchorMatch = t.match(/^\{#chunk-(\d+)\}([\s\S]*)$/);
      if (anchorMatch) {
        const chunkIndex = anchorMatch[1];
        const content = anchorMatch[2].replace(/\n/g, '<br/>');
        return `<p id="chunk-${chunkIndex}" data-chunk="${chunkIndex}">${content}</p>`;
      }
      return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  // Put math back
  blockMaths.forEach((m, i) => {
    const rawLatexEscaped = encodeURIComponent(m.raw);
    const wrapper = `<div class="katex-formula-wrapper relative group my-4 flex justify-center items-center rounded-xl p-4 transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle);" data-latex="${rawLatexEscaped}">
      <div class="overflow-x-auto w-full text-center py-2">${m.html}</div>
      <button class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity p-2 rounded-lg shadow-md cursor-pointer z-10 copy-latex-btn flex items-center justify-center gap-1 transition-all duration-150 active:scale-95" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      </button>
    </div>`;
    h = h.replace(`\x00BM${i}\x00`, wrapper);
  });

  inlineMaths.forEach((m, i) => {
    const rawLatexEscaped = encodeURIComponent(m.raw);
    const wrapper = `<span class="katex-formula-wrapper relative group inline-flex items-center mx-0.5 px-1 rounded transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); cursor: default;" data-latex="${rawLatexEscaped}">
      <span>${m.html}</span>
      <button class="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity px-2 py-1 rounded shadow-md text-[10px] cursor-pointer z-10 copy-latex-btn flex items-center gap-1 transition-all duration-150 active:scale-95 whitespace-nowrap" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" />
        </svg>
        <span>Copy</span>
      </button>
    </span>`;
    h = h.replace(`\x00IM${i}\x00`, wrapper);
  });

  codeBlocks.forEach((c, i) => { h = h.replace(`\x00CB${i}\x00`, `<pre><code>${c}</code></pre>`); });
  inlineCodes.forEach((c, i) => { h = h.replace(`\x00IC${i}\x00`, `<code>${c}</code>`); });

  return h;
}

export function ResultView({ jobId, onReset, onReprocess }: { jobId: string; onReset: () => void; onReprocess?: () => void }) {
  const { data: session, status } = useSession();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const [downloadUrl, setDownloadUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [sections, setSections] = useState<Sections | null>(null);
  const [tab, setTab] = useState<Lang>('vi');
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState('');
  const [copiedLang, setCopiedLang] = useState<'en' | 'vi' | 'mobile' | null>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollColRef = useRef<'left' | 'right' | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerFileDownload = useCallback(() => {
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'analysis.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl]);

  const handleDownloadClick = useCallback(() => {
    if (status === 'authenticated') {
      triggerFileDownload();
    } else {
      setPendingDownload(true);
      setShowLoginModal(true);
    }
  }, [status, triggerFileDownload]);

  const handleReprocessClick = useCallback(async () => {
    if (status !== 'authenticated') {
      setShowLoginModal(true);
      return;
    }

    try {
      setReprocessing(true);
      setError('');
      const res = await fetch(`/api/jobs/${jobId}/reprocess`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Dịch lại thất bại');
      }

      if (onReprocess) {
        resetMockProgress();
        onReprocess();
      }
    } catch (err: any) {
      console.error('Reprocess error:', err);
      setError(err.message || 'Không thể dịch lại tài liệu này. Vui lòng thử lại sau.');
    } finally {
      setReprocessing(false);
    }
  }, [jobId, status, onReprocess]);

  const handleLoginSuccess = useCallback(() => {
    triggerFileDownload();
    setPendingDownload(false);
  }, [triggerFileDownload]);

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
            setTab(parsed.hasEN ? 'vi' : 'vi'); // Default to Vietnamese on mobile
          })
          .catch(() => { /* preview unavailable, download still works */ })
          .finally(() => setLoadingContent(false));
      })
      .catch(() => setError('Không thể lấy link tải về.'))
      .finally(() => setLoading(false));

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [jobId]);

  const handleCopyText = useCallback((text: string, lang: 'en' | 'vi' | 'mobile') => {
    if (!navigator.clipboard) {
      console.warn('Clipboard API is not available');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLang(lang);
      setTimeout(() => setCopiedLang(null), 2000);
    });
  }, []);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-latex-btn');
    if (btn) {
      e.stopPropagation();
      const wrapper = btn.closest('.katex-formula-wrapper');
      const latexEscaped = wrapper?.getAttribute('data-latex');
      if (latexEscaped) {
        const latex = decodeURIComponent(latexEscaped);
        if (!navigator.clipboard) {
          console.warn('Clipboard API is not available');
          return;
        }
        navigator.clipboard.writeText(latex)
          .then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `
              <svg class="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            `;
            setTimeout(() => {
              btn.innerHTML = originalHTML;
            }, 1500);
          })
          .catch(err => console.error('Failed to copy LaTeX:', err));
      }
    }
  }, []);

  const handleScrollLeft = useCallback(() => {
    if (activeScrollColRef.current && activeScrollColRef.current !== 'left') return;
    activeScrollColRef.current = 'left';

    const source = leftScrollRef.current;
    const target = rightScrollRef.current;

    if (source && target) {
      const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight);
      target.scrollTop = Math.round(percentage * (target.scrollHeight - target.clientHeight));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      activeScrollColRef.current = null;
    }, 100);
  }, []);

  const handleScrollRight = useCallback(() => {
    if (activeScrollColRef.current && activeScrollColRef.current !== 'right') return;
    activeScrollColRef.current = 'right';

    const source = rightScrollRef.current;
    const target = leftScrollRef.current;

    if (source && target) {
      const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight);
      target.scrollTop = Math.round(percentage * (target.scrollHeight - target.clientHeight));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      activeScrollColRef.current = null;
    }, 100);
  }, []);

  const activeContent = sections ? (tab === 'en' ? sections.en : sections.vi) : rawContent;
  const hasPreview = !!activeContent;
  const enDisabled = !sections?.hasEN;

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pb-16 animate-fade-in" style={{ background: 'var(--bg-base)' }}>
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      {/* Top Header Row */}
      <header className="w-full max-w-5xl px-6 py-4 grid grid-cols-3 items-center z-40 flex-shrink-0">
        {/* Left Spacer */}
        <div />

        {/* Center: Main navigation links */}
        <div className="flex items-center justify-center gap-6">
          <a
            href="/explore"
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] font-bold transition-all uppercase tracking-wider"
          >
            Khám phá
          </a>
          <div aria-hidden className="w-[1px] h-3 bg-[var(--border-normal)]" />
          <a
            href="/library"
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] font-bold transition-all uppercase tracking-wider"
          >
            Thư viện
          </a>
        </div>

        {/* Right Corner: User avatar & Logout button */}
        <div className="flex items-center justify-end gap-3 pr-14">
          {status === 'authenticated' ? (
            <div className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-normal)] px-3 py-1.5 rounded-full shadow-sm animate-fade-in">
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="flex items-center gap-3 hover:opacity-85 transition-opacity cursor-pointer bg-transparent border-none p-0 text-left"
              >
                <div className="hidden lg:flex flex-col text-right">
                  <span className="text-xs font-bold text-[var(--text-primary)] max-w-[120px] truncate leading-tight">
                    {session?.user?.name || session?.user?.email?.split('@')[0] || 'Thành viên'}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] max-w-[120px] truncate leading-tight">
                    {session?.user?.email}
                  </span>
                </div>
                {session?.user?.image ? (
                  <img 
                    src={session.user.image} 
                    alt="Avatar" 
                    className="h-8 w-8 rounded-full border border-[var(--border-subtle)]"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-[var(--accent)] text-[#080b12] flex items-center justify-center text-xs font-bold uppercase">
                    {session?.user?.name?.[0] || session?.user?.email?.[0] || 'U'}
                  </div>
                )}
              </button>
              <div aria-hidden className="w-[1px] h-4 bg-[var(--border-normal)]" />
              <button
                onClick={() => signOut({ redirect: false })}
                className="text-xs text-[var(--text-muted)] hover:text-red-400 font-medium transition-colors border-none bg-transparent cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-normal)] px-5 py-2.5 rounded-full shadow-sm text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all cursor-pointer animate-fade-in"
            >
              <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      {/* ── Title / Status Header ── */}
      <div className="relative w-full max-w-5xl pt-4 pb-8 text-center animate-fade-up">
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
            <>
              <button
                onClick={handleDownloadClick}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer border-none"
                style={{ background: 'var(--success)', color: '#080b12', letterSpacing: '0.01em' }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Tải về analysis.md
              </button>

              <button
                onClick={handleReprocessClick}
                disabled={reprocessing}
                data-authenticated={status === 'authenticated'}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer"
                style={{ background: 'transparent', border: '1px solid var(--border-normal)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-normal)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                {reprocessing ? (
                  <>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
                    Đang khởi tạo...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
                    </svg>
                    Dịch lại
                  </>
                )}
              </button>
            </>
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
      </div>

      {/* ── Preview card ── */}
      <div
        onClick={handleContentClick}
        className="relative w-full max-w-5xl rounded-2xl overflow-hidden delay-400 animate-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Tab bar */}
        <div
          className="flex items-center justify-between px-5 py-3 gap-3"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
        >
          {/* Language tabs - Mobile only when bilingual */}
          <div className={`flex items-center gap-1 ${sections?.hasEN ? 'lg:hidden' : ''}`}>
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

          {/* Desktop Title - Desktop only */}
          {sections?.hasEN && (
            <div className="hidden lg:flex items-center gap-2">
              <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Xem trước song ngữ</span>
            </div>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {hasPreview && (
              <button
                onClick={() => handleCopyText(activeContent, 'mobile')}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors duration-150 lg:hidden"
                style={{ color: copiedLang === 'mobile' ? 'var(--success)' : 'var(--text-muted)', background: 'transparent' }}
                onMouseEnter={e => { if (copiedLang !== 'mobile') e.currentTarget.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { if (copiedLang !== 'mobile') e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {copiedLang === 'mobile' ? (
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

            {/* Language/Bilingual badge */}
            {sections?.hasEN ? (
              <span
                className="rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(74,222,128,0.2)' }}
              >
                <span className="lg:hidden">{tab === 'en' ? 'English' : 'Tiếng Việt'}</span>
                <span className="hidden lg:inline">Bản dịch song ngữ</span>
              </span>
            ) : (
              <span
                className="rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
              >
                Tiếng Việt
              </span>
            )}
          </div>
        </div>

        {/* Content area */}
        {loadingContent ? (
          <div className="flex items-center justify-center gap-3 h-[400px]">
            <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Đang tải bản xem trước...</span>
          </div>
        ) : !hasPreview ? (
          <div className="flex flex-col items-center justify-center gap-3 h-[400px]">
            <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              Không thể tải xem trước.<br />Vui lòng tải về để xem nội dung.
            </p>
          </div>
        ) : sections?.hasEN ? (
          <>
            {/* Desktop Side-by-Side View */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--border-subtle)] h-[600px] overflow-hidden">
              {/* English Column */}
              <div 
                ref={leftScrollRef}
                onScroll={handleScrollLeft}
                className="overflow-y-auto px-8 py-7 h-full scroll-container relative"
              >
                <div className="sticky top-0 z-20 bg-[var(--bg-surface)] pb-2 mb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wider text-[var(--accent)] uppercase">EN · Original English</span>
                  <button
                    onClick={() => handleCopyText(sections.en, 'en')}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors duration-150 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer"
                  >
                    {copiedLang === 'en' ? (
                      <>
                        <svg className="h-3.5 w-3.5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-[var(--success)] font-medium">Đã sao chép</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
                <div
                  className="markdown-preview animate-fade-in"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(sections.en) }}
                />
              </div>

              {/* Vietnamese Column */}
              <div 
                ref={rightScrollRef}
                onScroll={handleScrollRight}
                className="overflow-y-auto px-8 py-7 h-full scroll-container relative"
              >
                <div className="sticky top-0 z-20 bg-[var(--bg-surface)] pb-2 mb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wider text-[var(--success)] uppercase">VI · Tiếng Việt</span>
                  <button
                    onClick={() => handleCopyText(sections.vi, 'vi')}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors duration-150 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer"
                  >
                    {copiedLang === 'vi' ? (
                      <>
                        <svg className="h-3.5 w-3.5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-[var(--success)] font-medium">Đã sao chép</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
                <div
                  className="markdown-preview animate-fade-in"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(sections.vi) }}
                />
              </div>
            </div>

            {/* Mobile View */}
            <div className="lg:hidden h-[560px] overflow-y-auto px-8 py-7 relative">
              <div
                className="markdown-preview animate-fade-in"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(activeContent) }}
              />
            </div>
          </>
        ) : (
          /* Single Language/Fallback View */
          <div className="h-[560px] overflow-y-auto px-8 py-7 relative">
            <div
              className="markdown-preview animate-fade-in"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(activeContent) }}
            />
          </div>
        )}
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setPendingDownload(false);
        }}
        onSuccess={handleLoginSuccess}
      />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  );
}

