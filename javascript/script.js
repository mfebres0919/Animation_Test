/* ========================================================================
   SCRIPT.JS — Homepage only.

   Hero: the section pins while the page scrolls, and scroll position drives
   video.currentTime instead of normal playback. Staged copy cross-fades at
   fixed points along that same scroll.
   ======================================================================== */

(function () {
  "use strict";

  if (!window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------------ CONFIG -- */

  var CONFIG = {
    // Length of the pinned scroll, in viewport heights. Higher = slower.
    scrollLengthDesktop: 5,
    scrollLengthMobile: 4,

    // ScrollTrigger catch-up lag in seconds. 0 is twitchy; 0.6-1.2 feels
    // deliberate. This is the main "feel" dial.
    scrub: 0.8,

    // Ignore seek requests smaller than one frame.
    seekEpsilon: 1 / 60,

    // Give up waiting on a seek that never reports back, in milliseconds.
    seekTimeout: 400,

    // Copy stages as a fraction of total scroll progress (0 = top of hero,
    // 1 = fully renovated). `out: null` means the stage holds to the end.
    stages: [
      { in: 0.00, out: 0.26 },
      { in: 0.36, out: 0.58 },
      { in: 0.68, out: null }
    ],

    // Cross-fade length, in the same 0-1 progress units.
    fade: 0.07,

    // Vertical travel on each fade, in pixels.
    fadeShift: 36
  };

  /* --------------------------------------------------------------- DOM -- */

  var hero = document.getElementById("hero");
  var video = document.getElementById("renovationVideo");
  var quotes = document.querySelectorAll(".hero__quote");
  var actions = document.getElementById("heroActions");
  var cue = document.getElementById("heroCue");
  var loader = document.getElementById("heroLoader");
  var loaderFill = document.getElementById("heroLoaderFill");

  if (!hero || !video) return;

  var isTouch = window.MF.isTouchDevice();
  var prefersReduced = window.MF.prefersReducedMotion();

  /* ------------------------------------------------------ VIDEO SOURCE -- */
  // Both cuts are encoded all-keyframe so any frame is an instant seek
  // target. Phones get the smaller 720p file. Chosen before loading starts.

  var source = (isTouch || window.innerWidth < 900)
    ? video.getAttribute("data-src-mobile")
    : video.getAttribute("data-src-desktop");

  if (source) {
    video.setAttribute("src", source);
    video.load();
  }

  /* ---------------------------------------------------- SEEK CONTROLLER -- */
  // Seeking is asynchronous. Requesting a new position while one is still
  // resolving causes visible stutter, so the newest target wins and at most
  // one seek is issued per animation frame.

  var targetTime = 0;
  var isSeeking = false;
  var canSeek = false;
  var seekStartedAt = 0;

  function applySeek() {
    if (!canSeek) return;

    if (isSeeking) {
      // Watchdog: a seek that never reports completion (an aborted request,
      // a stalled buffer) would otherwise hold this gate shut forever and
      // freeze the video on whatever frame it reached.
      if (performance.now() - seekStartedAt < CONFIG.seekTimeout) return;
      isSeeking = false;
    }

    var time = Math.min(Math.max(targetTime, 0), video.duration);
    if (Math.abs(video.currentTime - time) < CONFIG.seekEpsilon) return;

    isSeeking = true;
    seekStartedAt = performance.now();

    try {
      video.currentTime = time;
    } catch (err) {
      isSeeking = false;
    }
  }

  function releaseSeek() { isSeeking = false; }

  video.addEventListener("seeked", releaseSeek);
  video.addEventListener("error", releaseSeek);
  gsap.ticker.add(applySeek);

  /* -------------------------------------------------- MOBILE PRELOADING -- */
  // Mobile Safari ignores preload="auto" until a video has been activated by
  // play(). Muted + playsinline lets that happen silently; we pause on frame
  // one so nothing actually plays on its own.

  function primeVideo() {
    var attempt = video.play();

    if (attempt && typeof attempt.then === "function") {
      attempt.then(function () {
        video.pause();
        video.currentTime = 0;
      }).catch(function () {
        // Autoplay blocked; the first user gesture below handles it.
      });
    } else {
      video.pause();
    }
  }

  function primeOnGesture() {
    primeVideo();
    window.removeEventListener("touchstart", primeOnGesture);
    window.removeEventListener("click", primeOnGesture);
  }

  window.addEventListener("touchstart", primeOnGesture, { passive: true, once: true });
  window.addEventListener("click", primeOnGesture, { once: true });

  /* ----------------------------------------------------- LOAD PROGRESS -- */

  function updateProgress() {
    if (!loaderFill || !video.duration) return;

    var buffered = video.buffered.length
      ? video.buffered.end(video.buffered.length - 1)
      : 0;

    loaderFill.style.setProperty(
      "--progress",
      Math.min(1, buffered / video.duration).toFixed(3)
    );
  }

  function hideLoader() {
    if (loader) loader.classList.add("is-hidden");
  }

  // Cross-fade the video over the still once there is decoded data.
  video.addEventListener("loadeddata", function () {
    video.classList.add("is-ready");
  });

  video.addEventListener("progress", updateProgress);
  video.addEventListener("canplaythrough", function () {
    if (loaderFill) loaderFill.style.setProperty("--progress", "1");
    hideLoader();
  });

  // Safety net only. The still is visible throughout, so nothing is blocked
  // while this runs; the bar just stops reporting.
  setTimeout(hideLoader, 15000);

  /* ------------------------------------------------------- BUILD SCENE -- */

  var built = false;

  function build() {
    if (built) return;
    if (!isFinite(video.duration) || video.duration <= 0) return;

    built = true;
    canSeek = true;
    video.pause();
    video.currentTime = 0;

    // Reduced motion: no pin, no scrub. Show the finished kitchen and the
    // first line of copy, which CSS already leaves visible.
    if (prefersReduced) {
      targetTime = Math.max(0, video.duration - 0.05);
      hideLoader();
      return;
    }

    var playhead = { time: 0 };
    var scrollLength = isTouch ? CONFIG.scrollLengthMobile : CONFIG.scrollLengthDesktop;

    var tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: function () { return "+=" + window.innerHeight * scrollLength; },
        pin: true,
        pinSpacing: true,
        scrub: CONFIG.scrub

        // Deliberately NOT set here:
        //
        // invalidateOnRefresh - it makes the playhead tween re-record its
        // START value from wherever the object currently sits. A refresh
        // mid-scroll (resize, orientation change, window load) would rewrite
        // the tween as "current time -> duration", so scrolling back to the
        // top would only rewind as far as that point instead of frame zero.
        // The end distance below is a function, so it is re-evaluated on
        // every refresh anyway; nothing here depends on viewport size.
        //
        // fastScrollEnd - it snaps the trigger to its end state past a
        // velocity threshold, which skips frames and is wrong for a scrub.
        //
        // anticipatePin - it engages the pin slightly before the scroll
        // reaches it, which can expose the pin-spacer for a frame on a fast
        // flick. Only worth adding back if pinning visibly lags.
      }
    });

    // Scroll distance maps onto the full video, start to finish.
    tl.to(playhead, {
      time: function () { return video.duration; },
      duration: 1,
      onUpdate: function () { targetTime = playhead.time; }
    }, 0);

    // The scroll cue is only useful before anything has happened.
    if (cue) {
      tl.to(cue, { opacity: 0, duration: 0.04 }, 0);
    }

    // Staged copy. The CTA pair fades on the same beats as the quotes so the
    // heading and buttons read as one block, without duplicating controls in
    // the DOM for screen readers and keyboard users.
    CONFIG.stages.forEach(function (stage, index) {
      var quote = quotes[index];
      if (!quote) return;

      if (stage.in > 0) {
        // immediateRender must stay off: GSAP otherwise applies each
        // fromTo's "from" state at build time, which would hide the CTAs
        // at the very top of the hero.
        tl.fromTo(
          [quote, actions],
          { opacity: 0, y: CONFIG.fadeShift },
          {
            opacity: 1,
            y: 0,
            duration: CONFIG.fade,
            ease: "power2.out",
            immediateRender: false
          },
          stage.in
        );
      }

      if (stage.out !== null) {
        tl.to(
          [quote, actions],
          { opacity: 0, y: -CONFIG.fadeShift, duration: CONFIG.fade, ease: "power2.in" },
          stage.out
        );
      }
    });

    hideLoader();
    ScrollTrigger.refresh();
  }

  if (video.readyState >= 1) {
    build();
  } else {
    video.addEventListener("loadedmetadata", build);
  }

  // Some browsers report metadata oddly on a warm cache.
  window.addEventListener("load", build);

  /* ---------------------------------------------------------- RESIZING -- */
  // Only a real width change justifies a refresh. Height-only changes are
  // usually the mobile address bar collapsing, and refreshing on those makes
  // the pin jump mid-scroll.

  var lastWidth = window.innerWidth;
  var resizeTimer;

  window.addEventListener("resize", function () {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 180);
  });

  window.addEventListener("orientationchange", function () {
    setTimeout(function () { ScrollTrigger.refresh(); }, 350);
  });

  /* -------------------------------------------------- SCROLL RESTORATION -- */
  // A restored mid-hero scroll position would show frame zero over an
  // already-scrolled page.

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
})();

