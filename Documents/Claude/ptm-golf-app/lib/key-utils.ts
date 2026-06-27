// Unambiguous character set (no 0/O, 1/I/L, 2/Z, 5/S, 8/B)
const CHARSET = 'ACDEFGHJKMNPQRTWXY34679';

export function generateKey(): string {
  const seg = () =>
    Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('');
  return `PTM-${seg()}-${seg()}-${seg()}`;
}

export interface Tier {
  id: string;
  maxSlots: number;
  price: number;
  label: string;
  priceDisplay: string;
  description: string;
}

export const TIERS: Tier[] = [
  { id: 'free',    maxSlots: 8,    price: 0,  label: 'Free',    priceDisplay: 'Free', description: 'Up to 4 players × 2 rounds' },
  { id: 'starter', maxSlots: 24,   price: 20, label: 'Starter', priceDisplay: '$20',  description: 'Up to 12 players × 2 rounds' },
  { id: 'mid',     maxSlots: 48,   price: 32, label: 'Pro',     priceDisplay: '$32',  description: 'Up to 16 players × 3 rounds' },
  { id: 'pro',     maxSlots: 9999, price: 40, label: 'Elite',   priceDisplay: '$40',  description: 'Unlimited players & rounds' },
];

export const SUPER_TIER: Tier = {
  id: 'super', maxSlots: 9999, price: 0, label: 'Super', priceDisplay: 'Complimentary', description: 'Unlimited — complimentary access',
};

export function getTierForSlots(slots: number): Tier {
  if (slots <= 8)  return TIERS[0];
  if (slots <= 24) return TIERS[1];
  if (slots <= 48) return TIERS[2];
  return TIERS[3];
}

export function expiresAt(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}
