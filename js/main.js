(function () {
  "use strict";

  var cfg = window.A3D_CONFIG || {};
  var root = document.documentElement;
  var body = document.body;

  /* ---------------- Theme follows the mode ----------------
     There is no manual light/dark toggle: the 3D Printing side runs
     dark, the Web & App Dev side runs light, and the mode switch
     drives both together. */
  var MODE_THEME = { print: "dark", dev: "light" };

  function themeForMode(mode) {
    return MODE_THEME[mode] || "dark";
  }
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(MODE_KEY); } catch (e) {}
    applyTheme(themeForMode(saved === "dev" ? "dev" : "print"));
  }

  /* ---------------- Mode switch (3D Printing / Web & App Dev) ---------------- */
  var MODE_KEY = "a3d-mode";

  // Elements toggled by [data-content-for] keep whatever layout display
  // they actually need (grid/flex/inline-flex/inline) rather than always
  // falling back to "block". Set an explicit data-display="..." attribute
  // in the HTML for anything not covered by the defaults below.
  function preferredDisplay(el) {
    if (el.dataset.display) return el.dataset.display;
    var cls = el.classList;
    if (cls.contains("grid") || cls.contains("steps")) return "grid";
    if (cls.contains("btn") || cls.contains("eyebrow")) return "inline-flex";
    if (cls.contains("hero-stats")) return "flex";
    var tag = el.tagName;
    if (tag === "SPAN" || tag === "A") return "inline";
    return "block";
  }

  function applyMode(mode) {
    body.setAttribute("data-mode", mode);
    applyTheme(themeForMode(mode));
    document.querySelectorAll(".mode-switch button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-mode") === mode);
    });
    document.querySelectorAll("[data-content-for]").forEach(function (el) {
      var match = el.getAttribute("data-content-for") === mode;
      el.style.display = match ? preferredDisplay(el) : "none";
    });
    document.querySelectorAll("[data-logo-mode]").forEach(function (img) {
      img.style.display = img.getAttribute("data-logo-mode") === (root.getAttribute("data-theme") || "light") ? "block" : "none";
    });
  }
  function initMode() {
    var saved = null;
    try { saved = localStorage.getItem(MODE_KEY); } catch (e) {}
    applyMode(saved === "dev" ? "dev" : "print");
  }
  function setMode(mode) {
    // Re-trigger the swap animation on each switch (not on first paint).
    body.classList.remove("mode-switching");
    void body.offsetWidth; // force reflow so the animation restarts
    body.classList.add("mode-switching");
    window.setTimeout(function () { body.classList.remove("mode-switching"); }, 500);

    applyMode(mode);
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
  }

  // Keep the mobile browser chrome in step with the active palette.
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var accent = getComputedStyle(body).getPropertyValue("--blue").trim();
    if (accent) meta.setAttribute("content", accent);
  }

  /* ---------------- Reveal sections on scroll ---------------- */
  function initReveal() {
    var targets = document.querySelectorAll(
      ".section-head, .card, .step, .portfolio-card, .form-card, .about-grid > *, .table-wrap, .cta-banner .container"
    );
    if (!targets.length) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("reveal", "is-visible"); });
      return;
    }

    targets.forEach(function (el) { el.classList.add("reveal"); });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // Stagger siblings so a grid rolls in rather than popping at once.
        var siblings = el.parentNode ? Array.prototype.slice.call(el.parentNode.children) : [];
        var index = siblings.indexOf(el);
        el.style.setProperty("--reveal-delay", Math.min(index, 5) * 70 + "ms");
        el.classList.add("is-visible");
        observer.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    targets.forEach(function (el) { observer.observe(el); });
  }

  /* ---------------- Mobile nav ---------------- */
  function toggleNav() {
    body.classList.toggle("nav-open");
  }

  /* ---------------- Footer year ---------------- */
  function setYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ---------------- Config-driven content ---------------- */
  function applyConfig() {
    document.querySelectorAll("[data-cfg-email]").forEach(function (el) {
      var email = cfg.contactEmail || "";
      if (!email) return;
      el.textContent = email;
      if (el.tagName === "A") el.href = "mailto:" + email;
    });
    document.querySelectorAll("[data-cfg-address]").forEach(function (el) {
      if (cfg.address) el.textContent = cfg.address;
    });
    document.querySelectorAll("[data-cfg-hours]").forEach(function (el) {
      if (cfg.hours) el.textContent = cfg.hours;
    });
    document.querySelectorAll("[data-cfg-whatsapp-display]").forEach(function (el) {
      el.textContent = cfg.whatsappNumber ? "+" + cfg.whatsappNumber : "Add your number in js/config.js";
    });

    // Booking section only exists if there's somewhere to book.
    var booking = document.getElementById("book");
    if (booking) {
      if (cfg.bookingUrl) {
        booking.style.display = "";
        document.querySelectorAll(".js-booking-frame").forEach(function (f) {
          if (!f.getAttribute("src")) f.setAttribute("src", cfg.bookingUrl);
        });
        document.querySelectorAll(".js-booking-link").forEach(function (a) { a.href = cfg.bookingUrl; });
        document.querySelectorAll(".js-booking-nav").forEach(function (a) { a.style.display = ""; });
      } else {
        booking.style.display = "none";
        document.querySelectorAll(".js-booking-nav").forEach(function (a) { a.style.display = "none"; });
      }
    }

    var igUrl = (cfg.instagramUrl || "").trim();
    var igHandle = (cfg.instagramHandle || "").trim();
    document.querySelectorAll("[data-cfg-instagram]").forEach(function (a) {
      if (igUrl) {
        a.setAttribute("href", igUrl);
      } else {
        a.style.display = "none";
      }
    });
    document.querySelectorAll("[data-cfg-instagram-item]").forEach(function (el) {
      if (!igUrl) el.style.display = "none";
    });
    document.querySelectorAll("[data-cfg-instagram-display]").forEach(function (el) {
      if (igHandle) el.textContent = igHandle;
    });

    var needsSetup = !cfg.whatsappNumber || !cfg.formspreeEndpoint;
    document.querySelectorAll(".setup-banner").forEach(function (el) {
      el.style.display = needsSetup ? "flex" : "none";
    });

    document.querySelectorAll(".js-whatsapp-link").forEach(function (a) {
      a.href = buildWhatsAppLink(a.getAttribute("data-template") || "");
      if (!cfg.whatsappNumber) {
        a.classList.add("is-disabled");
        a.addEventListener("click", function (e) {
          e.preventDefault();
          alert("Add your WhatsApp number in js/config.js to enable this button.");
        });
      }
    });
  }

  function buildWhatsAppLink(prefill) {
    var number = cfg.whatsappNumber || "";
    var text = encodeURIComponent(prefill);
    return "https://wa.me/" + number + (text ? "?text=" + text : "");
  }

  /* ---------------- File upload UI ---------------- */
  function initFileDrop(dropId, inputId, listId) {
    var drop = document.getElementById(dropId);
    var input = document.getElementById(inputId);
    var list = document.getElementById(listId);
    if (!drop || !input) return;

    function render() {
      list.innerHTML = "";
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      files.forEach(function (f) {
        var row = document.createElement("div");
        var size = f.size > 1024 * 1024 ? (f.size / (1024 * 1024)).toFixed(1) + " MB" : Math.round(f.size / 1024) + " KB";
        row.innerHTML = "<span>" + escapeHtml(f.name) + "</span><span>" + size + "</span>";
        list.appendChild(row);
      });
    }

    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", render);

    ["dragenter", "dragover"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.remove("dragover");
      });
    });
    drop.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        input.files = dt.files;
        render();
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- Form submission (Formspree) ---------------- */
  function initForm(formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var status = form.querySelector(".form-status");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var endpoint = cfg.formspreeEndpoint;

      if (!endpoint) {
        status.className = "form-status err";
        status.textContent = "This form isn't connected yet. The owner needs to add a Formspree endpoint in js/config.js. In the meantime, please use the WhatsApp button below.";
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var originalLabel = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
      status.className = "form-status";
      status.textContent = "";

      var data = new FormData(form);
      fetch(endpoint, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          if (res.ok) {
            status.className = "form-status ok";
            status.textContent = "Thanks! Your request has been sent. We'll get back to you shortly.";
            form.reset();
            var list = form.querySelector('[id$="file-list"]');
            if (list) list.innerHTML = "";
          } else {
            return res.json().then(function (json) {
              throw new Error((json && json.errors && json.errors[0] && json.errors[0].message) || "Something went wrong.");
            });
          }
        })
        .catch(function (err) {
          status.className = "form-status err";
          status.textContent = "Couldn't send the form (" + err.message + "). Please try the WhatsApp button below instead.";
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
        });
    });
  }

  /* ---------------- Wire up quick-quote WhatsApp text from print form fields ---------------- */
  function initQuickQuoteSync() {
    var btn = document.getElementById("whatsapp-quote-btn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      if (!cfg.whatsappNumber) return; // handled by generic disabled-click alert
      e.preventDefault();
      var form = document.getElementById("quote-form-print");
      var get = function (name) {
        var el = form.querySelector('[name="' + name + '"]');
        return el ? el.value : "";
      };
      var lines = [
        "Hi A3D Printing! I'd like a quote:",
        get("name") ? "Name: " + get("name") : "",
        get("material") ? "Material: " + get("material") : "",
        get("quantity") ? "Quantity: " + get("quantity") : "",
        get("notes") ? "Details: " + get("notes") : "",
        "(I'll send my STL/photo file here on WhatsApp.)",
      ].filter(Boolean).join("\n");
      window.open(buildWhatsAppLink(lines), "_blank", "noopener");
    });
  }

  /* ---------------- Init ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initMode();
    applyConfig();
    setYear();
    initFileDrop("file-drop-print", "file-input-print", "file-list-print");
    initForm("quote-form-print");
    initForm("quote-form-dev");
    initQuickQuoteSync();
    initReveal();
    syncThemeColor();

    document.querySelectorAll(".mode-switch button").forEach(function (btn) {
      btn.addEventListener("click", function () { setMode(btn.getAttribute("data-mode")); syncThemeColor(); });
    });

    var navToggle = document.getElementById("nav-toggle");
    if (navToggle) navToggle.addEventListener("click", toggleNav);
    document.querySelectorAll(".mobile-nav a").forEach(function (a) {
      a.addEventListener("click", function () { body.classList.remove("nav-open"); });
    });
  });

  // Apply theme immediately (before DOMContentLoaded) to avoid a flash of wrong theme.
  initTheme();
})();
