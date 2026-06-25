'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export type PodcastStatus = 'IDLE' | 'GENERATING' | 'COMPLETED' | 'FAILED';

interface PodcastPlayerContextType {
  jobId: string | null;
  paperTitle: string | null;
  isPlaying: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  downloadUrl: string | null;
  hdMode: boolean;
  fallbackUsed: boolean;
  status: PodcastStatus;
  playPodcast: (jobId: string, paperTitle: string, hdMode?: boolean) => Promise<void>;
  togglePlay: () => void;
  closePlayer: () => void;
  setPlaybackRate: (rate: number) => void;
  seekTo: (time: number) => void;
}

const PodcastPlayerContext = createContext<PodcastPlayerContextType | undefined>(undefined);

// ============================================
// SVG ICONS
// ============================================

const PlayIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--bg-surface)]">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--bg-surface)]">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const CloseIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const HeadphonesIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
);

const SpeedIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="6" x2="12" y2="12" />
    <line x1="12" y1="12" x2="16" y2="14" />
  </svg>
);

// ============================================
// PROVIDER COMPONENT
// ============================================

export function PodcastPlayerProvider({ children }: { children: React.ReactNode }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [hdMode, setHdMode] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [status, setStatus] = useState<PodcastStatus>('IDLE');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || status !== 'COMPLETED') return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Failed to play audio:', err);
      });
    }
  }, [isPlaying, status]);

  const closePlayer = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPlaying(false);
    setJobId(null);
    setPaperTitle(null);
    setDownloadUrl(null);
    setStatus('IDLE');
    setFallbackUsed(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  // Backend Polling with Exponential Backoff
  const pollPodcastStatus = useCallback(async (jid: string, delay: number) => {
    try {
      const response = await fetch(`/api/tools/${jid}/podcast`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'COMPLETED') {
        setDownloadUrl(data.downloadUrl);
        setFallbackUsed(data.fallbackUsed === true);
        setHdMode(data.hdMode === true);
        setStatus('COMPLETED');

        if (audioRef.current) {
          audioRef.current.src = data.downloadUrl;
          audioRef.current.load();
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(err => console.log('Autoplay blocked or failed:', err));
        }
      } else if (data.status === 'FAILED') {
        setStatus('FAILED');
      } else {
        // Continue polling with exponential backoff, max 10 seconds delay
        const nextDelay = Math.min(delay * 1.5, 10000);
        pollTimerRef.current = setTimeout(() => pollPodcastStatus(jid, nextDelay), nextDelay);
      }
    } catch (err) {
      console.error('Error polling podcast status:', err);
      setStatus('FAILED');
    }
  }, [playbackRate]);

  const playPodcast = useCallback(async (jid: string, title: string, hd: boolean = false) => {
    // If clicking on same podcast, toggle play/pause
    if (jobId === jid && status === 'COMPLETED') {
      togglePlay();
      return;
    }

    // Stop and clear current state
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }

    setJobId(jid);
    setPaperTitle(title);
    setHdMode(hd);
    setFallbackUsed(false);
    setStatus('GENERATING');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    try {
      // Trigger podcast generation
      const response = await fetch(`/api/tools/${jid}/podcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hdMode: hd }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'COMPLETED') {
        setDownloadUrl(data.downloadUrl);
        setFallbackUsed(data.fallbackUsed === true);
        setHdMode(data.hdMode === true);
        setStatus('COMPLETED');

        if (audioRef.current) {
          audioRef.current.src = data.downloadUrl;
          audioRef.current.load();
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(err => console.log('Autoplay failed:', err));
        }
      } else {
        // Start polling with initial delay of 2 seconds
        pollTimerRef.current = setTimeout(() => pollPodcastStatus(jid, 2000), 2000);
      }
    } catch (err) {
      console.error('Error initiating podcast:', err);
      setStatus('FAILED');
    }
  }, [jobId, status, togglePlay, pollPodcastStatus, playbackRate]);

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space to toggle play/pause (only if not typing in form/input elements)
      if (e.code === 'Space' && status === 'COMPLETED' && jobId) {
        const activeEl = document.activeElement;
        const isInputField = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true'
        );
        if (!isInputField) {
          e.preventDefault();
          togglePlay();
        }
      }
      // Escape to close player
      if (e.code === 'Escape' && jobId) {
        closePlayer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jobId, status, togglePlay, closePlayer]);

  const value = {
    jobId,
    paperTitle,
    isPlaying,
    playbackRate,
    currentTime,
    duration,
    downloadUrl,
    hdMode,
    fallbackUsed,
    status,
    playPodcast,
    togglePlay,
    closePlayer,
    setPlaybackRate,
    seekTo,
  };

  return (
    <PodcastPlayerContext.Provider value={value}>
      {children}
      <FloatingAudioPlayerUI />
    </PodcastPlayerContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function usePodcastPlayer() {
  const context = useContext(PodcastPlayerContext);
  if (!context) {
    throw new Error('usePodcastPlayer must be used within a PodcastPlayerProvider');
  }
  return context;
}

// ============================================
// FLOATING PLAYER UI WIDGET
// ============================================

function FloatingAudioPlayerUI() {
  const {
    jobId,
    paperTitle,
    isPlaying,
    playbackRate,
    currentTime,
    duration,
    downloadUrl,
    hdMode,
    fallbackUsed,
    status,
    togglePlay,
    closePlayer,
    setPlaybackRate,
    seekTo,
  } = usePodcastPlayer();

  const [isMinimized, setIsMinimized] = useState(false);

  if (status === 'IDLE' || !jobId) return null;

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(parseFloat(e.target.value));
  };

  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
  const cycleSpeed = () => {
    const currentIndex = speeds.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setPlaybackRate(speeds[nextIndex]);
  };

  return (
    <div 
      className="fixed bottom-6 right-6 z-50 animate-fade-up w-80 md:w-[360px] bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-normal)] shadow-2xl rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${status === 'GENERATING' ? 'bg-[var(--accent-dim)] text-[var(--accent)] animate-pulse' : 'bg-[var(--accent)] text-[var(--bg-surface)]'}`}>
            {HeadphonesIcon}
          </div>
          <span className="font-semibold text-xs tracking-wider uppercase">Podcast Khoa Học AI</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Minimize / Maximize Button */}
          <button 
            onClick={() => setIsMinimized(prev => !prev)}
            className="p-1 hover:bg-[var(--border-subtle)] rounded transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title={isMinimized ? "Mở rộng" : "Thu nhỏ"}
            aria-label={isMinimized ? "Mở rộng bảng điều khiển" : "Thu nhỏ bảng điều khiển"}
          >
            {isMinimized ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="10" y1="14" x2="3" y2="21" />
              </svg>
            )}
          </button>

          {/* Close Button */}
          <button 
            onClick={closePlayer}
            className="p-1 hover:bg-[var(--border-subtle)] rounded transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Đóng trình phát"
            aria-label="Đóng trình phát"
          >
            {CloseIcon}
          </button>
        </div>
      </div>

      {/* BODY */}
      {!isMinimized && (
        <div className="p-4 flex flex-col gap-3">
          {/* Paper Title */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--text-secondary)] text-[10px] uppercase font-bold tracking-wider">Bài nghiên cứu</span>
            <div 
              className="text-sm font-medium text-[var(--text-primary)] line-clamp-2 hover:line-clamp-none transition-all duration-150 cursor-pointer"
              title={paperTitle || ''}
            >
              {paperTitle}
            </div>
          </div>

          {/* GENERATING / LOADING STATE */}
          {status === 'GENERATING' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              {/* Skeleton Waveform loading wave */}
              <div className="flex items-center gap-1 h-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((bar) => (
                  <div 
                    key={bar}
                    className="w-1 bg-[var(--accent)] rounded-full animate-pulse"
                    style={{
                      height: '100%',
                      animationDuration: `${0.4 + bar * 0.1}s`,
                      animationDelay: `${bar * 0.05}s`
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-col items-center text-center gap-1">
                <span className="text-xs font-semibold text-[var(--text-primary)]">Đang tổng hợp podcast bằng AI...</span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {hdMode ? 'Đang gọi giọng đọc HD (Edge-TTS) dạng đối thoại' : 'Đang gọi giọng đọc chuẩn (AWS Polly)'}
                </span>
              </div>
            </div>
          )}

          {/* FAILED STATE */}
          {status === 'FAILED' && (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
              <span className="text-xs font-semibold text-[var(--error)]">Tạo podcast không thành công</span>
              <span className="text-[10px] text-[var(--text-secondary)] px-2">Đã xảy ra lỗi khi tạo kịch bản hoặc tổng hợp âm thanh. Vui lòng thử lại.</span>
              <button 
                onClick={closePlayer}
                className="mt-2 text-xs px-3 py-1.5 bg-[var(--border-normal)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] font-medium rounded-lg transition-colors"
              >
                Đóng
              </button>
            </div>
          )}

          {/* COMPLETED / PLAYING STATE */}
          {status === 'COMPLETED' && (
            <div className="flex flex-col gap-3">
              {/* Mode indicator (HD/Polly & Fallback toast warning) */}
              <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${hdMode && !fallbackUsed ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--accent)]'}`} />
                  <span>
                    Chế độ: <strong className="text-[var(--text-primary)]">{hdMode && !fallbackUsed ? 'HD' : 'Standard'}</strong>
                  </span>
                </div>
                {fallbackUsed && (
                  <span className="text-[var(--warning)] font-medium animate-pulse">
                    Đã hạ cấp về Standard (Polly)
                  </span>
                )}
              </div>

              {fallbackUsed && (
                <div className="text-[9px] text-[var(--warning)] leading-normal bg-[var(--warning-dim)] border border-[var(--warning)]/20 p-2 rounded-lg">
                  Lưu ý: Giọng HD (Edge-TTS) bị quá tải hoặc quá giới hạn. Hệ thống tự động chuyển sang giọng chuẩn để tránh làm gián đoạn trải nghiệm của bạn.
                </div>
              )}

              {/* Progress Bar & Seek */}
              <div className="flex flex-col gap-1.5">
                <input 
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleProgressChange}
                  className="w-full h-1 bg-[var(--border-normal)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)] outline-none"
                  style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(currentTime / (duration || 1)) * 100}%, var(--border-normal) ${(currentTime / (duration || 1)) * 100}%, var(--border-normal) 100%)`
                  }}
                  aria-label="Thanh trượt thời gian"
                />
                <div className="flex items-center justify-between text-[10px] font-medium text-[var(--text-secondary)]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* CONTROLS (Speed, Play/Pause, Volume, etc) */}
              <div className="flex items-center justify-between px-2">
                {/* Speed toggle */}
                <button 
                  onClick={cycleSpeed}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border border-[var(--border-normal)] hover:border-[var(--accent)] text-[var(--text-primary)] rounded-full hover:bg-[var(--accent-dim)] transition-all cursor-pointer"
                  title="Thay đổi tốc độ phát"
                >
                  {SpeedIcon}
                  <span>{playbackRate}x</span>
                </button>

                {/* Play/Pause */}
                <button 
                  onClick={togglePlay}
                  className="w-10 h-10 flex items-center justify-center bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-[var(--bg-surface)] rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title={isPlaying ? "Tạm dừng" : "Phát"}
                  aria-label={isPlaying ? "Tạm dừng phát" : "Phát podcast"}
                >
                  {isPlaying ? PauseIcon : PlayIcon}
                </button>

                {/* Download / Presigned S3 action */}
                <a 
                  href={downloadUrl || '#'}
                  download="podcast.mp3"
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 border border-[var(--border-normal)] hover:border-[var(--accent)] text-[var(--text-primary)] rounded-full hover:bg-[var(--accent-dim)] transition-all cursor-pointer flex items-center justify-center"
                  title="Tải file MP3 về máy"
                  aria-label="Tải file MP3 về máy"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
