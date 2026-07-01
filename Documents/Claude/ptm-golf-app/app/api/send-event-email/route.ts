import { Resend } from 'resend';
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

    // Initialize Resend inside the handler, not at module level
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Send to admin email with BCC to owner
    const emailResult = await resend.emails.send({
      from: 'PTM Golf <noreply@ptmgolf.com>',
      to: adminEmail,
      bcc: ['andrewtinkler@optusnet.com.au'],
      subject: `${eventName} - Event Setup Complete! 🏌️`,
      html: htmlContent,
    });

    if (emailResult.error) {
      console.error('Failed to send event email:', emailResult.error);
      return Response.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      emailId: emailResult.data?.id,
    });
  } catch (error) {
    console.error('Send event email error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
