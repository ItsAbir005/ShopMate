import nodemailer from 'nodemailer';

// ── Create transport ───────────────────────────────────────────────────────────
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for 587 and others
    auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        }
        : undefined,
});

const FROM = process.env.FROM_EMAIL || '"ShopMate 🛍️" <noreply@shopmate.dev>';

// ── Shared HTML wrapper ────────────────────────────────────────────────────────
const emailTemplate = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background: #0d0d14; color: #e2e8f0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #13131f; border: 1px solid rgba(139,92,246,0.25); border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 32px 40px; text-align: center; }
    .header h1 { font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .header p { margin-top: 6px; font-size: 14px; color: rgba(255,255,255,0.75); }
    .body { padding: 32px 40px; }
    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .section { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin: 20px 0; }
    .section h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #a78bfa; margin-bottom: 14px; }
    .item-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 14px; }
    .item-row:last-child { border-bottom: none; }
    .item-name { color: #e2e8f0; }
    .item-qty { color: #94a3b8; font-size: 12px; margin-left: 8px; }
    .item-price { font-weight: 600; color: #a78bfa; }
    .total-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0 0; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); }
    .total-label { font-size: 15px; font-weight: 600; }
    .total-amount { font-size: 22px; font-weight: 700; color: #34d399; }
    .badge { display: inline-block; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; }
    .badge-success { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
    .badge-warning { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .badge-info { background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); }
    .cta { text-align: center; margin: 28px 0 10px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; padding: 13px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); }
    .footer p { font-size: 12px; color: #475569; line-height: 1.6; }
    .footer a { color: #7c3aed; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🛍️ ShopMate</h1>
      <p>Your premium shopping destination</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      <p>You received this email because you have an account at <a href="#">ShopMate</a>.<br/>
      If you have questions, reply to this email or visit our <a href="#">Help Center</a>.</p>
    </div>
  </div>
</body>
</html>`;

// ── 1. Order Confirmation ──────────────────────────────────────────────────────
export const sendOrderConfirmation = async (
    to: string,
    name: string,
    orderId: string,
    items: { title: string; quantity: number; price: number }[],
    total: number
) => {
    const itemsHtml = items.map(i => `
        <div class="item-row">
            <span class="item-name">${i.title}<span class="item-qty">× ${i.quantity}</span></span>
            <span class="item-price">$${(i.price * i.quantity).toFixed(2)}</span>
        </div>`).join('');

    const body = `
        <p class="greeting">Hi ${name}! 🎉</p>
        <p style="font-size:15px; color:#94a3b8; line-height:1.6; margin-top:8px;">
            Thank you for your order! We've received it and are now processing your items.
            Here's a summary of what you ordered:
        </p>
        <div class="section">
            <h3>Order #${orderId.slice(-8).toUpperCase()}</h3>
            ${itemsHtml}
            <div class="total-row">
                <span class="total-label">Total Paid</span>
                <span class="total-amount">$${total.toFixed(2)}</span>
            </div>
        </div>
        <div class="section" style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
            <div>
                <p style="font-size:13px; color:#94a3b8; margin-bottom:6px;">Current status</p>
                <span class="badge badge-warning">⏳ Processing</span>
            </div>
            <div>
                <p style="font-size:13px; color:#94a3b8; margin-bottom:6px;">What's next?</p>
                <p style="font-size:13px; color:#e2e8f0;">Payment confirmation → Shipping → Delivered</p>
            </div>
        </div>
        <div class="cta">
            <a href="${process.env.FRONTEND_URL}/orders/${orderId}" class="btn">Track Your Order →</a>
        </div>`;

    await transporter.sendMail({
        from: FROM,
        to,
        subject: `✅ Order Confirmed! #${orderId.slice(-8).toUpperCase()} — ShopMate`,
        html: emailTemplate(`Order Confirmed #${orderId.slice(-8).toUpperCase()}`, body),
    });

    console.log(`📧 Order confirmation sent to ${to}`);
};

// ── 2. Payment Success ─────────────────────────────────────────────────────────
export const sendPaymentSuccessEmail = async (
    to: string,
    name: string,
    orderId: string,
    total: number
) => {
    const body = `
        <p class="greeting">Payment Successful, ${name}! 💳✅</p>
        <p style="font-size:15px; color:#94a3b8; line-height:1.6; margin-top:8px;">
            Great news! Your payment of <strong style="color:#34d399;">$${total.toFixed(2)}</strong> has been confirmed.
            Your order is now being prepared for shipment.
        </p>
        <div class="section" style="text-align:center; padding: 28px;">
            <span class="badge badge-success" style="font-size:16px; padding: 10px 28px;">✓ Payment Confirmed</span>
            <p style="font-size:13px; color:#64748b; margin-top:16px;">Order #${orderId.slice(-8).toUpperCase()}</p>
        </div>
        <div class="section">
            <h3>Order Timeline</h3>
            <div class="item-row"><span class="item-name">✅ Order Placed</span><span class="badge badge-success" style="padding:3px 10px; font-size:11px;">Done</span></div>
            <div class="item-row"><span class="item-name">✅ Payment Confirmed</span><span class="badge badge-success" style="padding:3px 10px; font-size:11px;">Done</span></div>
            <div class="item-row"><span class="item-name">📦 Preparing Shipment</span><span class="badge badge-info" style="padding:3px 10px; font-size:11px;">In Progress</span></div>
            <div class="item-row"><span class="item-name">🚚 Shipped</span><span style="font-size:12px; color:#475569;">Soon</span></div>
            <div class="item-row"><span class="item-name">🏠 Delivered</span><span style="font-size:12px; color:#475569;">Soon</span></div>
        </div>
        <div class="cta">
            <a href="${process.env.FRONTEND_URL}/orders/${orderId}" class="btn">View Order Details →</a>
        </div>`;

    await transporter.sendMail({
        from: FROM,
        to,
        subject: `💳 Payment Confirmed! $${total.toFixed(2)} — Order #${orderId.slice(-8).toUpperCase()}`,
        html: emailTemplate('Payment Confirmed', body),
    });

    console.log(`📧 Payment success email sent to ${to}`);
};

// ── 3. Order Reminder (24h) ────────────────────────────────────────────────────
export const sendReminderEmail = async (
    to: string,
    name: string,
    orderId: string
) => {
    const body = `
        <p class="greeting">Hey ${name}, don't forget your order! 📦</p>
        <p style="font-size:15px; color:#94a3b8; line-height:1.6; margin-top:8px;">
            Your order <strong style="color:#e2e8f0;">#${orderId.slice(-8).toUpperCase()}</strong> is still pending payment.
            Complete your purchase before items sell out!
        </p>
        <div class="section" style="text-align:center; padding:28px;">
            <span class="badge badge-warning" style="font-size:15px; padding:10px 24px;">⏳ Awaiting Payment</span>
            <p style="margin-top:16px; font-size:13px; color:#94a3b8;">Your cart is saved — items may sell out soon</p>
        </div>
        <div class="cta">
            <a href="${process.env.FRONTEND_URL}/orders/${orderId}" class="btn">Complete Your Order →</a>
        </div>`;

    await transporter.sendMail({
        from: FROM,
        to,
        subject: `⏰ Reminder: Your order is waiting for payment — ShopMate`,
        html: emailTemplate('Order Reminder', body),
    });

    console.log(`📧 Reminder email sent to ${to}`);
};

// ── 4. Refund Confirmed ────────────────────────────────────────────────────────
export const sendRefundEmail = async (
    to: string,
    name: string,
    orderId: string,
    amount: number
) => {
    const body = `
        <p class="greeting">Hi ${name}, your refund is on the way! 💸</p>
        <p style="font-size:15px; color:#94a3b8; line-height:1.6; margin-top:8px;">
            We've successfully processed a refund of <strong style="color:#34d399;">$${amount.toFixed(2)}</strong>
            for order <strong style="color:#e2e8f0;">#${orderId.slice(-8).toUpperCase()}</strong>.
        </p>
        <div class="section" style="text-align:center; padding:28px;">
            <span class="badge badge-success" style="font-size:16px; padding:10px 28px;">✓ Refund Processed</span>
            <p style="margin-top:16px; font-size:13px; color:#94a3b8;">Funds typically appear within 5–10 business days</p>
        </div>
        <div class="section">
            <h3>Refund Details</h3>
            <div class="item-row"><span class="item-name">Order ID</span><span style="font-size:13px; color:#94a3b8; font-family:monospace;">#${orderId.slice(-8).toUpperCase()}</span></div>
            <div class="item-row"><span class="item-name">Refund Amount</span><span class="total-amount" style="font-size:16px;">$${amount.toFixed(2)}</span></div>
            <div class="item-row"><span class="item-name">Status</span><span class="badge badge-success" style="padding:3px 10px; font-size:11px;">Refunded</span></div>
        </div>
        <div class="cta">
            <a href="${process.env.FRONTEND_URL}/orders" class="btn">View All Orders →</a>
        </div>`;

    await transporter.sendMail({
        from: FROM,
        to,
        subject: `💸 Refund Processed! $${amount.toFixed(2)} for Order #${orderId.slice(-8).toUpperCase()}`,
        html: emailTemplate('Refund Processed', body),
    });

    console.log(`📧 Refund email sent to ${to}`);
};
