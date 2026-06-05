'use client';
import { useState, useRef } from 'react';
import { createUploadUrl, uploadFile } from '../lib/api';

export function UploadView({ onJobCreated }: { onJobCreated: (jobId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') { setError('Chỉ chấp nhận file PDF.'); return; }
    if (f.size > 50 * 1024 * 1024) { setError('File quá lớn. Tối đa 50MB.'); return; }
    setError('');
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const { jobId, uploadUrl } = await createUploadUrl(file.name);
      await uploadFile(uploadUrl, file);
      onJobCreated(jobId);
    } catch (err) {
      setError('Tải lên thất bại. Vui lòng thử lại.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!file && !loading;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg-base)' }}
    >
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      <div className="relative w-full max-w-md animate-fade-up">

        {/* Brand */}
        <div className="text-center mb-10">
          <p
            className="text-xs font-semibold tracking-[0.22em] uppercase mb-3 delay-100 animate-fade-up"
            style={{ color: 'var(--accent)' }}
          >
            Công cụ dịch thuật học thuật
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
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="relative cursor-pointer rounded-2xl p-10 text-center transition-all duration-200 delay-300 animate-fade-up"
          style={{
            background: dragging
              ? 'var(--accent-dim)'
              : file
              ? 'var(--success-dim)'
              : 'var(--bg-surface)',
            border: `1.5px dashed ${
              dragging ? 'var(--accent)' : file ? 'var(--success)' : 'var(--border-normal)'
            }`,
            boxShadow: dragging ? '0 0 0 4px var(--accent-glow)' : 'none',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {file ? (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: 'var(--success-dim)' }}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--success)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  {file.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · PDF
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Click để chọn file khác
              </p>
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
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  {dragging ? 'Thả file vào đây' : 'Kéo thả hoặc click để chọn'}
                </p>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Chỉ chấp nhận PDF · Tối đa 50MB
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-center animate-fade-in" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        )}

        {/* CTA button */}
        <button
          onClick={handleUpload}
          disabled={!canSubmit}
          className="mt-4 w-full rounded-xl py-3.5 text-sm font-semibold transition-all duration-200 delay-400 animate-fade-up"
          style={{
            background: canSubmit ? 'var(--accent)' : 'var(--bg-elevated)',
            color: canSubmit ? '#080b12' : 'var(--text-muted)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
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
    </div>
  );
}
