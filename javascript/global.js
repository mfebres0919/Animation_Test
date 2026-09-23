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

  var videos = document.querySelectorAll("[data-autoplay-inview]");
  if (!videos.length || !("IntersectionObserver" in window)) return;

  if (window.MF.prefersReducedMotion()) return;

  var wantsMobileSource = window.MF.isTouchDevice() || window.innerWidth < 900;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target;

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

  videos.forEach(function (video) { observer.observe(video); });
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
    // Deliberately an instant jump, not a smooth scroll. Smooth-scrolling
    // from the footer would travel back through the pinned hero and scrub
    // the whole renovation video in reverse on the way up - several seconds
    // of flicker instead of a return to the top.
    window.scrollTo(0, 0);
    // Focus follows the jump, so keyboard users do not land mid-document.
    var skip = document.querySelector(".skip-link");
    if (skip) skip.focus({ preventScroll: true });
  });

  sync();
})();

/* ========================================================================
   PLAY ON HOVER
   [data-play-on-hover] loads its video on first interaction and plays it
   only while hovered or focused, so a grid of clips costs nothing until
   someone actually looks at one.
   ======================================================================== */

(function () {
  "use strict";

  var cards = document.querySelectorAll("[data-play-on-hover]");
  if (!cards.length || window.MF.prefersReducedMotion()) return;

  var wantsMobileSource = window.MF.isTouchDevice() || window.innerWidth < 900;

  cards.forEach(function (card) {
    var video = card.querySelector("video");
    if (!video) return;

    function start() {
      if (!video.getAttribute("src")) {
        var source = wantsMobileSource
          ? video.getAttribute("data-src-mobile")
          : video.getAttribute("data-src-desktop");

        if (!source) return;
        video.setAttribute("src", source);
      }

      var attempt = video.play();
      if (attempt && typeof attempt.then === "function") {
        attempt.then(function () {
          video.classList.add("is-playing");
        }).catch(function () {
          // Blocked: the poster simply stays put.
        });
      } else {
        video.classList.add("is-playing");
      }
    }

    function stop() {
      video.pause();
      video.classList.remove("is-playing");
    }

    card.addEventListener("mouseenter", start);
    card.addEventListener("focus", start);
    card.addEventListener("mouseleave", stop);
    card.addEventListener("blur", stop);
  });
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
