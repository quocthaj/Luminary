'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getJobs, getResultUrl, JobStatus } from '../../lib/api';

export default function LibraryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  // 1. Session check & redirect
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/?login_required=true');
    }
  }, [status, router]);

  // 2. Fetch jobs
  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchJobsList = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getJobs();
        setJobs(data);
      } catch (err: any) {
        console.error('Error fetching jobs:', err);
        setError('Không thể tải danh sách tài liệu. Vui lòng thử lại sau.');
      } finally {
        setLoading(false);
      }
    };

    fetchJobsList();
  }, [status]);

  // 3. Filter jobs by time
  const filteredJobs = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTimestamp = Math.floor(startOfToday.getTime() / 1000);

    return jobs.filter((job) => {
      if (!job.createdAt) return false;
      const createdAtSec = parseInt(job.createdAt);
      if (isNaN(createdAtSec)) return false;

      if (timeFilter === 'today') {
        return createdAtSec >= startOfTodayTimestamp;
      }
      if (timeFilter === '7days') {
        return createdAtSec >= now - 7 * 24 * 3600;
      }
      if (timeFilter === '30days') {
        return createdAtSec >= now - 30 * 24 * 3600;
      }
      return true; // 'all'
    });
  }, [jobs, timeFilter]);

  // 4. Download file handler
  const handleDownload = async (jobId: string, fileName?: string) => {
    try {
      setDownloadingJobId(jobId);
      const { downloadUrl } = await getResultUrl(jobId);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName ? fileName.replace('.pdf', '_dich.md') : 'translation.md');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Download error:', err);
      alert('Không thể tải file dịch. Vui lòng thử lại sau.');
    } finally {
      setDownloadingJobId(null);
    }
  };

  // Format timestamp to localized string
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return 'Không rõ thời gian';
    const sec = parseInt(timestamp);
    if (isNaN(sec)) return 'Không rõ thời gian';
    
    return new Date(sec * 1000).toLocaleString('vi-VN', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center">
          <div
            style={{
              display: 'inline-block',
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '3px solid var(--border-normal)',
              borderTopColor: 'var(--accent)',
              animation: 'spin-cw 0.75s linear infinite',
            }}
          />
          <p className="mt-4 text-xs font-semibold tracking-wider text-[var(--text-secondary)]">ĐANG KIỂM TRA QUYỀN TRUY CẬP...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen p-6 relative" style={{ background: 'var(--bg-base)' }}>
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      {/* CSS Shimmer styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-bg {
          background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--border-normal) 50%, var(--bg-elevated) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
        }
      `}} />

      <div className="relative w-full max-w-4xl mx-auto pt-6 animate-fade-in">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors mb-3"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Quay lại trang chủ
            </a>
            <h1
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: '2.5rem',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}
            >
              Thư viện tài liệu
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Danh sách các tài liệu học thuật đã được dịch của bạn.
            </p>
          </div>

          {/* User profile brief */}
          <div className="flex items-center gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-normal)] px-4 py-2 rounded-full self-start sm:self-center">
            {session?.user?.image ? (
              <img src={session.user.image} alt="Avatar" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-[var(--accent)] text-[#080b12] flex items-center justify-center text-[10px] font-bold uppercase">
                {session?.user?.email?.[0] || 'U'}
              </div>
            )}
            <span className="text-xs font-semibold text-[var(--text-primary)] max-w-[150px] truncate">
              {session?.user?.email}
            </span>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-normal)] pb-4 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {(['all', 'today', '7days', '30days'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background: timeFilter === filter ? 'var(--accent-dim)' : 'transparent',
                  borderColor: timeFilter === filter ? 'var(--accent)' : 'var(--border-normal)',
                  color: timeFilter === filter ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {filter === 'all' && 'Tất cả'}
                {filter === 'today' && 'Hôm nay'}
                {filter === '7days' && '7 ngày qua'}
                {filter === '30days' && '30 ngày qua'}
              </button>
            ))}
          </div>

          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Tìm thấy {filteredJobs.length} tài liệu
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-xs font-semibold text-red-500/90 text-center mb-6">
            ❌ {error}
          </div>
        )}

        {/* Loading state / Shimmer loading skeletons */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-5 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] flex flex-col gap-3"
              >
                <div className="h-5 w-2/3 rounded shimmer-bg" />
                <div className="h-3 w-1/4 rounded shimmer-bg" />
                <div className="flex gap-2.5 mt-2">
                  <div className="h-8 w-24 rounded-lg shimmer-bg" />
                  <div className="h-8 w-24 rounded-lg shimmer-bg" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20 rounded-2xl border border-dashed border-[var(--border-normal)] bg-[var(--bg-surface)]">
            <svg className="h-10 w-10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--text-secondary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-semibold text-sm text-[var(--text-primary)]">Chưa có tài liệu nào</p>
            <p className="text-xs mt-1 text-[var(--text-secondary)]">Bạn chưa tải lên hoặc chưa dịch tài liệu nào trong khoảng thời gian này.</p>
            <a
              href="/"
              className="inline-block mt-4 text-xs font-bold px-4 py-2 rounded-lg"
              style={{ background: 'var(--accent)', color: '#080b12' }}
            >
              Dịch tài liệu đầu tiên
            </a>
          </div>
        ) : (
          /* Documents list */
          <div className="flex flex-col gap-4">
            {filteredJobs.map((job) => {
              const isProcessing = ['pending', 'extracting', 'processing', 'agents_completed', 'queued'].includes(job.status);
              const isCompleted = job.status === 'completed';
              const isFailed = job.status === 'failed';

              return (
                <div
                  key={job.jobId}
                  className="p-5 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all duration-200 flex flex-col gap-3 group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[var(--text-primary)] truncate" title={job.fileName}>
                        {job.fileName || 'Tài liệu không tên.pdf'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        Đăng lúc: {formatTime(job.createdAt)}
                      </p>
                    </div>

                    {/* Status badges */}
                    <div className="self-start">
                      {isProcessing && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500">
                          <span
                            style={{
                              display: 'inline-block',
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: 'var(--warning)',
                              animation: 'pulse-dot 1.2s infinite ease-in-out',
                            }}
                          />
                          Đang dịch...
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-green-500/20 bg-green-500/5 text-green-400">
                          ✓ Hoàn thành
                        </span>
                      )}
                      {isFailed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-red-500/20 bg-red-500/5 text-red-400">
                          ✕ Lỗi dịch
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 mt-1 pt-2 border-t border-[var(--border-subtle)]">
                    {isCompleted && (
                      <>
                        <a
                          href={`/?jobId=${job.jobId}`}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Xem kết quả
                        </a>
                        <button
                          onClick={() => handleDownload(job.jobId, job.fileName)}
                          disabled={downloadingJobId === job.jobId}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border-normal)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                        >
                          {downloadingJobId === job.jobId ? (
                            <>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  border: '1.5px solid var(--border-normal)',
                                  borderTopColor: 'var(--text-primary)',
                                  animation: 'spin-cw 0.75s linear infinite',
                                }}
                              />
                              Đang tải...
                            </>
                          ) : (
                            <>
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Tải Markdown
                            </>
                          )}
                        </button>
                      </>
                    )}

                    {isProcessing && (
                      <a
                        href={`/?jobId=${job.jobId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border-normal)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        Theo dõi tiến trình
                      </a>
                    )}

                    {isFailed && (
                      <span className="text-xs text-[var(--text-secondary)] italic">
                        {job.error ? `Lỗi: ${job.error}` : 'Xử lý tài liệu thất bại.'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
