import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'to, subject and html are required' }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 503 });
    }

    // Use Resend REST API instead of SDK (Vercel compatibility)
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('send-email error:', errorData);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('send-email error', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
