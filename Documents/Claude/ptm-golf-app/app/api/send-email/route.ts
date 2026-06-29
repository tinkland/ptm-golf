import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject and html are required' }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 503 });
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL, to, subject, html });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('send-email error', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
