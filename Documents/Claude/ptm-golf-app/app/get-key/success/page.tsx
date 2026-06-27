'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const C = {
  green: '#1F3D2B', cream: '#F6F1E4', charcoal: '#2A2622',
  gold: '#C7972F', goldPale: '#F2E3BC', line: '#D8CFB8',
};

function SuccessContent() {
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    if (!sessionId) { setStatus('error'); return; }
    const t = setTimeout(() => setStatus('done'), 1500);
    return () => clearTimeout(t);
  }, [sessionId]);

  return (
    <div className="max-w-sm w-full text-center">
      {status === 'loading' && (
        <>
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin mx-auto mb-6" />
          <p style={{ color: C.charcoal }}>Confirming your payment…</p>
        </>
      )}
      {status === 'done' && (
        <>
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-3" style={{ color: C.green }}>Payment confirmed!</h1>
          <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: C.goldPale, border: `1px solid ${C.gold}` }}>
            <p className="text-sm" style={{ color: C.charcoal }}>
              Your license key is on its way to your inbox. Check your email (including spam) — it should arrive within a minute.
            </p>
          </div>
          <p className="text-xs opacity-60 mb-6" style={{ color: C.charcoal }}>
            Enter the key in the PTM Golf app when you click Admin Setup.
          </p>
          <a href="https://ptm-golf.vercel.app"
            className="block w-full py-3 rounded-xl font-medium text-white text-center"
            style={{ backgroundColor: C.green }}>
            Go to PTM Golf →
          </a>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-3" style={{ color: C.green }}>Something went wrong</h1>
          <p className="text-sm opacity-70 mb-6" style={{ color: C.charcoal }}>
            Your payment may have been processed — please check your email. If you don't receive a key within 5 minutes, contact support.
          </p>
          <a href="/get-key" className="block w-full py-3 rounded-xl font-medium text-sm"
            style={{ backgroundColor: 'white', border: `1px solid ${C.line}`, color: C.charcoal }}>
            ← Back to purchase page
          </a>
        </>
      )}
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div style={{ backgroundColor: C.cream, minHeight: '100vh' }} className="flex items-center justify-center px-4">
      <Suspense fallback={
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin mx-auto mb-6" />
          <p style={{ color: C.charcoal }}>Loading…</p>
        </div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
