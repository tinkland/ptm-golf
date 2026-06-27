import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getTierForSlots } from '@/lib/key-utils';

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  try {
    const { name, email, players, rounds } = await req.json();
    const slots = Number(players) * Number(rounds);
    const tier = getTierForSlots(slots);

    if (tier.price === 0) {
      return NextResponse.json({ error: 'Use free key endpoint' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || 'https://ptm-golf.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: `PTM Golf — ${tier.label} License Key`,
            description: `${tier.description} · Valid 12 months · One event`,
          },
          unit_amount: tier.price * 100,
        },
        quantity: 1,
      }],
      metadata: { name, email, players: String(players), rounds: String(rounds), slots: String(slots), tier: tier.id, maxSlots: String(tier.maxSlots), tierLabel: tier.label },
      success_url: `${origin}/get-key/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/get-key`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
