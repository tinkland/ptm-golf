import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { generateKey, getTierForSlots, expiresAt } from '@/lib/key-utils';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { name, email, players, rounds } = await req.json();
    const slots = Number(players) * Number(rounds);

    if (slots > 8) {
      return NextResponse.json({ error: 'Too many slots for free tier' }, { status: 400 });
    }
    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    const tier = getTierForSlots(slots);
    const key = generateKey();
    const expiry = expiresAt();

    await adminDb.collection('license-keys').doc(key).set({
      tier: tier.id,
      tierLabel: tier.label,
      maxSlots: tier.maxSlots,
      purchaserName: name,
      purchaserEmail: email,
      slots,
      price: 0,
      stripeSessionId: null,
      createdAt: new Date(),
      expiresAt: expiry,
      claimedAt: null,
      claimedEventId: null,
    });

    // Send key via email
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: email,
        subject: 'Your PTM Golf license key',
        html: emailHtml(name, key, tier.label, slots, expiry),
      });
    }

    return NextResponse.json({ key, tier: tier.id, maxSlots: tier.maxSlots, expiresAt: expiry.toISOString() });
  } catch (err) {
    console.error('create-free-key error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

function emailHtml(name: string, key: string, tierLabel: string, slots: number, expires: Date) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#1F3D2B;">Your PTM Golf License Key</h2>
      <p>Hi ${name},</p>
      <p>Here is your <strong>${tierLabel}</strong> license key:</p>
      <div style="background:#F2E3BC;border-radius:8px;padding:16px 24px;text-align:center;margin:24px 0;">
        <span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#1F3D2B;">${key}</span>
      </div>
      <p style="color:#666;font-size:14px;">
        Plan: ${tierLabel} (up to ${slots === 9999 ? 'unlimited' : slots} event slots)<br>
        Valid until: ${expires.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      <p style="font-size:14px;">Enter this key when you click <strong>Admin Setup</strong> in the PTM Golf app.</p>
      <p style="color:#999;font-size:12px;">This key is valid for one event. Keep it safe.</p>
    </div>
  `;
}
