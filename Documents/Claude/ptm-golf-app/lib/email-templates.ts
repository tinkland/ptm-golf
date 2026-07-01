// Email templates for PTM Golf app

export const eventSetupCompleteEmail = (eventData: {
  eventName: string;
  logo?: string;
  eventStartTime?: string;
  roundCount: number;
  eventId: string;
  adminEmail: string;
  links?: { title: string; url: string }[];
}) => {
  const qrUrl = `https://ptm-golf.vercel.app/?eventId=${eventData.eventId}`;
  const roundText = eventData.roundCount === 1 ? 'round' : 'rounds';

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #2A2622;
        background-color: #F6F1E4;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .header {
        background: linear-gradient(135deg, #1F3D2B 0%, #3A6B4A 100%);
        color: white;
        padding: 40px 30px;
        text-align: center;
      }
      .logo {
        font-size: 48px;
        margin-bottom: 16px;
      }
      .header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: bold;
      }
      .content {
        padding: 40px 30px;
      }
      .section {
        margin-bottom: 32px;
      }
      .section h2 {
        font-size: 18px;
        font-weight: 600;
        color: #1F3D2B;
        margin: 0 0 12px 0;
        border-bottom: 2px solid #C7972F;
        padding-bottom: 8px;
      }
      .details {
        background-color: #F6F1E4;
        border-radius: 8px;
        padding: 16px;
        margin: 16px 0;
        font-size: 14px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #D8CFB8;
      }
      .detail-row:last-child {
        border-bottom: none;
      }
      .detail-label {
        font-weight: 600;
        color: #1F3D2B;
      }
      .detail-value {
        color: #2A2622;
      }
      .qr-section {
        background-color: #E9EFE5;
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        margin: 24px 0;
      }
      .qr-link {
        display: inline-block;
        background-color: #1F3D2B;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        margin-top: 12px;
        font-size: 14px;
      }
      .qr-link:hover {
        background-color: #3A6B4A;
      }
      .checklist {
        list-style: none;
        padding: 0;
        margin: 16px 0;
      }
      .checklist li {
        padding: 12px 0;
        padding-left: 28px;
        position: relative;
        font-size: 14px;
      }
      .checklist li:before {
        content: "✓";
        position: absolute;
        left: 0;
        color: #1F3D2B;
        font-weight: bold;
        font-size: 18px;
      }
      .links-section {
        background-color: #F6F1E4;
        border-radius: 8px;
        padding: 16px;
        margin: 16px 0;
      }
      .links-section a {
        display: inline-block;
        color: #C7972F;
        text-decoration: none;
        font-weight: 600;
        margin-right: 16px;
        margin-bottom: 8px;
      }
      .links-section a:hover {
        text-decoration: underline;
      }
      .footer {
        background-color: #F6F1E4;
        padding: 24px 30px;
        text-align: center;
        font-size: 12px;
        color: #2A2622;
        opacity: 0.7;
      }
      .button {
        display: inline-block;
        background-color: #C7972F;
        color: white;
        padding: 12px 32px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        margin: 16px 0;
        font-size: 14px;
      }
      .button:hover {
        background-color: #B5882A;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        ${eventData.logo ? `<div class="logo">${eventData.logo}</div>` : '<div class="logo">⛳</div>'}
        <h1>${eventData.eventName}</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">Event Setup Complete!</p>
      </div>

      <div class="content">
        <div class="section">
          <h2>Event Details</h2>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Event Name:</span>
              <span class="detail-value">${eventData.eventName}</span>
            </div>
            ${eventData.eventStartTime ? `
            <div class="detail-row">
              <span class="detail-label">Start Time:</span>
              <span class="detail-value">${eventData.eventStartTime}</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Rounds:</span>
              <span class="detail-value">${eventData.roundCount} ${roundText}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Admin Email:</span>
              <span class="detail-value">${eventData.adminEmail}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Share with Scorers</h2>
          <p>Scorers can access the event by scanning this QR code or visiting the link below:</p>
          <div class="qr-section">
            <p style="margin: 0 0 12px 0; font-weight: 600;">Event QR Code</p>
            <p style="margin: 0 0 16px 0; font-size: 12px; opacity: 0.7;">Share this link with all scorers</p>
            <a href="${qrUrl}" class="qr-link">📱 Open Event</a>
            <p style="margin: 12px 0 0 0; font-size: 12px; word-break: break-all; opacity: 0.7;">${qrUrl}</p>
          </div>
        </div>

        <div class="section">
          <h2>Important Reminders</h2>
          <ul class="checklist">
            <li><strong>Share the QR code</strong> with all scorers before the event starts</li>
            <li><strong>Stay logged in</strong> on your device (signed in with your admin email)</li>
            <li><strong>Complete End of Day</strong> on your device after all scoring is finished to progress to the next round</li>
            <li><strong>Keep your device nearby</strong> - you'll need it to advance rounds and confirm final results</li>
          </ul>
        </div>

        ${eventData.links && eventData.links.length > 0 ? `
        <div class="section">
          <h2>Event Links</h2>
          <div class="links-section">
            ${eventData.links.map(link => `<a href="${link.url}" target="_blank">📎 ${link.title}</a>`).join('')}
          </div>
        </div>
        ` : ''}

        <div class="section" style="text-align: center;">
          <p style="color: #1F3D2B; font-weight: 600;">Ready to start scoring?</p>
          <a href="${qrUrl}" class="button">View Event</a>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0;">PTM Golf Scoring App</p>
        <p style="margin: 8px 0 0 0;">This is an automated message sent after event setup completion.</p>
      </div>
    </div>
  </body>
</html>
  `.trim();
};
