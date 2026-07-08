'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ProfileSettings {
  name: string;
  role: string;
  affiliation: string;
  agentDepth: 'standard' | 'deep';
  defenseIntensity: 'supportive' | 'aggressive';
  translationStyle: 'literal' | 'bilingual' | 'original';
}

const DEFAULT_SETTINGS: ProfileSettings = {
  name: '',
  role: 'student',
  affiliation: '',
  agentDepth: 'standard',
  defenseIntensity: 'supportive',
  translationStyle: 'bilingual',
};

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { data: session, update } = useSession();
  const [activeTab, setActiveTab] = useState<'profile' | 'agent'>('profile');
  const [settings, setSettings] = useState<ProfileSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load settings on open
  useEffect(() => {
    if (!isOpen) return;

    const saved = localStorage.getItem('vietai-scholar-profile-settings');
    let parsed: Partial<ProfileSettings> = {};
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse profile settings:', e);
      }
    }

    setSettings({
      name: parsed.name ?? session?.user?.name ?? session?.user?.email?.split('@')[0] ?? '',
      role: parsed.role ?? 'student',
      affiliation: parsed.affiliation ?? '',
      agentDepth: parsed.agentDepth ?? 'standard',
      defenseIntensity: parsed.defenseIntensity ?? 'supportive',
      translationStyle: parsed.translationStyle ?? 'bilingual',
    });
    setSaveSuccess(false);
  }, [isOpen, session]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // Save settings to localStorage
      localStorage.setItem('vietai-scholar-profile-settings', JSON.stringify(settings));
      
      // Update session locally if next-auth supports client-side updates
      if (session?.user && settings.name !== session.user.name) {
        await update?.({
          ...session,
          user: {
            ...session.user,
            name: settings.name,
          }
        }).catch(() => {});
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in no-print"
      style={{ background: 'rgba(8, 11, 18, 0.82)', backdropFilter: 'blur(12px)' }}
    >
      <div 
        className="w-full max-w-lg p-6 sm:p-7 rounded-3xl border shadow-2xl flex flex-col gap-5 relative animate-fade-up animate-ring-in"
        style={{ 
          background: 'var(--bg-surface)', 
          borderColor: 'var(--border-normal)',
          boxShadow: '0 30px 60px -15px rgba(0,0,0,0.6)'
        }}
      >
        {/* Close button */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all duration-200 p-1.5 rounded-full bg-transparent border-none cursor-pointer flex items-center justify-center"
          aria-label="Đóng"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 pb-2">
          <div className="h-10 w-10 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/15">
            <svg className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Thông tin tài khoản</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Tùy biến thông tin cá nhân và hành vi hệ thống AI Agent.</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[var(--border-subtle)] gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 bg-transparent cursor-pointer ${
              activeTab === 'profile'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Thông tin cá nhân
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agent')}
            className={`pb-2.5 px-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 bg-transparent cursor-pointer ${
              activeTab === 'agent'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Cấu hình AI Agent
          </button>
        </div>

        {/* Form content */}
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {activeTab === 'profile' ? (
            /* Tab 1: Profile information */
            <div className="flex flex-col gap-4 py-1">
              <div className="flex items-center gap-4 bg-[var(--bg-elevated)]/25 p-3 rounded-2xl border border-[var(--border-subtle)]">
                {session?.user?.image ? (
                  <img src={session.user.image} alt="Avatar" className="h-12 w-12 rounded-full border border-[var(--border-normal)]" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-[var(--accent)] text-[#080b12] flex items-center justify-center text-base font-bold uppercase">
                    {settings.name?.[0] || 'U'}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-[var(--text-muted)] font-medium">Tài khoản liên kết</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{session?.user?.email}</span>
                </div>
              </div>

              {/* Họ tên */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Họ và tên
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập họ và tên..."
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full px-4.5 py-3 rounded-xl border text-xs focus:outline-none transition-all duration-200"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-normal)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Vai trò học thuật & Trường học */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Vai trò học thuật
                  </label>
                  <select
                    value={settings.role}
                    onChange={(e) => setSettings({ ...settings, role: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border text-xs focus:outline-none transition-all duration-200 cursor-pointer appearance-none"
                    style={{
                      background: 'var(--bg-elevated)',
                      borderColor: 'var(--border-normal)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="student">Học sinh / Sinh viên</option>
                    <option value="phd">Nghiên cứu sinh (PhD)</option>
                    <option value="lecturer">Giảng viên / Giáo sư</option>
                    <option value="researcher">Nhà nghiên cứu độc lập</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Trường học / Tổ chức
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Đại học Bách Khoa..."
                    value={settings.affiliation}
                    onChange={(e) => setSettings({ ...settings, affiliation: e.target.value })}
                    className="w-full px-4.5 py-3 rounded-xl border text-xs focus:outline-none transition-all duration-200"
                    style={{
                      background: 'var(--bg-elevated)',
                      borderColor: 'var(--border-normal)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Tab 2: Agent settings */
            <div className="flex flex-col gap-4 py-1">
              {/* Processing depth */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Độ sâu phân tích của Agent (Processing Depth)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, agentDepth: 'standard' })}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      settings.agentDepth === 'standard'
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <span className={`text-xs font-bold ${settings.agentDepth === 'standard' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      Tốc độ (Standard)
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] leading-normal">
                      Tối ưu thời gian, phù hợp quét thông tin cơ bản.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, agentDepth: 'deep' })}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      settings.agentDepth === 'deep'
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <span className={`text-xs font-bold ${settings.agentDepth === 'deep' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      Phân tích sâu (Deep Research)
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] leading-normal">
                      Agent chạy tự kiểm lỗi, phản ánh chéo và suy luận sâu.
                    </span>
                  </button>
                </div>
              </div>

              {/* Defense intensity */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Thái độ của Phản biện Hội đồng (Defense Intensity)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, defenseIntensity: 'supportive' })}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      settings.defenseIntensity === 'supportive'
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <span className={`text-xs font-bold ${settings.defenseIntensity === 'supportive' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      Đồng nghiệp (Supportive)
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] leading-normal">
                      Nhận xét ôn hòa, tập trung gợi ý hoàn thiện bài viết.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, defenseIntensity: 'aggressive' })}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                      settings.defenseIntensity === 'aggressive'
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <span className={`text-xs font-bold ${settings.defenseIntensity === 'aggressive' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      Nghiêm khắc (Q1 Reviewer)
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] leading-normal">
                      Bắt bẻ luận điểm khắt khe để chuẩn bị bảo vệ thực tế.
                    </span>
                  </button>
                </div>
              </div>

              {/* Translation style */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Văn phong dịch thuật ngữ chuyên ngành
                </label>
                <select
                  value={settings.translationStyle}
                  onChange={(e) => setSettings({ ...settings, translationStyle: e.target.value as any })}
                  className="w-full px-4 py-3 rounded-xl border text-xs focus:outline-none transition-all duration-200 cursor-pointer appearance-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-normal)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="bilingual">Song ngữ: Dịch thuật ngữ + Kèm từ gốc (ví dụ: Học máy (Machine Learning))</option>
                  <option value="literal">Thuần Việt: Dịch nghĩa hoàn toàn (ví dụ: Học máy)</option>
                  <option value="original">Nguyên bản: Giữ nguyên thuật ngữ gốc (ví dụ: Machine Learning)</option>
                </select>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)] mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold border border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all cursor-pointer bg-transparent"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving || saveSuccess}
              className="px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
              style={{
                background: saveSuccess ? 'var(--success)' : 'var(--accent)',
                color: saveSuccess ? '#ffffff' : '#080b12',
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {saveSuccess ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Đã lưu thành công
                </>
              ) : isSaving ? (
                'Đang lưu...'
              ) : (
                'Lưu thay đổi'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