/* ========================================================================
   SERVICES — hovering or focusing a row cross-fades the matching image.
   ======================================================================== */

(function () {
  "use strict";

  var section = document.getElementById("services");
  if (!section) return;

  var items = section.querySelectorAll(".services__item");
  var images = section.querySelectorAll(".services__image");
  if (!items.length || !images.length) return;

  var current = null;

  function activate(key) {
    if (!key || key === current) return;
    current = key;

    items.forEach(function (item) {
      var isActive = item.getAttribute("data-service") === key;
      item.classList.toggle("is-active", isActive);
      // aria-pressed and the class are set together so the accessible state
      // never drifts from the visible one.
      item.setAttribute("aria-pressed", String(isActive));
    });

    images.forEach(function (image) {
      var isActive = image.getAttribute("data-service") === key;
      image.classList.toggle("is-active", isActive);
      // Only the visible image stays in the accessibility tree, so a screen
      // reader is not read all three alt texts at once.
      if (isActive) image.removeAttribute("aria-hidden");
      else image.setAttribute("aria-hidden", "true");
    });
  }

  items.forEach(function (item) {
    var key = item.getAttribute("data-service");

    // Pointer and keyboard reach the same behaviour: hovering and focusing
    // both preview, so a keyboard user is never shown the wrong image.
    item.addEventListener("mouseenter", function () { activate(key); });
    item.addEventListener("focus", function () { activate(key); });
    item.addEventListener("click", function () { activate(key); });
  });

  // The Services dropdown in the nav links to #kitchen / #bathroom / #patio,
  // which are the list items here. Honour that on arrival and on later hash
  // changes so the right service is showing when the user lands.
  function activateFromHash() {
    var key = window.location.hash.replace("#", "");
    if (section.querySelector('[data-service="' + key + '"]')) activate(key);
  }

  window.addEventListener("hashchange", activateFromHash);
  activateFromHash();

  current = current || items[0].getAttribute("data-service");
})();
