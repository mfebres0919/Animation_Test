/* ========================================================================
   GLOBAL.JS — Site-wide behavior shared by every page.
   Page-specific interactions belong in script.js or a page-named file.
   ======================================================================== */

window.MF = window.MF || {};

/**
 * Reduced-motion preference, read live so it stays correct if the user
 * changes the system setting without reloading.
 * @returns {boolean}
 */
window.MF.prefersReducedMotion = function () {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

/**
 * Coarse-pointer devices. Used to pick lighter media and shorter scroll
 * distances rather than to assume a screen width.
 * @returns {boolean}
 */
window.MF.isTouchDevice = function () {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
};

/* ========================================================================
   SITE HEADER + PRIMARY NAVIGATION
   Shared across every page. ARIA state is the single source of truth:
   CSS reacts to aria-expanded rather than keeping a parallel class.
   ======================================================================== */

(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var nav = document.getElementById("primaryNav");
  var navToggle = document.getElementById("navToggle");

  if (!header || !nav || !navToggle) return;

  var backdrop = document.getElementById("navBackdrop");
  var submenuToggles = nav.querySelectorAll(".submenu-toggle");
  var desktopQuery = window.matchMedia("(min-width: 64em)");

  /* ----------------------------------------------------- Mobile panel -- */

  function setMenu(open) {
    navToggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("is-menu-open", open);

    if (backdrop) backdrop.classList.toggle("is-visible", open);

    // The drawer hangs off the header's live bottom edge, which moves as the
    // gold utility bar scrolls away under the sticky main bar.
    if (open) {
      nav.style.setProperty(
        "--drawer-top",
        Math.max(0, header.getBoundingClientRect().bottom) + "px"
      );
    }

    // Submenus should never be left hanging open behind a closed drawer.
    if (!open) closeSubmenus(null);
  }

  function isMenuOpen() {
    return navToggle.getAttribute("aria-expanded") === "true";
  }

  navToggle.addEventListener("click", function () {
    setMenu(!isMenuOpen());
  });

  // Following a link should close the drawer behind it.
  nav.addEventListener("click", function (event) {
    if (event.target.closest("a") && !desktopQuery.matches) setMenu(false);
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () { setMenu(false); });
  }

  /* --------------------------------------------------------- Submenus -- */

  function closeSubmenus(except) {
    submenuToggles.forEach(function (toggle) {
      if (toggle !== except) toggle.setAttribute("aria-expanded", "false");
    });
  }

  submenuToggles.forEach(function (toggle) {
    var parent = toggle.closest(".primary-nav__item--has-submenu");

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      closeSubmenus(toggle);
      toggle.setAttribute("aria-expanded", String(!open));
    });

    if (!parent) return;

    // Desktop pointer users get hover, but aria-expanded is updated with it
    // so assistive technology is never told something untrue (§13).
    parent.addEventListener("mouseenter", function () {
      if (desktopQuery.matches) toggle.setAttribute("aria-expanded", "true");
    });

    parent.addEventListener("mouseleave", function () {
      if (desktopQuery.matches) toggle.setAttribute("aria-expanded", "false");
    });

    // Keyboard parity: leaving the group entirely closes it.
    parent.addEventListener("focusout", function (event) {
      if (desktopQuery.matches && !parent.contains(event.relatedTarget)) {
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  });

  /* ---------------------------------------------------------- Escape --- */

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;

    var openToggle = nav.querySelector('.submenu-toggle[aria-expanded="true"]');

    if (openToggle) {
      openToggle.setAttribute("aria-expanded", "false");
      openToggle.focus();
    } else if (isMenuOpen()) {
      setMenu(false);
      navToggle.focus();
    }
  });

  /* ------------------------------------------- Crossing the breakpoint -- */

  desktopQuery.addEventListener("change", function () {
    setMenu(false);
    closeSubmenus(null);
  });

})();

