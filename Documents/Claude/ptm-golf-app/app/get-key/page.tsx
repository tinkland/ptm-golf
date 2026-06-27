'use client';

import { useState, useMemo } from 'react';
import { getTierForSlots, TIERS } from '@/lib/key-utils';

const C = {
  green: '#1F3D2B', greenLight: '#3A6B4A', greenPale: '#E9EFE5',
  cream: '#F6F1E4', charcoal: '#2A2622', gold: '#C7972F',
  goldPale: '#F2E3BC', flag: '#B5432D', flagPale: '#F1DCD3', line: '#D8CFB8',
};

export default function GetKeyPage() {
  const [players, setPlayers] = useState(8);
  const [rounds, setRounds] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [freeKey, setFreeKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const slots = players * rounds;
  const tier = useMemo(() => getTierForSlots(slots), [slots]);
  const isFree = tier.price === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isFree) {
        const res = await fetch('/api/create-free-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, players, rounds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate key');
        setFreeKey(data.key);
      } else {
        const res = await fetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, players, rounds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (freeKey) {
    return (
      <div style={{ backgroundColor: C.cream, minHeight: '100vh' }} className="flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-4">⛳</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: C.green }}>You're all set!</h1>
          <p className="text-sm mb-6 opacity-70" style={{ color: C.charcoal }}>
            Your license key is shown below and has been emailed to {email}.
          </p>
          <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: C.goldPale, border: `2px solid ${C.gold}` }}>
            <p className="text-xs font-medium mb-2 opacity-60" style={{ color: C.charcoal }}>Your License Key</p>
            <p className="text-2xl font-bold tracking-widest" style={{ color: C.green }}>{freeKey}</p>
          </div>
          <p className="text-xs opacity-60 mb-8" style={{ color: C.charcoal }}>
            Enter this key in the PTM Golf app when you click Admin Setup.<br />
            Keep it safe — it's valid for one event, for 12 months.
          </p>
          <a href="https://ptm-golf.vercel.app" className="block w-full py-3 rounded-xl font-medium text-white text-center"
            style={{ backgroundColor: C.green }}>
            Go to PTM Golf →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: C.cream, minHeight: '100vh' }} className="px-4 py-10">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⛳</div>
          <h1 className="text-3xl font-bold mb-1" style={{ color: C.green }}>PTM Golf</h1>
          <p className="text-sm opacity-60" style={{ color: C.charcoal }}>Get your license key</p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {TIERS.map((t) => (
            <div key={t.id} className="rounded-xl p-3 text-center"
              style={{ backgroundColor: tier.id === t.id ? C.goldPale : 'white', border: `1.5px solid ${tier.id === t.id ? C.gold : C.line}` }}>
              <p className="text-xs font-medium mb-0.5" style={{ color: C.green }}>{t.label}</p>
              <p className="text-lg font-bold" style={{ color: tier.id === t.id ? C.gold : C.charcoal }}>{t.priceDisplay}</p>
              <p className="text-[10px] opacity-60 mt-0.5" style={{ color: C.charcoal }}>{t.description}</p>
            </div>
          ))}
        </div>

        {/* Configurator */}
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: 'white', border: `1px solid ${C.line}` }}>
          <p className="text-sm font-medium mb-4" style={{ color: C.charcoal }}>Configure your event</p>

          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <label className="text-xs" style={{ color: C.charcoal }}>Players</label>
              <span className="text-xs font-bold" style={{ color: C.green }}>{players}</span>
            </div>
            <input type="range" min={1} max={60} value={players} onChange={e => setPlayers(Number(e.target.value))}
              className="w-full" style={{ accentColor: C.green }} />
            <div className="flex justify-between text-[10px] opacity-40 mt-0.5">
              <span>1</span><span>60</span>
            </div>
          </div>

          <div className="mb-5">
            <div className="flex justify-between mb-1">
              <label className="text-xs" style={{ color: C.charcoal }}>Rounds</label>
              <span className="text-xs font-bold" style={{ color: C.green }}>{rounds}</span>
            </div>
            <input type="range" min={1} max={10} value={rounds} onChange={e => setRounds(Number(e.target.value))}
              className="w-full" style={{ accentColor: C.green }} />
            <div className="flex justify-between text-[10px] opacity-40 mt-0.5">
              <span>1</span><span>10</span>
            </div>
          </div>

          {/* Summary pill */}
          <div className="rounded-xl p-3 text-center mb-1" style={{ backgroundColor: C.goldPale }}>
            <p className="text-xs" style={{ color: C.charcoal }}>
              {players} players × {rounds} round{rounds > 1 ? 's' : ''} = <strong>{slots} slots</strong>
            </p>
            <p className="text-lg font-bold mt-0.5" style={{ color: C.gold }}>
              {tier.priceDisplay} · {tier.label}
            </p>
          </div>
        </div>

        {/* Purchase form */}
        <form onSubmit={handleSubmit} className="rounded-2xl p-5" style={{ backgroundColor: 'white', border: `1px solid ${C.line}` }}>
          <p className="text-sm font-medium mb-3" style={{ color: C.charcoal }}>Your details</p>
          <input required placeholder="Full name" value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm mb-2"
            style={{ border: `1px solid ${C.line}`, outline: 'none' }} />
          <input required type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm mb-4"
            style={{ border: `1px solid ${C.line}`, outline: 'none' }} />

          {error && <p className="text-xs mb-3" style={{ color: C.flag }}>{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-medium text-white text-sm"
            style={{ backgroundColor: loading ? C.greenLight : C.green, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Please wait…' : isFree ? 'Get Free Key' : `Buy for ${tier.priceDisplay} (AUD)`}
          </button>
          <p className="text-[10px] text-center mt-3 opacity-50" style={{ color: C.charcoal }}>
            {isFree ? 'Key sent instantly to your email.' : 'Secure checkout via Stripe. Key emailed after payment.'}
            {' '}Valid for 12 months, one event.
          </p>
        </form>
      </div>
    </div>
  );
}
