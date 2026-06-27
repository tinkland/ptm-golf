import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebase-admin';
import { generateKey, expiresAt } from '@/lib/key-utils';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata!;

  const key = generateKey();
  const expiry = expiresAt();
  const { name, email, tier, maxSlots, tierLabel } = meta;

  await adminDb.collection('license-keys').doc(key).set({
    tier,
    tierLabel,
    maxSlots: Number(maxSlots),
    purchaserName: name,
    purchaserEmail: email,
    slots: Number(meta.slots),
    price: session.amount_total ? session.amount_total / 100 : 0,
    stripeSessionId: session.id,
    createdAt: new Date(),
    expiresAt: expiry,
    claimedAt: null,
    claimedEventId: null,
  });

  // Email the key
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Your PTM Golf license key',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#1F3D2B;">Your PTM Golf License Key</h2>
          <p>Hi ${name}, thank you for your purchase!</p>
          <div style="background:#F2E3BC;border-radius:8px;padding:16px 24px;text-align:center;margin:24px 0;">
            <span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#1F3D2B;">${key}</span>
          </div>
          <p style="color:#666;font-size:14px;">
            Plan: ${tierLabel}<br>
            Valid until: ${expiry.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p style="font-size:14px;">Enter this key when you click <strong>Admin Setup</strong> in the PTM Golf app.</p>
          <p style="color:#999;font-size:12px;">This key is valid for one event. Keep it safe.</p>
        </div>
      `,
    });
  }

  return NextResponse.json({ received: true });
}
