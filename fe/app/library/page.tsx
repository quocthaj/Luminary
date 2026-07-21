'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getJobs, getResultUrl, JobStatus } from '../../lib/api';
import { ProfileModal } from '../../components/ProfileModal';
import { useAssistant } from '../../contexts/AssistantContext';

export default function LibraryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'translations' | 'explore'>('translations');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const { setContext } = useAssistant();

  // Set Assistant context
  useEffect(() => {
    setContext({ currentPage: 'library' });
  }, [setContext]);

  const handleToggleSelect = (jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  };

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

  const translationJobs = useMemo(() => {
    return filteredJobs.filter((job) => !job.jobId?.startsWith('exp-'));
  }, [filteredJobs]);

  const exploreJobs = useMemo(() => {
    return filteredJobs.filter((job) => !!job.jobId?.startsWith('exp-'));
  }, [filteredJobs]);

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
      <style dangerouslySetInnerHTML={{
        __html: `
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
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-elevated)] px-4 py-2 rounded-full self-start sm:self-center transition-all cursor-pointer"
          >
            {session?.user?.image ? (
              <img src={session.user.image} alt="Avatar" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-[var(--accent)] text-[#080b12] flex items-center justify-center text-[10px] font-bold uppercase">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || 'U'}
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-[var(--text-primary)] max-w-[150px] truncate leading-tight">
                {session?.user?.name || session?.user?.email?.split('@')[0] || 'Thành viên'}
              </span>
              <span className="text-[9px] text-[var(--text-secondary)] max-w-[150px] truncate leading-tight">
                {session?.user?.email}
              </span>
            </div>
          </button>
        </div>

        {/* Thống kê Thư viện (Stats Widget) */}
        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-fade-in">
            {/* Card 1: Tổng tài liệu */}
            <div className="relative overflow-hidden p-4 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)]/40 backdrop-blur-md flex flex-col justify-between group hover:border-[var(--accent)]/30 transition-all duration-300">
              <div aria-hidden className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full bg-[var(--accent)]/5 blur-2xl group-hover:bg-[var(--accent)]/10 transition-all" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Tổng tài liệu</span>
                <p className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 font-mono">{jobs.length}</p>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] mt-2">
                {translationJobs.length} bản dịch • {exploreJobs.length} nghiên cứu
              </p>
            </div>

            {/* Card 2: Thời gian tiết kiệm */}
            <div className="relative overflow-hidden p-4 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)]/40 backdrop-blur-md flex flex-col justify-between group hover:border-[var(--accent)]/30 transition-all duration-300">
              <div aria-hidden className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full bg-[var(--accent)]/5 blur-2xl group-hover:bg-[var(--accent)]/10 transition-all" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Thời gian tiết kiệm</span>
                <p className="text-2xl font-extrabold text-[var(--accent)] mt-1 font-mono">
                  ~{(translationJobs.filter(j => j.status === 'completed' || j.status === 'COMPLETED').length * 1.5 + exploreJobs.filter(j => j.status === 'completed' || j.status === 'COMPLETED').length * 2).toFixed(1)}h
                </p>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] mt-2">
                Tối ưu hóa tự động bằng AI Agents
              </p>
            </div>

            {/* Card 3: Trạng thái xử lý */}
            <div className="relative overflow-hidden p-4 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)]/40 backdrop-blur-md flex flex-col justify-between group hover:border-[var(--accent)]/30 transition-all duration-300">
              <div aria-hidden className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full bg-[var(--accent)]/5 blur-2xl group-hover:bg-[var(--accent)]/10 transition-all" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Tiến trình hiện tại</span>
                <p className="text-2xl font-extrabold text-[var(--text-primary)] mt-1 font-mono">
                  {jobs.filter(j => ['pending', 'extracting', 'processing', 'agents_completed', 'queued', 'GENERATING'].includes(j.status)).length} đang chạy
                </p>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] mt-2">
                {jobs.filter(j => j.status === 'completed' || j.status === 'COMPLETED').length} tài liệu đã sẵn sàng
              </p>
            </div>
          </div>
        )}

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
              Bắt đầu dịch ngay
            </a>
          </div>
        ) : (
          /* Segmented Tabs Layout */
          <div className="w-full flex flex-col gap-6">
            {/* Segmented Control / Tab Switcher */}
            <div className="flex items-center gap-2 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-normal)] max-w-md w-full">
              <button
                onClick={() => setActiveTab('translations')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'translations'
                  ? 'bg-[var(--accent-dim)] border border-[var(--accent)]/30 text-[var(--accent)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-transparent'
                  }`}
              >
                Tài liệu dịch ({translationJobs.length})
              </button>
              <button
                onClick={() => setActiveTab('explore')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'explore'
                  ? 'bg-[var(--accent-dim)] border border-[var(--accent)]/30 text-[var(--accent)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-transparent'
                  }`}
              >
                Khám phá & Tổng hợp ({exploreJobs.length})
              </button>
            </div>

            {activeTab === 'translations' ? (
              /* Column 1: Tài liệu dịch (Translations) */
              <div className="flex flex-col gap-4">
                {translationJobs.length === 0 ? (
                  <div className="text-center py-16 rounded-2xl border border-dashed border-[var(--border-normal)] bg-[var(--bg-surface)]/30">
                    <p className="text-xs text-[var(--text-secondary)] italic">Chưa có tài liệu dịch nào</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {translationJobs.map((job) => {
                      const isProcessing = ['pending', 'extracting', 'processing', 'agents_completed', 'queued', 'GENERATING'].includes(job.status);
                      const isCompleted = job.status === 'completed' || job.status === 'COMPLETED';
                      const isFailed = job.status === 'failed' || job.status === 'FAILED';
                      const isSelected = selectedJobIds.includes(job.jobId);

                      return (
                        <div
                          key={job.jobId}
                          onClick={() => isCompleted && handleToggleSelect(job.jobId)}
                          className={`p-4 rounded-xl border transition-all duration-200 flex items-start gap-3.5 group cursor-pointer ${isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                            : 'border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]'
                            }`}
                        >
                          {/* Checkbox */}
                          {isCompleted && (
                            <div className="flex-shrink-0 mt-0.5 select-none">
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected
                                  ? 'bg-[var(--accent)] border-[var(--accent)] text-[#080b12]'
                                  : 'border-[var(--border-normal)] group-hover:border-[var(--text-secondary)]'
                                  }`}
                              >
                                {isSelected && (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-xs text-[var(--text-primary)] truncate" title={job.fileName}>
                                  {job.fileName || 'Tài liệu không tên.pdf'}
                                </p>
                                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                  Đăng lúc: {formatTime(job.createdAt)}
                                </p>
                              </div>

                              {/* Status badge */}
                              <div className="flex-shrink-0">
                                {isProcessing && (
                                  <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500">
                                    Đang dịch
                                  </span>
                                )}
                                {isCompleted && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border border-green-500/20 bg-green-500/5 text-green-400">
                                    ✓ Hoàn thành
                                  </span>
                                )}
                                {isFailed && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border border-red-500/20 bg-red-500/5 text-red-400">
                                    ✕ Lỗi
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Render visual progress if processing */}
                            {isProcessing && (
                              <div className="w-full flex flex-col gap-1.5 py-1">
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                                    {job.status === 'pending' || job.status === 'queued' ? 'Đang xếp hàng...' :
                                     job.status === 'extracting' ? 'Đang trích xuất văn bản...' :
                                     job.status === 'processing' ? 'AI đang phân tích & dịch...' :
                                     'Đang hiệu đính & hoàn thiện...'}
                                  </span>
                                  <span className="font-bold text-[var(--accent)] font-mono">
                                    {job.status === 'pending' || job.status === 'queued' ? '15%' :
                                     job.status === 'extracting' ? '40%' :
                                     job.status === 'processing' ? '70%' :
                                     '90%'}
                                  </span>
                                </div>
                                <div className="h-1 w-full bg-[var(--border-normal)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--accent)] transition-all duration-500 rounded-full"
                                    style={{
                                      width: job.status === 'pending' || job.status === 'queued' ? '15%' :
                                             job.status === 'extracting' ? '40%' :
                                             job.status === 'processing' ? '70%' :
                                             '90%'
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                              {isCompleted && (
                                <>
                                  <a
                                    href={`/?jobId=${job.jobId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                  >
                                    Xem kết quả
                                  </a>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(job.jobId, job.fileName);
                                    }}
                                    disabled={downloadingJobId === job.jobId}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                                  >
                                    Tải Markdown
                                  </button>
                                </>
                              )}

                              {isProcessing && (
                                <a
                                  href={`/?jobId=${job.jobId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)]"
                                >
                                  Theo dõi tiến trình
                                </a>
                              )}

                              {isFailed && (
                                <span className="text-[10px] text-[var(--text-secondary)] italic">
                                  {job.error ? `Lỗi: ${job.error}` : 'Xử lý tài liệu thất bại.'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Column 2: Khám phá & Tổng hợp (Explore & Synthesis) */
              <div className="flex flex-col gap-4">
                {exploreJobs.length === 0 ? (
                  <div className="text-center py-16 rounded-2xl border border-dashed border-[var(--border-normal)] bg-[var(--bg-surface)]/30">
                    <p className="text-xs text-[var(--text-secondary)] italic">Chưa có chủ đề khám phá nào</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {exploreJobs.map((job) => {
                      const isProcessing = ['pending', 'extracting', 'processing', 'agents_completed', 'queued', 'GENERATING'].includes(job.status);
                      const isCompleted = job.status === 'completed' || job.status === 'COMPLETED';
                      const isFailed = job.status === 'failed' || job.status === 'FAILED';

                      return (
                        <div
                          key={job.jobId}
                          className="p-4 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all duration-200 flex flex-col gap-2.5"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-xs text-[var(--text-primary)] truncate" title={job.fileName}>
                                {job.fileName || 'Khám phá chủ đề'}
                              </p>
                              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                Đăng lúc: {formatTime(job.createdAt)}
                              </p>
                            </div>

                            {/* Status badge */}
                            <div className="flex-shrink-0">
                              {isProcessing && (
                                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-500">
                                  Đang tổng hợp
                                </span>
                              )}
                              {isCompleted && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border border-[var(--accent)]/20 bg-[var(--accent-dim)] text-[var(--accent)]">
                                  Sẵn sàng
                                </span>
                              )}
                              {isFailed && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border border-red-500/20 bg-red-500/5 text-red-400">
                                  ✕ Lỗi
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Render visual progress if processing */}
                          {isProcessing && (
                            <div className="w-full flex flex-col gap-1.5 py-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                                  {job.status === 'pending' || job.status === 'queued' ? 'Đang xếp hàng...' :
                                   job.status === 'extracting' ? 'Đang trích xuất văn bản...' :
                                   job.status === 'processing' ? 'AI đang phân tích & tổng hợp...' :
                                   'Đang hiệu đính & hoàn thiện...'}
                                </span>
                                <span className="font-bold text-[var(--accent)] font-mono">
                                  {job.status === 'pending' || job.status === 'queued' ? '15%' :
                                   job.status === 'extracting' ? '40%' :
                                   job.status === 'processing' ? '70%' :
                                   '90%'}
                                </span>
                              </div>
                              <div className="h-1 w-full bg-[var(--border-normal)] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[var(--accent)] transition-all duration-500 rounded-full"
                                  style={{
                                    width: job.status === 'pending' || job.status === 'queued' ? '15%' :
                                           job.status === 'extracting' ? '40%' :
                                           job.status === 'processing' ? '70%' :
                                           '90%'
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                            {isCompleted && (
                              <>
                                <a
                                  href={`/explore?jobId=${job.jobId}`}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-[var(--accent-dim)] border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#080b12] transition-colors"
                                >
                                  Vào Studio
                                </a>
                                <button
                                  onClick={() => handleDownload(job.jobId, job.fileName)}
                                  disabled={downloadingJobId === job.jobId}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                                >
                                  Tải Markdown
                                </button>
                              </>
                            )}

                            {isProcessing && (
                              <a
                                href={`/explore?jobId=${job.jobId}`}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)]"
                              >
                                Theo dõi tiến trình
                              </a>
                            )}

                            {isFailed && (
                              <span className="text-[10px] text-[var(--text-secondary)] italic">
                                {job.error ? `Lỗi: ${job.error}` : 'Tổng hợp tài liệu thất bại.'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Quick Actions Bar */}
      {selectedJobIds.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-surface)] border border-[var(--accent)] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 max-w-md w-[90%] justify-between backdrop-blur-md">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Đã chọn {selectedJobIds.length} tài liệu
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              Sẵn sàng tổng hợp chéo thông tin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedJobIds([])}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                router.push(`/synthesis?ids=${selectedJobIds.join(',')}`);
              }}
              className="text-xs font-bold px-4 py-1.5 rounded-lg bg-[var(--accent)] text-[#080b12] hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Tổng hợp chéo
            </button>
          </div>
        </div>
      )}

      {/* Profile/Account Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  );
}
