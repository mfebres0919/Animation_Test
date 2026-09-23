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
