'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 select-none font-sans"
      style={{ background: '#080b12', color: '#e2e8f0' }}
    >
      <div 
        className="max-w-md w-full p-8 rounded-3xl border text-center shadow-2xl flex flex-col items-center gap-5 backdrop-blur-xl"
        style={{ 
          background: 'rgba(14, 19, 31, 0.85)', 
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.7)'
        }}
      >
        <div 
          className="h-16 w-16 rounded-2xl flex items-center justify-center border"
          style={{ background: 'rgba(99, 102, 241, 0.12)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#818cf8' }}
        >
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-4xl font-black tracking-widest text-indigo-400">404</span>
          <h1 className="text-lg font-bold text-white mt-1">Trang không tồn tại hoặc phiên đã hết hạn</h1>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mt-1">
            Liên kết bạn vừa truy cập (hoặc trang xác thực trước đó) không còn khả dụng trên hệ thống.
          </p>
        </div>

        <Link
          href="/"
          className="w-full mt-2 py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Quay lại Không gian làm việc
        </Link>
      </div>
    </div>
  );
}
