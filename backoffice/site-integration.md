# Switching the website over to our own API

Not applied yet on purpose: while the Worker is undeployed, Formspree keeps
the live quote form working. These are the exact edits for cutover day.

## 1. `js/config.js`

```js
  // Our own back office. Leave blank to keep using Formspree.
  apiBase: "https://a3dprinting.com/api",
```

## 2. `js/main.js`, inside `initForm`

Replace the endpoint line

```js
      var endpoint = cfg.formspreeEndpoint;
```

with

```js
      var endpoint = cfg.apiBase ? cfg.apiBase + "/quote-request" : cfg.formspreeEndpoint;
```

The rest of the function needs no changes: it already posts `FormData`, and
the Worker accepts the same field names the form already uses (`name`,
`email`, `phone`, `material`, `quantity`, `color`, `notes`, `attachment`).

Two small additions in the same file:

```js
      // tell the back office which side of the site this came from
      data.append("mode", body.getAttribute("data-mode") || "print");
```

and a honeypot in both forms, which costs nothing and stops the dumbest bots:

```html
<input type="text" name="company_website" tabindex="-1" autocomplete="off"
       style="position:absolute;left:-9999px" aria-hidden="true">
```

Anything submitted with that field filled in gets a cheerful 200 and is
dropped on the floor.

## 3. Page view beacon, at the end of `main.js`

```js
  if (cfg.apiBase) {
    try {
      navigator.sendBeacon(cfg.apiBase + "/e", JSON.stringify({
        path: location.pathname,
        referrer: document.referrer,
        mode: body.getAttribute("data-mode")
      }));
    } catch (e) {}
  }
```

No cookies, no third party script, and it costs one request per page view.

## 4. Success message

The Worker answers `{ ok: true, ref: "A3D-0042" }`. Worth showing that
reference to the customer, since it is what the emails and the back office
use:

```js
            status.textContent = "Thanks! Your request is in, reference " +
              (json.ref || "") + ". We'll get back to you shortly.";
```

## Rollback

Blank out `apiBase` in `config.js` and the site is back on Formspree with no
other change.
