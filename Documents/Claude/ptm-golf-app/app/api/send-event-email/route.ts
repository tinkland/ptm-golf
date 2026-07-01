import { eventSetupCompleteEmail } from '@/lib/email-templates';

export async function POST(request: Request) {
  try {
    const { eventName, logo, eventStartTime, roundCount, eventId, adminEmail, links } = await request.json();

    if (!eventName || !eventId || !adminEmail) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return Response.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const htmlContent = eventSetupCompleteEmail({
      eventName,
      logo,
      eventStartTime,
      roundCount,
      eventId,
      adminEmail,
      links,
    });

    // Use Resend REST API instead of SDK (Vercel compatibility)
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PTM Golf <noreply@ptmgolf.com>',
        to: adminEmail,
        bcc: ['andrewtinkler@optusnet.com.au'],
        subject: `${eventName} - Event Setup Complete! 🏌️`,
        html: htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Failed to send event email:', errorData);
      return Response.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    const emailResult = await emailResponse.json();

    return Response.json({
      success: true,
      emailId: emailResult.id,
    });
  } catch (error) {
    console.error('Send event email error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
