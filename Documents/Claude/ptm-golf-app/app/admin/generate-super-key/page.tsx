'use client';

import { useState } from 'react';

const C = {
  green: '#1F3D2B', cream: '#F6F1E4', charcoal: '#2A2622',
  gold: '#C7972F', goldPale: '#F2E3BC', flag: '#B5432D', line: '#D8CFB8',
};

export default function GenerateSuperKeyPage() {
  const [secret, setSecret] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setResult(null); setLoading(true);
    try {
      const res = await fetch('/api/generate-super-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, recipientName: name, recipientEmail: email, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data.key);
      setName(''); setEmail(''); setNote('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ backgroundColor: C.cream, minHeight: '100vh' }} className="flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-1 text-center" style={{ color: C.green }}>Generate Super Key</h1>
        <p className="text-xs text-center opacity-50 mb-6" style={{ color: C.charcoal }}>Developer access — complimentary keys</p>

        {result && (
          <div className="rounded-xl p-4 mb-5 text-center" style={{ backgroundColor: C.goldPale, border: `2px solid ${C.gold}` }}>
            <p className="text-xs mb-1 opacity-60" style={{ color: C.charcoal }}>Key generated &amp; emailed</p>
            <p className="text-xl font-bold tracking-widest" style={{ color: C.green }}>{result}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ backgroundColor: 'white', border: `1px solid ${C.line}` }}>
          <input required type="password" placeholder="Admin secret" value={secret}
            onChange={e => setSecret(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: `1px solid ${C.line}` }} />
          <input required placeholder="Recipient name" value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: `1px solid ${C.line}` }} />
          <input required type="email" placeholder="Recipient email" value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: `1px solid ${C.line}` }} />
          <input placeholder="Note (e.g. 'Echuca trip 2026')" value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: `1px solid ${C.line}` }} />

          {error && <p className="text-xs" style={{ color: C.flag }}>{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-medium text-white text-sm"
            style={{ backgroundColor: C.green, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Generating…' : 'Generate Super Key'}
          </button>
        </form>
      </div>
    </div>
  );
}
