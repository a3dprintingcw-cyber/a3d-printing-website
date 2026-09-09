/**
 * A3D Printing site configuration
 * ----------------------------------
 * Edit the values below. Nothing else in the site needs to change.
 * After editing, commit and push (or just re-run the publish step) and
 * GitHub Pages will update automatically in a minute or two.
 */
window.A3D_CONFIG = {
  // Shown in the contact section and used to build the WhatsApp quick-quote link.
  // Use the full international number, digits only (no +, spaces or dashes).
  // Example for Curaçao: "5999XXXXXXX"
  whatsappNumber: "59995401708",

  // Contact email shown on the site.
  contactEmail: "a3dprinting.cw@gmail.com",

  // Our own back office (Cloudflare Worker). While this is set the quote forms
  // post here, files land in our own storage and every request shows up in the
  // back office at https://app.a3dprinting.com/admin. Blank it out and the site
  // falls straight back to Formspree below.
  apiBase: "https://app.a3dprinting.com/api",

  // Formspree endpoint, kept only as a fallback for the line above.
  // 1. Go to https://formspree.io and create a free account (takes ~2 min).
  // 2. Create a new form, copy the endpoint it gives you
  //    (looks like "https://formspree.io/f/abcdwxyz").
  // 3. Paste it below.
  // File uploads (STL/OBJ/3MF/images) are supported on Formspree's free plan.
  formspreeEndpoint: "https://formspree.io/f/xqpkyynq",

  // Booking page for the "Book a meeting" section. Leave blank and the
  // whole section stays hidden. Use a Google Calendar appointment schedule
  // (Calendar → Create → Appointment schedule) set to require your
  // confirmation, or a Cal.com / Calendly link. Paste the booking URL here.
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/AcZssZ3ID6LkVo12Y4j4N6zemnbxYWM3ywSgozd4WU9zYmAh8Lis0YYo9CcgbwvG3grtKi0CIhxieJH6?gv=true",

  // Instagram profile. Paste the full URL here and the Instagram buttons
  // (header, mobile menu, closing banner, contact and footer) turn on.
  // Leave both blank and they all stay hidden.
  instagramUrl: "https://www.instagram.com/a3dprinting_cw/",
  instagramHandle: "@a3dprinting_cw",

  // Optional, shown in the Contact section. Leave blank to hide a line.
  address: "Curaçao",
  hours: "Mon–Fri 9:00–17:00 AST",

  // Business name / tagline (also used in page title + footer)
  businessName: "A3D Printing",
  tagline: "Printing the Future",
};
