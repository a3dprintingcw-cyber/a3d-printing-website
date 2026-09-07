# A3D Printing — website

A single-page website for A3D Printing (Curaçao): custom 3D printing quote
requests (upload an STL or a photo) plus a second "mode" for the freelance
web & app development side of the business. Plain HTML/CSS/JS — no build
step, no framework, deploys straight to GitHub Pages.

**Live site:** see the repo's **About** panel on GitHub (top right of the
repo page) once Pages is enabled, or `https://<your-username>.github.io/<repo-name>/`.

## What's here

```
index.html        the whole site (one page, anchor-linked sections)
css/styles.css     styling, incl. light/dark theme via CSS variables
js/config.js       ← edit this: your email, WhatsApp number, Formspree ID
js/main.js         theme toggle, mode switch, file upload UI, form submit
assets/img/        logo (light/dark variants) + favicons, generated from
                    the logo you uploaded to this project
```

## 1. Finish the setup (2 minutes)

Open `js/config.js` and fill in:

- `whatsappNumber` — your number, digits only, country code first (e.g.
  `"59996001234"`). Powers the "Send via WhatsApp" quick-quote buttons and
  the number shown in the Contact section.
- `contactEmail` — shown on the site.
- `formspreeEndpoint` — lets the quote/inquiry forms (including file
  uploads) actually email you.
  1. Go to <https://formspree.io> and create a free account.
  2. Create a new form, copy the endpoint (`https://formspree.io/f/xxxxxxx`).
  3. Paste it in as `formspreeEndpoint`.
  4. Formspree's free plan includes file attachments — good for STL/OBJ/3MF
     files and photos. Very large STL files may be better sent over
     WhatsApp instead; the form asks for files under 25MB.
- `address` / `hours` — optional, shown in the Contact section.

Until these are filled in, the site shows a small "setup needed" banner on
the quote form and the WhatsApp buttons explain what's missing — nothing
breaks, it just won't be able to reach you yet.

Until you have real photos, the **Recent work** and **What clients say**
sections use clearly-labeled placeholder cards / an empty state — swap in
real photos and (with permission) real reviews as you get them, directly in
`index.html`.

## 2. Editing the site

Everything is in plain HTML/CSS/JS, no build step:

- Text, sections, form fields → `index.html`
- Colors, spacing, layout → `css/styles.css` (see the `:root` and
  `[data-theme="dark"]` blocks at the top for the color palette)
- Behavior (toggles, form submit, file upload) → `js/main.js`

Content that differs between the **3D Printing** and **Web & App Dev**
modes is marked with `data-content-for="print"` or `data-content-for="dev"`
in the HTML — edit the pair together so both modes stay in sync.

## 3. Publishing changes

This repo is set up to serve straight from the `main` branch via GitHub
Pages. Any push to `main` updates the live site within a minute or two:

```bash
git add -A
git commit -m "Update site"
git push
```

If you're working with Claude, just ask for the change — it will edit the
files and push for you.

## 4. Custom domain (optional)

If you'd like `a3dprinting.cw` (or similar) instead of the default
`github.io` address: buy the domain, then in the repo's **Settings → Pages**
add it as a custom domain, and add the DNS records GitHub shows you at your
domain registrar. GitHub will add a `CNAME` file to the repo automatically.

## Notes on the quote form

- Accepts `.stl`, `.obj`, `.3mf`, `.step`/`.stp`, and `.png`/`.jpg`/`.pdf`
  (for a reference photo), capped at 25MB client-side.
- Submits via `fetch` to Formspree as `multipart/form-data`, so attachments
  go through.
- The WhatsApp button is a no-signup fallback that always works once a
  number is set, and is handy for customers on mobile.
