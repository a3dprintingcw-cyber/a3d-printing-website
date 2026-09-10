// Outbound alerts to Adrian.
//
// Sent through the same Gmail connection the quotes use, so the domain's MX
// records never have to change and there is one thing to keep working instead
// of two. Failure is logged, never thrown: a broken mail setup must not lose
// a customer's request.

import { sendMail, isConfigured } from './gmail.js';

export async function alertAdmin(env, subject, text) {
  if (!(await isConfigured(env))) {
    console.log('email: gmail not connected, skipping alert:', subject);
    return false;
  }
  try {
    await sendMail(env, {
      to: env.ADMIN_EMAIL,
      subject,
      text,
      html: '<pre style="font:14px/1.5 ui-monospace,monospace">' +
        text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>',
    });
    return true;
  } catch (err) {
    console.log('email: alert failed', err.message);
    return false;
  }
}

export function newOrderAlert(order, customer, files) {
  const lines = [
    `${order.ref} from ${customer.name}${customer.company ? ' (' + customer.company + ')' : ''}`,
    '',
    customer.company ? `Company:  ${customer.company}` : null,
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