/* ========================================================================
   TABS
   Any [data-tabs] block with role="tablist" buttons and matching panels.
   Follows the WAI-ARIA tabs pattern: roving tabindex, arrow-key movement,
   Home/End, and aria-selected as the single source of truth for styling.
   ======================================================================== */

(function () {
  "use strict";

  var groups = document.querySelectorAll("[data-tabs]");
  if (!groups.length) return;

  groups.forEach(function (group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    function select(tab, moveFocus) {
      tabs.forEach(function (other) {
        var isSelected = other === tab;
        var panel = document.getElementById(other.getAttribute("aria-controls"));

        other.setAttribute("aria-selected", String(isSelected));
        // Roving tabindex: only the selected tab is a tab stop, so the panel
        // is one keypress away instead of four.
        other.setAttribute("tabindex", isSelected ? "0" : "-1");

        if (panel) panel.hidden = !isSelected;
      });

      if (moveFocus) tab.focus();
    }

    group.addEventListener("click", function (event) {
      var tab = event.target.closest('[role="tab"]');
      if (tab && tabs.indexOf(tab) !== -1) select(tab, false);
    });

    group.addEventListener("keydown", function (event) {
      var current = tabs.indexOf(event.target);
      if (current === -1) return;

      var next = null;

      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;

      if (next === null) return;

      event.preventDefault();
      select(tabs[next], true);
    });
  });
})();

/* ========================================================================
   IN-VIEW VIDEO
   [data-autoplay-inview] plays only while on screen and loads nothing until
   then, so a decorative loop never costs anything on a page the visitor
   does not scroll. Honours prefers-reduced-motion by leaving the still up.
   ======================================================================== */

(function () {
  "use strict";

  var targets = document.querySelectorAll("[data-autoplay-inview]");
  if (!targets.length || !("IntersectionObserver" in window)) return;

  // The flag may sit on the video itself or on a wrapper around it - a card
  // whose video is transparent until it plays is easier to observe by its
  // wrapper. Resolve either form to the actual media element.
  function videoIn(element) {
    return element.tagName === "VIDEO" ? element : element.querySelector("video");
  }

  if (window.MF.prefersReducedMotion()) return;

  var wantsMobileSource = window.MF.isTouchDevice() || window.innerWidth < 900;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = videoIn(entry.target);
      if (!video) return;

      if (!entry.isIntersecting) {
        video.pause();
        return;
      }

      // First time on screen: attach the source and start downloading.
      if (!video.getAttribute("src")) {
        var source = wantsMobileSource
          ? video.getAttribute("data-src-mobile")
          : video.getAttribute("data-src-desktop");

        if (!source) return;

        video.addEventListener("loadeddata", function () {
          video.classList.add("is-ready");
        });

        video.setAttribute("src", source);
      }

      var attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        // Autoplay can still be refused; the still stays visible if so.
        attempt.catch(function () {});
      }
    });
  }, { rootMargin: "200px 0px", threshold: 0.1 });

  targets.forEach(function (target) { observer.observe(target); });
})();

/* ========================================================================
   BACK TO TOP
   ======================================================================== */

(function () {
  "use strict";

  var button = document.getElementById("toTop");
  if (!button) return;

  var queued = false;

  function sync() {
    button.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.9);
  }

  window.addEventListener("scroll", function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () { sync(); queued = false; });
  }, { passive: true });

  button.addEventListener("click", function () {
    // Same eased scroll as the nav links, and capped in the same way so the
    // trip back up through the pinned hero stays short.
    window.MF.scrollToY(0, function () {
      var skip = document.querySelector(".skip-link");
      if (skip) skip.focus({ preventScroll: true });
    });
  });

  sync();
})();


/* ========================================================================
   SCROLLSPY
   Marks the nav entry for whichever section is currently under the header.
   aria-current is the single source of truth: CSS selects off it, and a
   screen reader announces the current location for free.
   ======================================================================== */

