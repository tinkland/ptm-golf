import { NextRequest, NextResponse } from 'next/server';
import { TIERS } from '@/lib/key-utils';

const EURO_COUNTRIES = new Set([
  'DE','FR','ES','IT','NL','BE','AT','PT','FI','GR','IE',
  'SK','SI','HR','LT','LV','EE','CY','MT','LU',
]);

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', AUD: 'A$', NZD: 'NZ$', GBP: '£', EUR: '€', CAD: 'CA$',
};

function countryToCurrency(country: string): string {
  if (country === 'AU') return 'AUD';
  if (country === 'NZ') return 'NZD';
  if (country === 'GB') return 'GBP';
  if (country === 'CA') return 'CAD';
  if (EURO_COUNTRIES.has(country)) return 'EUR';
  return 'USD';
}

export async function GET(req: NextRequest) {
  const country = req.headers.get('x-vercel-ip-country') || 'US';
  const currency = countryToCurrency(country);
  const symbol = CURRENCY_SYMBOLS[currency] || '$';

  let rate = 1;
  if (currency !== 'USD') {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        next: { revalidate: 3600 }, // cache 1 hour
      });
      const data = await res.json();
      rate = data?.rates?.[currency] ?? 1;
    } catch {
      // fall back to USD if rate fetch fails
      rate = 1;
    }
  }

  const tiers = TIERS.map((t) => ({
    ...t,
    currency,
    localPrice: t.price === 0 ? 0 : Math.round(t.price * rate),
    displayPrice: t.price === 0 ? 'Free' : `${symbol}${Math.round(t.price * rate)}`,
  }));

  return NextResponse.json({ currency, symbol, country, tiers });
}
