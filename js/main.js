/* ========================================================================
   Kitchen Remodel — Scroll-controlled hero video
   GSAP + ScrollTrigger. The hero pins; scroll position maps 1:1 to the
   video's currentTime. Scroll down = renovation builds, scroll up = reverses.
   ======================================================================== */

(function () {
  "use strict";

  gsap.registerPlugin(ScrollTrigger);

  /* ----------------------------------------------------------- CONFIG --- */
  var CONFIG = {
    // How much scrolling the full video takes, in viewport heights.
    // Higher = slower, more deliberate. 5 = you scroll 5 screens to finish.
    scrollLengthDesktop: 5,
    scrollLengthMobile: 4,

    // ScrollTrigger scrub smoothing, in seconds of "catch up" lag.
    // 0 = locked to scroll (twitchy). 0.6–1.2 feels smooth and intentional.
    scrub: 0.8,

    // Don't re-seek for differences smaller than this (seconds).
    seekEpsilon: 1 / 60
  };

  /* ------------------------------------------------------------- DOM ---- */
  var hero = document.getElementById("hero");
  var video = document.getElementById("renovationVideo");
  var loader = document.getElementById("heroLoader");
  var loaderFill = document.getElementById("heroLoaderFill");
  var cue = document.getElementById("scrollCue");
  var content = document.querySelector(".hero__content");

  if (!hero || !video) return;

  var isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------- PICK VIDEO SOURCE -- */
  // Both files are encoded all-keyframe so any frame is an instant seek
  // target; phones just get the smaller 720p cut. Set before load begins.
  var useMobileSource = isTouch || window.innerWidth < 900;
  var src = useMobileSource
    ? video.getAttribute("data-src-mobile")
    : video.getAttribute("data-src-desktop");

  if (src && video.getAttribute("src") !== src) {
    video.setAttribute("src", src);
    video.load();
  }

  /* ------------------------------------------------- SEEK CONTROLLER ---- */
  // Seeking is async. Queuing a new seek while one is in flight makes the
  // video stutter, so we hold the latest target and apply it once free.
  var targetTime = 0;
  var isSeeking = false;
  var canSeek = false;

  function applySeek() {
    if (!canSeek || isSeeking) return;
    if (Math.abs(video.currentTime - targetTime) < CONFIG.seekEpsilon) return;

    isSeeking = true;
    try {
      video.currentTime = targetTime;
    } catch (e) {
      isSeeking = false;
    }
  }

  function seekDone() { isSeeking = false; }

  video.addEventListener("seeked", seekDone);
  video.addEventListener("error", seekDone);

  // One seek attempt per animation frame, never more.
  gsap.ticker.add(applySeek);

  /* ------------------------------------- iOS / MOBILE PRELOAD PRIMING --- */
  // Mobile Safari ignores preload="auto" until the video is "activated" by a
  // play() call. Muted + playsinline lets us do that silently, then pause on
  // frame one so nothing actually plays on its own.
  function primeVideo() {
    var p = video.play();
    if (p && typeof p.then === "function") {
      p.then(function () {
        video.pause();
        video.currentTime = 0;
      }).catch(function () {
        // Autoplay blocked — fall back to the first user gesture below.
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

  /* --------------------------------------------------- LOAD PROGRESS ---- */
  function updateLoaderProgress() {
    if (!loaderFill || !video.duration) return;
    var buffered = 0;
    if (video.buffered.length) {
      buffered = video.buffered.end(video.buffered.length - 1);
    }
    var pct = Math.min(100, (buffered / video.duration) * 100);
    loaderFill.style.width = pct.toFixed(1) + "%";
  }

  function hideLoader() {
    if (loader) loader.classList.add("is-hidden");
  }

  video.addEventListener("progress", updateLoaderProgress);
  video.addEventListener("canplaythrough", function () {
    if (loaderFill) loaderFill.style.width = "100%";
    hideLoader();
  });

  // Safety net: never let a slow connection trap the user behind the loader.
  setTimeout(hideLoader, 6000);

  /* ------------------------------------------------------ BUILD SCENE --- */
  var built = false;

  function build() {
    if (built) return;
    if (!isFinite(video.duration) || video.duration <= 0) return;
    built = true;

    canSeek = true;
    video.pause();
    video.currentTime = 0;

    // Reduced motion: no pinning, no scrubbing — just show the finished kitchen.
    if (prefersReduced) {
      targetTime = Math.max(0, video.duration - 0.05);
      hideLoader();
      return;
    }

    // Proxy object GSAP tweens; each update hands a new target to the seeker.
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
        anticipatePin: 1,
        scrub: CONFIG.scrub,
        invalidateOnRefresh: true,
        // Mobile browser chrome collapsing shouldn't re-trigger a refresh.
        fastScrollEnd: true
      }
    });

    // The whole scroll distance maps onto the whole video.
    tl.to(playhead, {
      time: function () { return video.duration; },
      onUpdate: function () { targetTime = playhead.time; }
    }, 0);

    // Subtle: copy lifts away early so the finished kitchen reads clean.
    if (content) {
      tl.to(content, { opacity: 0, y: -40, duration: 0.28, ease: "power1.in" }, 0.06);
    }
    if (cue) {
      tl.to(cue, { opacity: 0, duration: 0.1 }, 0);
    }

    hideLoader();
    ScrollTrigger.refresh();
  }

  if (video.readyState >= 1) {
    build();
  } else {
    video.addEventListener("loadedmetadata", build);
  }

  // Belt and braces — some browsers fire metadata oddly after a cache hit.
  window.addEventListener("load", build);

  /* ------------------------------------------------------- RESIZING ----- */
  // Only refresh on a real width change; mobile address-bar height changes
  // would otherwise cause the pin to jump mid-scroll.
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

  /* -------------------------------------------------- RESTORE ON LOAD --- */
  // Browsers restoring mid-hero scroll would show frame 0 over a scrolled page.
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
})();
