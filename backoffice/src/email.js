// Outbound email.
//
// Phase 1 only needs one thing: tell Adrian a request came in. That goes
// through Cloudflare's send_email binding, which can deliver to a verified
// destination address on the zone. If the binding is missing the order is
// still saved and the failure is logged, never thrown: a broken mail setup
// must not lose a customer's request.
//
// Phase 2 replaces this with the Gmail API so quotes go out from
// a3dprinting.cw@gmail.com and land in the real Sent folder.

function mime({ from, to, subject, text }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
  ];
  return lines.join('\r\n');
}

export async function alertAdmin(env, subject, text) {
  if (!env.ALERTS) {
    console.log('email: no ALERTS binding, skipping', subject);
    return false;
  }
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const from = `noreply@${new URL(env.PUBLIC_ORIGIN).hostname}`;
    const msg = new EmailMessage(
      from,
      env.ADMIN_EMAIL,
      mime({ from, to: env.ADMIN_EMAIL, subject, text }),
    );
    await env.ALERTS.send(msg);
    return true;
  } catch (err) {
    console.log('email: send failed', err.message);
    return false;
  }
}

export function newOrderAlert(order, customer, files) {
  const lines = [
    `${order.ref} from ${customer.name}`,
    '',
    `Email:    ${customer.email}`,
    customer.phone ? `Phone:    ${customer.phone}` : null,
    order.mode === 'dev' ? `Project:  ${order.project_type || '-'}` : `Material: ${order.material || '-'}`,
    order.mode === 'dev' ? `Timeline: ${order.timeline || '-'}` : `Quantity: ${order.quantity || '-'}`,
    order.colour ? `Colour:   ${order.colour}` : null,
    '',
    order.notes || '(no notes)',
    '',
    files.length ? `${files.length} file(s) attached to the order.` : 'No files uploaded.',
    '',
    'Open the back office: https://a3dprinting.com/admin',
  ].filter(Boolean);
  return lines.join('\n');
}
