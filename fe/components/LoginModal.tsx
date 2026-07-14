'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [otpSignature, setOtpSignature] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [devOtpCode, setDevOtpCode] = useState('');

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      await signIn('google');
    } catch (err) {
      console.error(err);
      setAuthError('Đăng nhập Google thất bại. Vui lòng thử lại.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gửi OTP thất bại');
      }
      setOtpSignature(data.signature);
      if (data.devOtp) {
        setDevOtpCode(data.devOtp);
      }
      setOtpSent(true);
    } catch (err: any) {
      setAuthError(err.message || 'Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginOtp || !otpSignature) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await signIn('credentials', {
        email: loginEmail,
        otp: loginOtp,
        signature: otpSignature,
        redirect: false,
      });
      if (res?.error) {
        setAuthError('Mã xác nhận không chính xác hoặc đã hết hạn.');
      } else {
        setLoginEmail('');
        setLoginOtp('');
        setOtpSignature('');
        setOtpSent(false);
        setDevOtpCode('');
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      setAuthError('Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleModalClose = () => {
    setLoginEmail('');
    setLoginOtp('');
    setOtpSignature('');
    setOtpSent(false);
    setAuthError('');
    setDevOtpCode('');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ background: 'rgba(8, 11, 18, 0.82)', backdropFilter: 'blur(12px)' }}
    >
      <div 
        className="w-full max-w-md p-7 rounded-3xl border shadow-2xl flex flex-col gap-5 relative animate-fade-up animate-ring-in"
        style={{ 
          background: 'var(--bg-surface)', 
          borderColor: 'var(--border-normal)',
          boxShadow: '0 30px 60px -15px rgba(0,0,0,0.6)'
        }}
      >
        {/* Close button */}
        <button 
          id="login-modal-close-btn"
          type="button"
          onClick={handleModalClose}
          className="absolute top-5 right-5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all duration-200 p-1.5 rounded-full bg-transparent border-none cursor-pointer flex items-center justify-center"
          aria-label="Đóng"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col gap-3 mt-2 items-center text-center">
          <div 
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(8, 226, 172, 0.2)' }}
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Chào mừng đến với Luminary Scholar
          </h3>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm">
            Đăng nhập để lưu lịch sử dịch thuật và truy cập Thư viện cá nhân của bạn.
          </p>
        </div>

        {authError && (
          <div className="p-3.5 rounded-xl text-xs font-semibold bg-red-950/40 border border-red-900/60 text-red-400 text-center">
            {authError}
          </div>
        )}

        {/* OTP sent notice with bypass capability for dev sandbox */}
        {otpSent && devOtpCode && (
          <div className="p-3 rounded-xl text-xs bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 text-center font-mono">
            [DEV BYPASS] Mã OTP: <span className="font-bold underline">{devOtpCode}</span>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Google OAuth Login */}
          <button 
            onClick={handleGoogleLogin}
            disabled={authLoading}
            className="w-full rounded-xl py-3.5 text-sm font-semibold transition-all duration-200 border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] flex items-center justify-center gap-3"
            style={{ 
              background: 'transparent', 
              color: 'var(--text-primary)', 
              cursor: authLoading ? 'not-allowed' : 'pointer',
              opacity: authLoading ? 0.7 : 1
            }}
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.87-2.6-2.86-4.53-6.16-4.53z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Tiếp tục với Google
          </button>

          <div className="flex items-center my-1">
            <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            <span className="px-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">hoặc dùng Email</span>
            <div className="flex-1 h-px bg-[var(--border-subtle)]" />
          </div>

          {!otpSent ? (
            /* Step 1: Input Email */
            <form onSubmit={handleSendOtp} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email-input" className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Địa chỉ Email
                </label>
                <input
                  id="login-email-input"
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-all duration-200"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-normal)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
              <button 
                type="submit"
                disabled={authLoading}
                className="w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200"
                style={{ 
                  background: 'var(--accent)', 
                  color: '#080b12', 
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  opacity: authLoading ? 0.7 : 1,
                  boxShadow: '0 8px 16px -6px var(--accent-glow)'
                }}
              >
                {authLoading ? 'Đang gửi mã...' : 'Gửi mã OTP'}
              </button>
            </form>
          ) : (
            /* Step 2: Input OTP */
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
              <div className="text-left flex flex-col gap-0.5">
                <span className="text-[10px] text-[var(--text-muted)] font-medium">Mã OTP đã được gửi đến:</span>
                <span className="text-xs font-bold text-[var(--text-primary)]">{loginEmail}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-otp-input" className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Mã xác nhận OTP (6 chữ số)
                </label>
                <input
                  id="login-otp-input"
                  type="text"
                  required
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="123456"
                  value={loginOtp}
                  onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 rounded-xl border text-sm text-center font-bold tracking-widest focus:outline-none transition-all duration-200"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-normal)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
              <button 
                type="submit"
                disabled={authLoading}
                className="w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200"
                style={{ 
                  background: 'var(--accent)', 
                  color: '#080b12', 
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  opacity: authLoading ? 0.7 : 1,
                  boxShadow: '0 8px 16px -6px var(--accent-glow)'
                }}
              >
                {authLoading ? 'Đang xác minh...' : 'Xác minh & Đăng nhập'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setLoginOtp('');
                  setAuthError('');
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1 bg-transparent border-none cursor-pointer"
              >
                Thay đổi Email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
