import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ valid: false, error: 'No key provided' }, { status: 400 });
    }

    const normalised = key.trim().toUpperCase();
    const snap = await adminDb.collection('license-keys').doc(normalised).get();

    if (!snap.exists) {
      return NextResponse.json({ valid: false, error: 'Key not found' });
    }

    const data = snap.data()!;

    // Super keys never expire and are always valid
    if (data.tier === 'super') {
      return NextResponse.json({
        valid: true,
        tier: 'super',
        maxSlots: 9999,
        expiresAt: null,
        label: 'Super',
      });
    }

    // Check expiry
    const expires = data.expiresAt?.toDate?.() ?? new Date(data.expiresAt);
    if (expires < new Date()) {
      return NextResponse.json({ valid: false, error: 'This key has expired' });
    }

    return NextResponse.json({
      valid: true,
      tier: data.tier,
      maxSlots: data.maxSlots,
      expiresAt: expires.toISOString(),
      label: data.tierLabel,
    });
  } catch (err) {
    console.error('validate-key error', err);
    return NextResponse.json({ valid: false, error: 'Server error' }, { status: 500 });
  }
}