(function () {
  "use strict";

  var nav = document.getElementById("primaryNav");
  var mainBar = document.querySelector(".main-bar");
  if (!nav || !mainBar) return;

  // Pair each nav entry with its section. Links carry a hash; the Services
  // entry is a button, so it names its section explicitly.
  var pairs = [];

  nav.querySelectorAll(".primary-nav__link").forEach(function (link) {
    var id = link.getAttribute("data-nav-section") ||
             (link.getAttribute("href") || "").replace("#", "");
    if (!id) return;

    var section = document.getElementById(id);
    if (section) pairs.push({ link: link, section: section });
  });

  if (!pairs.length) return;

  var currentLink = null;

  function setCurrent(link) {
    if (link === currentLink) return;

    if (currentLink) currentLink.removeAttribute("aria-current");
    if (link) link.setAttribute("aria-current", "location");

    currentLink = link;
  }

  function update() {
    // The detection line sits just under the sticky bar, so a section counts
    // as current the moment it reaches the point where reading resumes.
    var line = mainBar.offsetHeight + 1;
    var match = pairs[0];

    for (var i = 0; i < pairs.length; i++) {
      // getBoundingClientRect rather than a cached offset: while GSAP has
      // the hero pinned it is position: fixed, so its real position only
      // shows up in a live measurement.
      if (pairs[i].section.getBoundingClientRect().top <= line) match = pairs[i];
    }

    // Anchored at the very bottom, the last section may be too short to
    // ever cross the line; it is still where the reader is.
    var atBottom = window.innerHeight + window.scrollY >=
                   document.documentElement.scrollHeight - 2;

    setCurrent(atBottom ? pairs[pairs.length - 1].link : match.link);
  }

  var queued = false;

  window.addEventListener("scroll", function () {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () { update(); queued = false; });
  }, { passive: true });

  window.addEventListener("resize", update);
  update();
})();

/* Keeps the footer copyright year current without editing the markup. */
(function () {
  "use strict";
  var year = String(new Date().getFullYear());
  document.querySelectorAll("[data-current-year]").forEach(function (node) {
    node.textContent = year;
  });
})();

/* ========================================================================
   SCROLL REVEAL
   Sections ease in as they are reached. Deliberately slow: a long duration
   with a gentle stagger reads as intentional, where a quick pop reads as a
   glitch.

   Uses IntersectionObserver with a negative bottom margin rather than a
   ScrollTrigger batch. ScrollTrigger resolves its start positions against
   the document as it stands when the trigger is created - and on this page
   the hero's pin spacer adds several thousand pixels later, so those
   positions went stale and elements revealed long before the reader
   reached them. The observer's margin is evaluated by the browser on every
   intersection, so it cannot drift.

   The hidden state is applied by JavaScript adding [data-reveal], never by
   the markup. No JavaScript or a reduced-motion preference means the
   attribute is never added and nothing is left invisible.
   ======================================================================== */

