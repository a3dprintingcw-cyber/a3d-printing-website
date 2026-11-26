/* A3D Printing: show one section ("page") at a time instead of one long scroll.
 * Every <section data-page="..."> belongs to a page. The URL hash picks the
 * page: #work, #services, #quote ... Any old in-page anchor (#scanning,
 * #materials, #about) still works: it opens the page that holds it and
 * scrolls to it. Videos only load and play while their page is showing. */
(function () {
  var sections = Array.prototype.slice.call(document.querySelectorAll("section[data-page]"));
  if (!sections.length) return;
  var PAGES = ["home", "work", "services", "repairs", "quote", "contact"];

  function pageFor(hash) {
    var id = (hash || "").replace(/^#/, "");
    if (!id || id === "top") return { page: "home", target: null };
    if (PAGES.indexOf(id) !== -1 && !document.getElementById(id)) return { page: id, target: null };
    var el = document.getElementById(id);
    var sec = el && (el.closest ? el.closest("section[data-page]") : null);
    if (sec) return { page: sec.getAttribute("data-page"), target: sec === sections.filter(function (s) { return s.getAttribute("data-page") === sec.getAttribute("data-page"); })[0] ? null : el };
    return { page: "home", target: null };
  }

  function modeHides(page) {
    var mode = document.body.getAttribute("data-mode");
    return mode === "dev" && (page === "work" || page === "repairs");
  }

  function playVideos(on) {
    sections.forEach(function (s) {
      var visible = !s.classList.contains("page-hidden");
      s.querySelectorAll("video").forEach(function (v) {
        if (visible && on) {
          if (!v.getAttribute("src") && v.dataset.src) v.setAttribute("src", v.dataset.src);
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        } else if (!v.paused) v.pause();
      });
    });
  }

  function show(hash, scroll) {
    var r = pageFor(hash);
    if (modeHides(r.page)) r = { page: "home", target: null };
    sections.forEach(function (s) {
      s.classList.toggle("page-hidden", s.getAttribute("data-page") !== r.page);
    });
    document.querySelectorAll(".main-nav a, .mobile-nav a").forEach(function (a) {
      var h = a.getAttribute("href") || "";
      var active = h.charAt(0) === "#" && pageFor(h).page === r.page;
      a.classList.toggle("is-active", active);
    });
    document.body.setAttribute("data-page", r.page);
    playVideos(true);
    if (scroll !== false) {
      if (r.target) r.target.scrollIntoView({ behavior: "auto", block: "start" });
      else window.scrollTo(0, 0);
    }
    // reveal animations: anything on the newly shown page is visible now
    sections.forEach(function (s) {
      if (!s.classList.contains("page-hidden")) s.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("is-visible"); });
    });
  }

  window.addEventListener("hashchange", function () { show(location.hash); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var h = a.getAttribute("href");
    if (h === "#" || h.length < 2) return;
    if (h === location.hash) { e.preventDefault(); show(h); }
    document.body.classList.remove("nav-open");
  });
  // the mode switch can hide the current page (Work/Repairs in dev mode)
  new MutationObserver(function () { show(location.hash, false); })
    .observe(document.body, { attributes: true, attributeFilter: ["data-mode"] });
  document.addEventListener("visibilitychange", function () { playVideos(!document.hidden); });

  show(location.hash, !!location.hash);

  // Hero parallax: the photo drifts slower than the page, zooms in and fades,
  // and the headline lifts away. Only transforms and opacity, so it stays smooth.
  var hero = document.querySelector('.hero'), bg = document.querySelector('.hero-bg');
  if (hero && bg && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ticking = false;
    var paint = function () {
      ticking = false;
      if (hero.classList.contains('page-hidden')) return;
      var h = hero.offsetHeight || 1;
      var p = Math.max(0, Math.min(1, window.scrollY / h));
      bg.style.setProperty('--hero-y', (p * h * 0.35).toFixed(1) + 'px');
      bg.style.setProperty('--hero-s', (1.04 + p * 0.14).toFixed(3));
      bg.style.setProperty('--hero-o', (1 - p * 0.85).toFixed(3));
      hero.style.setProperty('--copy-y', (p * -60).toFixed(1) + 'px');
      hero.style.setProperty('--copy-o', (1 - p * 0.9).toFixed(3));
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }
})();
