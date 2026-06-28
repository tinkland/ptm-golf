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
  price: number;       // base price in USD
  label: string;
  priceDisplay: string;
  slotsLabel: string;  // "Up to 16 slots" / "Unlimited slots"
  example: string;     // "e.g. 8 players × 2 rounds"
  description: string; // combined, used in Stripe product description
}

export const TIERS: Tier[] = [
  { id: 'free',       maxSlots: 8,    price: 0,  label: 'Free',       priceDisplay: 'Free', slotsLabel: 'Up to 8 slots',       example: 'e.g. 4 players × 2 rounds',  description: 'Up to 8 slots · 4 players × 2 rounds' },
  { id: 'starter',    maxSlots: 16,   price: 16, label: 'Starter',    priceDisplay: '$16',  slotsLabel: 'Up to 16 slots',      example: 'e.g. 8 players × 2 rounds',  description: 'Up to 16 slots · 8 players × 2 rounds' },
  { id: 'competitor', maxSlots: 24,   price: 24, label: 'Competitor', priceDisplay: '$24',  slotsLabel: 'Up to 24 slots',      example: 'e.g. 12 players × 2 rounds', description: 'Up to 24 slots · 12 players × 2 rounds' },
  { id: 'mid',        maxSlots: 48,   price: 32, label: 'Pro',        priceDisplay: '$32',  slotsLabel: 'Up to 48 slots',      example: 'e.g. 16 players × 3 rounds', description: 'Up to 48 slots · 16 players × 3 rounds' },
  { id: 'pro',        maxSlots: 9999, price: 40, label: 'Elite',      priceDisplay: '$40',  slotsLabel: 'Unlimited slots',     example: 'any players & rounds',       description: 'Unlimited slots · any players & rounds' },
];

export const SUPER_TIER: Tier = {
  id: 'super', maxSlots: 9999, price: 0, label: 'Super', priceDisplay: 'Complimentary',
  slotsLabel: 'Unlimited slots', example: 'complimentary access', description: 'Unlimited — complimentary access',
};

export function getTierForSlots(slots: number): Tier {
  if (slots <= 8)  return TIERS[0];
  if (slots <= 16) return TIERS[1];
  if (slots <= 24) return TIERS[2];
  if (slots <= 48) return TIERS[3];
  return TIERS[4];
}

export function expiresAt(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}
