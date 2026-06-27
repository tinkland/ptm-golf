import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { key, eventId } = await req.json();
    if (!key || !eventId) return NextResponse.json({ ok: false }, { status: 400 });

    const normalised = key.trim().toUpperCase();
    const ref = adminDb.collection('license-keys').doc(normalised);
    const snap = await ref.get();

    if (!snap.exists) return NextResponse.json({ ok: false, error: 'Key not found' });

    const data = snap.data()!;

    // Super keys are never claimed — they stay reusable
    if (data.tier === 'super') return NextResponse.json({ ok: true });

    // Already claimed to this same event is fine (re-save)
    if (data.claimedEventId && data.claimedEventId !== eventId) {
      return NextResponse.json({ ok: false, error: 'Key already used for another event' });
    }

    if (!data.claimedAt) {
      await ref.update({ claimedAt: new Date(), claimedEventId: eventId });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('claim-key error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
