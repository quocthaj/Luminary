'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ExploreJobRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId;

  useEffect(() => {
    if (jobId) {
      router.replace(`/explore?jobId=${jobId}`);
    } else {
      router.replace('/explore');
    }
  }, [jobId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="flex items-center gap-3">
        <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
        <span className="text-sm text-[var(--text-secondary)]">Đang tải tài liệu khám phá...</span>
      </div>
    </div>
  );
}
