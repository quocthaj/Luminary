'use client';
import { useState, useCallback, useEffect } from 'react';
import { UploadView } from '../components/UploadView';
import { ProcessingView } from '../components/ProcessingView';
import { ResultView } from '../components/ResultView';

type AppState = 'upload' | 'processing' | 'result';

export default function Home() {
  const [state, setState] = useState<AppState>('upload');
  const [jobId, setJobId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const jId = params.get('jobId');
      if (jId) {
        const timer = setTimeout(() => {
          setJobId(jId);
          setState('processing');
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleJobCreated = useCallback((id: string) => {
    setJobId(id);
    setState('processing');
  }, []);

  const handleComplete = useCallback(() => setState('result'), []);
  const handleReset = useCallback(() => setState('upload'), []);
  const handleReprocess = useCallback(() => setState('processing'), []);

  if (state === 'upload') {
    return <UploadView onJobCreated={handleJobCreated} />;
  }
  if (state === 'processing') {
    return <ProcessingView jobId={jobId} onComplete={handleComplete} />;
  }
  return <ResultView jobId={jobId} onReset={handleReset} onReprocess={handleReprocess} />;
}
