import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { generateKey } from '@/lib/key-utils';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { secret, recipientName, recipientEmail, note } = await req.json();

    if (secret !== process.env.SUPER_ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!recipientName || !recipientEmail) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    const key = generateKey();

    await adminDb.collection('license-keys').doc(key).set({
      tier: 'super',
      tierLabel: 'Super',
      maxSlots: 9999,
      purchaserName: recipientName,
      purchaserEmail: recipientEmail,
      note: note || '',
      slots: 9999,
      price: 0,
      stripeSessionId: null,
      createdAt: new Date(),
      expiresAt: null,
      claimedAt: null,
      claimedEventId: null,
    });

    // Email recipient
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: recipientEmail,
        subject: 'Your complimentary PTM Golf key',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <h2 style="color:#1F3D2B;">Your PTM Golf Complimentary Key</h2>
            <p>Hi ${recipientName},</p>
            <p>You've been given complimentary access to PTM Golf. Here is your key:</p>
            <div style="background:#F2E3BC;border-radius:8px;padding:16px 24px;text-align:center;margin:24px 0;">
              <span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#1F3D2B;">${key}</span>
            </div>
            <p style="font-size:14px;">Enter this key when you click <strong>Admin Setup</strong> in the PTM Golf app.</p>
            <p style="color:#999;font-size:12px;">This key has no expiry and no player/round limits.</p>
          </div>
        `,
      });
    }

    return NextResponse.json({ key });
  } catch (err) {
    console.error('generate-super-key error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