(function () {
  "use strict";

  if (!("IntersectionObserver" in window)) return;
  if (window.MF.prefersReducedMotion()) return;

  var SELECTORS = [
    ".about__media",
    ".about__content",
    ".services__head",
    ".services__visual",
    ".services__list > li",
    ".gallery__head",
    ".gallery__grid > li",
    ".cta-banner__inner",
    ".contact__media",
    ".contact__content",
    ".subscribe__inner",
    ".site-footer__grid > *"
  ];

  // Sticky columns fade without the vertical travel: a rising sticky column
  // reads oddly, and a lingering transform on one is best avoided.
  var FADE_ONLY = [".about__media", ".services__visual"];

  var STAGGER = 0.16;   // seconds between siblings entering together

  var fadeOnly = [];
  FADE_ONLY.forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (el) { fadeOnly.push(el); });
  });

  var elements = [];

  SELECTORS.forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (el) {
      if (el.hasAttribute("data-reveal")) return;
      el.setAttribute("data-reveal", fadeOnly.indexOf(el) === -1 ? "" : "fade");
      elements.push(el);
    });
  });

  if (!elements.length) return;

  // Siblings revealed together step in one after another. Grouping by parent
  // keeps each row or column on its own count rather than one running total.
  var seen = new Map();

  elements.forEach(function (el) {
    var index = seen.get(el.parentElement) || 0;
    if (index) el.style.setProperty("--reveal-delay", (index * STAGGER).toFixed(2) + "s");
    seen.set(el.parentElement, index + 1);
  });

  function release(el) {
    // Dropping the attribute releases the CSS hidden state and leaves the
    // element exactly as authored.
    el.removeAttribute("data-reveal");
    el.style.removeProperty("--reveal-delay");
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;

      var el = entry.target;
      observer.unobserve(el);
      el.classList.add("is-revealed");

      el.addEventListener("transitionend", function handler(event) {
        if (event.propertyName !== "opacity") return;
        el.removeEventListener("transitionend", handler);
        el.classList.remove("is-revealed");
        release(el);
      });
    });
  }, {
    // Pulls the trigger line up to 72% of the viewport, so an element starts
    // once it is properly on screen rather than as its top edge appears.
    rootMargin: "0px 0px -28% 0px",
    threshold: 0
  });

  elements.forEach(function (el) { observer.observe(el); });
})();

/* ========================================================================
   SMOOTH IN-PAGE SCROLLING
   Written by hand rather than using scroll-behavior: smooth, which fights
   ScrollTrigger - with it enabled, programmatic scrolls measurably landed
   250-450px away from where they were sent. Doing it here means the
   duration is capped too, so a jump from the footer to the top does not
   crawl back through five screens of pinned hero.
   ======================================================================== */

(function () {
  "use strict";

  var mainBar = document.querySelector(".main-bar");
  var running = null;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function limit(y) {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    return Math.max(0, Math.min(Math.round(y), max));
  }

  function scrollToY(targetY, onArrive) {
    targetY = limit(targetY);

    var startY = window.scrollY;
    var distance = targetY - startY;

    if (!distance || window.MF.prefersReducedMotion()) {
      window.scrollTo(0, targetY);
      if (onArrive) onArrive();
      return;
    }

    // Long trips are capped so crossing the pinned hero stays brisk.
    var duration = Math.min(1500, Math.max(450, Math.abs(distance) * 0.35));
    var startTime = null;
    var token = {};
    running = token;

    function step(now) {
      if (running !== token) return;     // superseded, or the user took over

      if (startTime === null) startTime = now;

      var progress = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, Math.round(startY + distance * easeInOutCubic(progress)));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        running = null;
        if (onArrive) onArrive();
      }
    }

    window.requestAnimationFrame(step);
  }

  // Any deliberate scroll from the user wins immediately.
  ["wheel", "touchstart"].forEach(function (type) {
    window.addEventListener(type, function () { running = null; }, { passive: true });
  });

  function positionOf(target) {
    // A pinned section is position: fixed while active, so its own rect says
    // nothing useful about where it sits in the document. Its pin-spacer does.
    var box = target.closest(".pin-spacer") || target;
    var offset = mainBar ? mainBar.offsetHeight : 0;
    return box.getBoundingClientRect().top + window.scrollY - offset;
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (!link) return;

    // Skip links should land instantly; that is the point of them.
    if (link.classList.contains("skip-link")) return;

    var hash = link.getAttribute("href");
    if (!hash || hash.length < 2) return;

    var target = document.getElementById(hash.slice(1));
    if (!target) return;

    event.preventDefault();

    scrollToY(positionOf(target), function () {
      history.replaceState(null, "", hash);

      // Move focus so keyboard and screen reader users follow the page.
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    });
  });

  // Shared so other components scroll the same way.
  window.MF.scrollToY = scrollToY;
})();
