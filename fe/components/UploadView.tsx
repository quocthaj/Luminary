'use client';
import { useState, useRef, useEffect } from 'react';
import { createUploadUrl, uploadFile, ApiError } from '../lib/api';
import { useSession, signOut } from 'next-auth/react';
import { LoginModal } from './LoginModal';

export function UploadView({ onJobCreated }: { onJobCreated: (jobId: string) => void }) {
  const { data: session, status } = useSession();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [dragging, setDragging] = useState(false);
  const [trialExceeded, setTrialExceeded] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingUploadUrl, setPendingUploadUrl] = useState<string | null>(null);

  const [simulateNetworkFailure, setSimulateNetworkFailure] = useState(false);
  const [simulateUploadTimeout, setSimulateUploadTimeout] = useState(false);

  const isBlocked = trialExceeded && status !== 'authenticated';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('login_required') === 'true') {
        setShowLoginModal(true);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('login_required');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, []);

  useEffect(() => {
    const checkTrial = () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const isTestExceeded = urlParams.get('test_trial_exceeded') === 'true';
        if (urlParams.get('test_mode') === 'true') {
          setTestMode(true);
        }
        let isTrialUsed = isTestExceeded;
        try {
          isTrialUsed = isTrialUsed || document.cookie.includes('guest_trial_used=true');
        } catch (e) {
          console.warn('Failed to read document.cookie:', e);
        }
        try {
          isTrialUsed = isTrialUsed || localStorage.getItem('guest_trial_used') === 'true';
        } catch (e) {
          console.warn('Failed to read localStorage:', e);
        }
        setTrialExceeded(isTrialUsed);
      }
    };
    checkTrial();
  }, []);

  const simulateUpload = (sizeMB: number, name: string) => {
    const mockFile = new File([], name, { type: 'application/pdf' });
    Object.defineProperty(mockFile, 'size', { value: sizeMB * 1024 * 1024 });
    handleFile(mockFile);
  };

  const handleFile = (f: File) => {
    if (isBlocked) return;
    if (f.type !== 'application/pdf') {
      setError('Chỉ chấp nhận file PDF.');
      setWarning('');
      setFile(null);
      return;
    }
    setError('');
    setWarning('');

    if (f.size > 50 * 1024 * 1024) {
      setError('Kích thước file tối đa được hỗ trợ là 50MB.');
      setFile(null);
      return;
    }

    if (f.size > 30 * 1024 * 1024) {
      setWarning('Tài liệu của bạn vượt quá 30MB, thời gian xử lý sẽ lâu hơn bình thường...');
    }

    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (isBlocked) return;
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file || isBlocked) return;
    setLoading(true);
    setError('');
    setNetworkError(false);

    // Simulation controls for testing
    if (simulateNetworkFailure) {
      await new Promise(resolve => setTimeout(resolve, 800));
      setNetworkError(true);
      setError('Kết nối mạng bị gián đoạn. Vui lòng thử lại.');
      setLoading(false);
      setSimulateNetworkFailure(false);
      return;
    }

    if (simulateUploadTimeout) {
      await new Promise(resolve => setTimeout(resolve, 800));
      setError('Thời gian tải lên vượt quá giới hạn (5 phút). Vui lòng thử lại với kết nối tốt hơn.');
      setLoading(false);
      setSimulateUploadTimeout(false);
      return;
    }

    let activeJobId = pendingJobId;
    let activeUploadUrl = pendingUploadUrl;

    try {
      if (!activeUploadUrl || !activeJobId) {
        try {
          const { jobId, uploadUrl } = await createUploadUrl(file.name);
          activeJobId = jobId;
          activeUploadUrl = uploadUrl;
          setPendingJobId(jobId);
          setPendingUploadUrl(uploadUrl);
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            setTrialExceeded(true);
            try {
              localStorage.setItem('guest_trial_used', 'true');
              document.cookie = 'guest_trial_used=true;path=/';
            } catch (e) {
              console.warn('Failed to persist guest limit state:', e);
            }
            setShowLoginModal(true);
            throw new Error('Trial limit exceeded');
          }
          throw err;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 5 * 60 * 1000); // 5 minutes timeout

      try {
        await uploadFile(activeUploadUrl, file, controller.signal);
        clearTimeout(timeoutId);

        // Mark trial as used on successful upload
        try {
          localStorage.setItem('guest_trial_used', 'true');
          document.cookie = 'guest_trial_used=true;path=/';
        } catch (e) {
          console.warn('Failed to persist guest limit state:', e);
        }

        // Success: clear pending states
        setPendingJobId(null);
        setPendingUploadUrl(null);
        onJobCreated(activeJobId);
      } catch (uploadErr) {
        clearTimeout(timeoutId);
        throw uploadErr;
      }

    } catch (err) {
      console.error('Upload error:', err);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isLimit = err instanceof Error && err.message === 'Trial limit exceeded';
      if (isAbort) {
        setError('Thời gian tải lên vượt quá giới hạn (5 phút). Vui lòng thử lại với kết nối tốt hơn.');
      } else if (isLimit) {
        setError('Đã hết lượt dịch thử. Vui lòng đăng nhập.');
      } else {
        setNetworkError(true);
        setError('Kết nối mạng bị gián đoạn. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!file && !loading && !isBlocked;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 animate-fade-in"
      style={{ background: 'var(--bg-base)' }}
    >
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      {/* Floating Auth Status top right */}
      <div className="absolute top-6 right-6 z-40">
        {status === 'authenticated' ? (
          <div className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-normal)] px-4 py-2 rounded-full shadow-sm">
            <a
              href="/library"
              className="text-xs text-[var(--accent)] hover:underline font-bold mr-1 transition-all"
            >
              Thư viện
            </a>
            <div aria-hidden className="w-[1px] h-4 bg-[var(--border-normal)] mr-0.5" />
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold text-[var(--text-primary)] max-w-[150px] truncate">
                {session?.user?.email}
              </span>
              <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">
                Thành viên
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
                {session?.user?.email?.[0] || 'U'}
              </div>
            )}
            <button
              onClick={() => signOut({ redirect: false })}
              className="text-xs text-[var(--text-muted)] hover:text-red-400 font-medium ml-1 transition-colors border-none bg-transparent cursor-pointer"
            >
              Đăng xuất
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-normal)] px-5 py-2.5 rounded-full shadow-sm text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all cursor-pointer"
          >
            <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Đăng nhập
          </button>
        )}
      </div>

      <div className="relative w-full max-w-md animate-fade-up">

        {/* Brand */}
        <div className="text-center mb-10">
          <p
            className="text-xs font-semibold tracking-[0.22em] uppercase mb-3 delay-100 animate-fade-up"
            style={{ color: 'var(--accent)' }}
          >
            {isBlocked ? 'GUEST TRIAL BLOCKED' : 'Công cụ dịch thuật học thuật'}
          </p>
          <h1
            className="delay-200 animate-fade-up"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '3.2rem',
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              color: 'var(--text-primary)',
            }}
          >
            VietAI Scholar
          </h1>
          <p
            className="mt-3 text-sm delay-300 animate-fade-up"
            style={{ color: 'var(--text-secondary)' }}
          >
            Dịch PDF học thuật EN → VI · LaTeX · Song ngữ
          </p>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => {
            if (isBlocked) {
              setShowLoginModal(true);
            } else {
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); if (!isBlocked) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="relative cursor-pointer rounded-2xl p-10 text-center transition-all duration-200 delay-300 animate-fade-up"
          style={{
            background: isBlocked
              ? 'rgba(22, 29, 46, 0.4)'
              : dragging
              ? 'var(--accent-dim)'
              : file
              ? (warning ? 'var(--warning-dim)' : 'var(--success-dim)')
              : 'var(--bg-surface)',
            border: `1.5px ${dragging ? 'solid' : 'dashed'} ${
              isBlocked
                ? 'var(--border-subtle)'
                : dragging
                ? 'var(--accent)'
                : file
                ? (warning ? 'var(--warning)' : 'var(--success)')
                : 'var(--border-normal)'
            }`,
            boxShadow: dragging && !isBlocked ? '0 0 0 4px var(--accent-glow)' : 'none',
            opacity: isBlocked ? 0.8 : 1,
          }}
        >
          <input
            ref={inputRef}
            id="file-upload-input"
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={isBlocked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {isBlocked ? (
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-normal)' }}
              >
                <svg className="h-7 w-7 text-[var(--error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-[var(--text-primary)]">
                  Đã hết lượt dùng thử vãng lai
                </p>
                <p className="text-xs mt-1.5 text-[var(--text-secondary)] max-w-xs mx-auto leading-normal">
                  Vui lòng <button type="button" onClick={(e) => { e.stopPropagation(); setShowLoginModal(true); }} className="text-[var(--accent)] underline hover:opacity-85 font-semibold cursor-pointer inline bg-transparent border-none p-0">đăng nhập</button> để tiếp tục dịch thuật.
                </p>
              </div>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: warning ? 'var(--warning-dim)' : 'var(--success-dim)' }}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: warning ? 'var(--warning)' : 'var(--success)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-[var(--text-primary)]">
                  {file.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · PDF
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setError('');
                  setWarning('');
                  if (inputRef.current) inputRef.current.value = '';
                }}
                className="text-xs font-semibold px-3 py-1 rounded-lg border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all duration-200 mt-1"
                style={{ color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
              >
                Hủy chọn file
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--text-secondary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-[var(--text-primary)]">
                  {dragging ? 'Thả file vào đây' : 'Kéo thả hoặc click để chọn'}
                </p>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Chỉ chấp nhận PDF · Tối đa 50MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Warning messages */}
        {warning && (
          <div className="mt-3 flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 animate-fade-in">
            <span className="text-xs">⚠️</span>
            <p className="text-xs font-medium text-amber-500/90 leading-normal">
              {warning}
            </p>
          </div>
        )}

        {/* Error messages */}
        {error && (
          <div className="mt-3 flex flex-col items-center gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 animate-fade-in">
            <p className="text-xs font-semibold text-red-500/90 text-center leading-relaxed">
              {networkError ? '⚠️' : '❌'} {error}
            </p>
            {networkError && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                className="text-xs px-4 py-1.5 rounded-lg font-bold border border-red-500/40 hover:bg-red-500/10 hover:text-white transition-all duration-200"
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Thử lại ngay
              </button>
            )}
          </div>
        )}

        {/* CTA button */}
        <button
          id="cta-translation-btn"
          onClick={isBlocked ? () => setShowLoginModal(true) : handleUpload}
          disabled={!isBlocked && !canSubmit}
          className="mt-4 w-full rounded-xl py-3.5 text-sm font-semibold transition-all duration-200 delay-400 animate-fade-up"
          style={{
            background: isBlocked
              ? 'var(--accent)'
              : canSubmit
              ? 'var(--accent)'
              : 'var(--bg-elevated)',
            color: isBlocked
              ? '#080b12'
              : canSubmit
              ? '#080b12'
              : 'var(--text-muted)',
            cursor: (canSubmit || isBlocked) ? 'pointer' : 'not-allowed',
            letterSpacing: '0.01em',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(8,11,18,0.25)',
                  borderTopColor: '#080b12',
                  animation: 'spin-cw 0.75s linear infinite',
                }}
              />
              Đang tải lên...
            </span>
          ) : isBlocked ? (
            'Đăng nhập để dịch'
          ) : (
            'Bắt đầu dịch'
          )}
        </button>

        <p
          className="mt-5 text-center text-xs delay-400 animate-fade-up"
          style={{ color: 'var(--text-muted)' }}
        >
          Kết quả xuất ra Markdown song ngữ · LaTeX và citations giữ nguyên
        </p>
      </div>

      {/* Login Requirement Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />

      {/* Developer Test Panel */}
      {testMode && (
        <div 
          className="fixed bottom-6 right-6 p-4 rounded-2xl shadow-2xl flex flex-col gap-3.5 z-50 border backdrop-blur-md"
          style={{ 
            background: 'rgba(22, 29, 46, 0.85)', 
            borderColor: 'var(--border-normal)',
            width: '280px',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)'
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              🛠️ Dev Test Panel
            </p>
            <span className="text-[8px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded border border-red-900 font-mono">Sandbox</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Simulate File Sizes</span>
            <div className="grid grid-cols-3 gap-1">
              <button 
                onClick={() => simulateUpload(1, 'mock_1mb.pdf')}
                className="text-[10px] py-1.5 rounded bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-800 transition-colors"
                style={{ cursor: 'pointer' }}
              >
                1MB (OK)
              </button>
              <button 
                onClick={() => simulateUpload(35, 'mock_35mb.pdf')}
                className="text-[10px] py-1.5 rounded bg-amber-950/60 text-amber-400 hover:bg-amber-900/60 border border-amber-800 transition-colors"
                style={{ cursor: 'pointer' }}
              >
                35MB (Warn)
              </button>
              <button 
                onClick={() => simulateUpload(55, 'mock_55mb.pdf')}
                className="text-[10px] py-1.5 rounded bg-rose-950/60 text-rose-400 hover:bg-rose-900/60 border border-rose-800 transition-colors"
                style={{ cursor: 'pointer' }}
              >
                55MB (Err)
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">Simulate Network Conditions</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button 
                onClick={() => {
                  setSimulateNetworkFailure(!simulateNetworkFailure);
                  setSimulateUploadTimeout(false);
                }}
                className={`text-[9px] py-1.5 rounded border transition-colors ${
                  simulateNetworkFailure 
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold' 
                    : 'bg-slate-900/40 text-amber-500/80 border-amber-950/50 hover:bg-slate-800/40'
                }`}
                style={{ cursor: 'pointer' }}
              >
                Simulate Network Error
              </button>
              <button 
                onClick={() => {
                  setSimulateUploadTimeout(!simulateUploadTimeout);
                  setSimulateNetworkFailure(false);
                }}
                className={`text-[9px] py-1.5 rounded border transition-colors ${
                  simulateUploadTimeout 
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold' 
                    : 'bg-slate-900/40 text-amber-500/80 border-amber-950/50 hover:bg-slate-800/40'
                }`}
                style={{ cursor: 'pointer' }}
              >
                Simulate Timeout
              </button>
            </div>
          </div>

          <div className="flex gap-2 border-t border-[var(--border-subtle)] pt-2.5">
            <button 
              onClick={() => {
                localStorage.setItem('guest_trial_used', 'true');
                document.cookie = 'guest_trial_used=true;path=/';
                window.location.reload();
              }}
              className="text-[10px] flex-1 py-1.5 rounded bg-red-950 text-red-300 hover:bg-red-900 border border-red-800 transition-colors"
              style={{ cursor: 'pointer' }}
            >
              Limit Trial
            </button>
            <button 
              onClick={() => {
                localStorage.removeItem('guest_trial_used');
                document.cookie = 'guest_trial_used=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT';
                const url = new URL(window.location.href);
                url.searchParams.delete('test_trial_exceeded');
                window.history.replaceState({}, '', url.toString());
                window.location.reload();
              }}
              className="text-[10px] flex-1 py-1.5 rounded bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-700 transition-colors"
              style={{ cursor: 'pointer' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
