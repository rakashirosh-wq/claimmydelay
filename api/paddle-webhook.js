// /api/paddle-webhook.js
// Serverless function (Vercel/Netlify-compatible) that handles Paddle's payment webhook,
// generates the final claim letter PDF, and emails it to the customer.
//
// DEPLOYMENT NOTES:
// - Deploy this in /api/ on Vercel, or /netlify/functions/ on Netlify (rename file path accordingly)
// - Requires environment variables: PADDLE_WEBHOOK_SECRET, RESEND_API_KEY (or your email provider's key)
// - Requires npm packages: pdf-lib (PDF generation), and your email provider's SDK (example uses Resend)
// - Wire this URL into your Paddle dashboard as the webhook endpoint for "transaction.completed" events

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Verify the webhook actually came from Paddle, not a forged request.
// Paddle signs webhooks with HMAC-SHA256 using your webhook secret.
async function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  const crypto = await import('crypto');
  const [tsPart, h1Part] = signatureHeader.split(';');
  const timestamp = tsPart.split('=')[1];
  const receivedHash = h1Part.split('=')[1];
  const signedPayload = `${timestamp}:${rawBody}`;
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return computedHash === receivedHash;
}

function buildLetterText({ name, booking, flightNumber, route, date, airline, amount, situation, notes }) {
  const regulationMap = {
    delay: { article: 'Article 7', clause: 'compensation for delays of 3 hours or more at final destination' },
    cancelled: { article: 'Article 5 and 7', clause: 'compensation for cancellation without adequate advance notice' },
    denied_boarding: { article: 'Article 4 and 7', clause: 'compensation for denied boarding' }
  };
  const reg = regulationMap[situation] || regulationMap.delay;

  return `Subject: Compensation Claim — Flight ${flightNumber}, ${date} — Booking Ref ${booking}

To ${airline} Customer Relations,

I am writing to formally request compensation under EU Regulation 261/2004 (and equivalent UK261 provisions, where applicable), specifically ${reg.article}, regarding ${reg.clause}.

Flight details:
— Passenger name: ${name}
— Booking reference: ${booking}
— Flight number: ${flightNumber}
— Route: ${route}
— Date: ${date}

${notes ? 'Additional details: ' + notes + '\n\n' : ''}Based on the distance and circumstances of this flight, I am owed €${amount} in compensation under the above regulation. I have not received any communication indicating this delay/cancellation was due to extraordinary circumstances as defined under Article 5(3), and I would ask you to clarify the specific cause if you intend to dispute this claim on that basis.

Please confirm receipt of this claim and provide a timeline for processing. I look forward to your response within 14 days.

Regards,
${name}`;
}

async function generatePdf(letterText) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const margin = 56;
  const maxWidth = 595 - margin * 2;
  const lineHeight = fontSize * 1.5;

  // Simple word-wrap since pdf-lib doesn't do this natively
  const words = letterText.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const width = font.widthOfTextAtSize(testLine.replace(/\n/g, ' '), fontSize);
    if (width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
    if (word.includes('\n')) {
      const parts = currentLine.split('\n');
      lines.push(...parts.slice(0, -1));
      currentLine = parts[parts.length - 1];
    }
  }
  if (currentLine) lines.push(currentLine);

  let y = 842 - margin;
  for (const line of lines) {
    if (y < margin) {
      const newPage = pdfDoc.addPage([595, 842]);
      y = 842 - margin;
      newPage.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.09, 0.1, 0.15) });
    } else {
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.09, 0.1, 0.15) });
    }
    y -= lineHeight;
  }

  return pdfDoc.save();
}

async function sendEmail({ to, name, pdfBytes }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'ClaimMyDelay <claims@claimmydelay.vercel.app>',
      to: [to],
      subject: 'Your flight compensation claim letter is ready',
      html: `<p>Hi ${name},</p><p>Your claim letter is attached as a PDF, ready to send to the airline.</p><p>Next steps and tips are at <a href="https://claimmydelay.vercel.app/claim-letter-success.html">claimmydelay.vercel.app</a>.</p>`,
      attachments: [{ filename: 'claim-letter.pdf', content: pdfBase64 }]
    })
  });

  if (!res.ok) {
    throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signatureHeader = req.headers['paddle-signature'];
  const rawBody = req.body; // ensure your framework config provides raw body, not pre-parsed JSON
  const secret = process.env.PADDLE_WEBHOOK_SECRET;

  const isValid = await verifyPaddleSignature(rawBody, signatureHeader, secret);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);

  if (event.event_type !== 'transaction.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  try {
    const customData = event.data.custom_data || {};
    const customerEmail = event.data.customer?.email;

    const letterText = buildLetterText({
      name: customData.fullName || 'Customer',
      booking: customData.bookingRef || 'N/A',
      flightNumber: customData.flightNumber || 'N/A',
      route: customData.route || 'N/A',
      date: customData.flightDate || 'N/A',
      airline: customData.airline || 'the airline',
      amount: customData.amount || '400',
      situation: customData.situation || 'delay',
      notes: customData.notes || ''
    });

    const pdfBytes = await generatePdf(letterText);
    await sendEmail({ to: customerEmail, name: customData.fullName || 'there', pdfBytes });

    return res.status(200).json({ received: true, delivered: true });
  } catch (err) {
    console.error('Failed to process claim letter delivery:', err);
    // Return 200 so Paddle doesn't endlessly retry, but log for manual follow-up
    return res.status(200).json({ received: true, delivered: false, error: err.message });
  }
}
