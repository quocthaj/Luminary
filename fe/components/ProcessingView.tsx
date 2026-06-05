'use client';
import { useState, useEffect } from 'react';
import { getJobStatus } from '../lib/api';

const STEPS = [
  { label: 'Nhận file',  statuses: ['pending', 'queued'] },
  { label: 'Trích xuất', statuses: ['extracting', 'extracted'] },
  { label: 'Dịch thuật', statuses: ['orchestrating', 'processing'] },
  { label: 'Hoàn thành', statuses: ['completed'] },
];

function getCurrentStep(status: string): number {
  const idx = STEPS.findIndex(s => s.statuses.includes(status));
  return idx === -1 ? 0 : idx;
}

const STATUS_LABELS: Record<string, string> = {
  pending:       'Đang chờ xử lý...',
  queued:        'Đã xếp hàng, chuẩn bị chạy...',
  extracting:    'Đang trích xuất văn bản...',
  extracted:     'Đã trích xuất, bắt đầu dịch...',
  orchestrating: 'Đang điều phối dịch thuật...',
  processing:    'Đang xử lý...',
  completed:     'Hoàn thành!',
  failed:        'Xử lý thất bại.',
};

export function ProcessingView({ jobId, onComplete }: { jobId: string; onComplete: () => void }) {
  const [status, setStatus] = useState('queued');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function doPoll() {
      if (!active) return;
      try {
        const job = await getJobStatus(jobId);
        if (!active) return;
        setStatus(job.status);
        if (job.status === 'completed') { onComplete(); return; }
        if (job.status === 'failed') { setError(job.error || 'Đã xảy ra lỗi không xác định.'); return; }
      } catch {
        // network hiccup — retry
      }
      if (active) setTimeout(doPoll, 3000);
    }

    doPoll();
    return () => { active = false; };
  }, [jobId, onComplete]);

  const currentStep = getCurrentStep(status);
  const isFailed = status === 'failed';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg-base)' }}
    >
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      <div className="relative w-full max-w-sm text-center animate-fade-up">
        {/* Brand */}
        <p
          className="text-xs font-semibold tracking-[0.22em] uppercase mb-2"
          style={{ color: 'var(--accent)' }}
        >
          VietAI Scholar
        </p>

        {isFailed ? (
          /* ── Error state ── */
          <div className="animate-fade-in">
            <div className="my-10 flex justify-center">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full"
                style={{ background: 'var(--error-dim)', border: '1px solid var(--error)' }}
              >
                <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--error)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <p
              className="text-xl font-semibold"
              style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', color: 'var(--error)' }}
            >
              Xử lý thất bại
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        ) : (
          /* ── Processing state ── */
          <>
            {/* Dual-ring animation */}
            <div className="my-10 flex justify-center animate-ring-in delay-100">
              <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
                {/* Outer ring — dashed, slow CW */}
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    borderRadius: '50%',
                    border: '1.5px dashed rgba(232,184,75,0.35)',
                    animation: 'spin-cw 5s linear infinite',
                  }}
                />
                {/* Middle ring — solid, CCW */}
                <div
                  style={{
                    position: 'absolute', inset: 10,
                    borderRadius: '50%',
                    border: '2px solid transparent',
                    borderTopColor: 'var(--accent)',
                    borderRightColor: 'var(--accent)',
                    animation: 'spin-ccw 1.4s linear infinite',
                  }}
                />
                {/* Center dot */}
                <div
                  style={{
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: 'pulse-dot 2s ease-in-out infinite',
                  }}
                />
              </div>
            </div>

            {/* Status label */}
            <p
              className="text-xl mb-1"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                fontWeight: 400,
                color: 'var(--text-primary)',
              }}
            >
              {STATUS_LABELS[status] ?? 'Đang xử lý...'}
            </p>
            <p className="text-xs font-mono mb-10" style={{ color: 'var(--text-muted)' }}>
              {jobId}
            </p>

            {/* Pipeline stepper */}
            <div
              className="rounded-2xl p-5"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between relative">
                {/* connector line */}
                <div
                  className="absolute top-3.5 left-3.5 right-3.5"
                  style={{ height: 1, background: 'var(--border-normal)', zIndex: 0 }}
                />
                {STEPS.map((step, i) => {
                  const done    = i < currentStep;
                  const active  = i === currentStep;
                  return (
                    <div key={step.label} className="flex flex-col items-center gap-2 relative z-10">
                      {/* Circle */}
                      <div
                        style={{
                          width: 28, height: 28,
                          borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: done || active ? 'var(--accent)' : 'var(--bg-elevated)',
                          border: `1.5px solid ${done || active ? 'var(--accent)' : 'var(--border-normal)'}`,
                          boxShadow: active ? '0 0 0 4px var(--accent-glow)' : 'none',
                          transition: 'all 0.4s ease',
                        }}
                      >
                        {done ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="#080b12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span
                            style={{
                              width: 6, height: 6,
                              borderRadius: '50%',
                              background: active ? '#080b12' : 'var(--text-muted)',
                            }}
                          />
                        )}
                      </div>
                      {/* Label */}
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: done || active ? 'var(--text-primary)' : 'var(--text-muted)',
                          transition: 'color 0.4s ease',
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
