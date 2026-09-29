/* ========================================================================
   SERVICES-DETAILS.JS — Service detail pages only.

   FAQ ACCORDION
   The markup is native <details>, so open/closed state, keyboard operation
   and screen-reader announcement all come from the browser and keep working
   with this file absent. What the browser will not do is animate the change:
   it snaps the content in and out.

   So the click is intercepted and the attribute is moved by hand, timed
   around a CSS transition on a grid row (see services-details.css):

     opening   set [open] so the content exists, hold the row at 0fr for one
               committed frame, then release it and let it grow.
     closing   collapse the row first, and only remove [open] once the
               transition has finished - remove it any earlier and the
               content vanishes instantly, which is the snap we came to fix.
   ======================================================================== */

(function () {
  "use strict";

  var items = document.querySelectorAll(".faq__item");
  if (!items.length) return;

  // Longer than the 320ms transition. A transition that never reports back -
  // the tab is backgrounded mid-animation, say - would otherwise leave the
  // panel stuck in its animating state forever.
  var FALLBACK = 600;

  items.forEach(function (item) {
    var summary = item.querySelector("summary");
    var body = item.querySelector(".faq__body");
    if (!summary || !body) return;

    // The teardown for whichever close is in flight, so a second click can
    // drop it before starting its own. One panel, one pending close.
    var cancelPending = null;

    /* Runs `done` when the row has finished collapsing, whichever of the
       transition or the fallback timer gets there first. */
    function whenCollapsed(done) {
      var timer = window.setTimeout(finish, FALLBACK);

      function finish() {
        cancelPending();
        done();
      }

      function onEnd(event) {
        // Only the row's own transition counts; anything bubbling up from
        // the content would finish the sequence early.
        if (event.target !== body) return;
        if (event.propertyName !== "grid-template-rows") return;
        finish();
      }

      cancelPending = function () {
        window.clearTimeout(timer);
        body.removeEventListener("transitionend", onEnd);
        cancelPending = null;
      };

      body.addEventListener("transitionend", onEnd);
    }

    summary.addEventListener("click", function (event) {
      // Reduced motion: leave it to the browser, which toggles instantly.
      if (window.MF.prefersReducedMotion()) return;

      event.preventDefault();

      // A click landing mid-animation restarts the sequence rather than
      // stacking a second one on top of it.
      if (cancelPending) cancelPending();
      item.classList.remove("is-opening", "is-closing");

      if (item.open) {
        item.classList.add("is-closing");

        whenCollapsed(function () {
          item.classList.remove("is-closing");
          item.open = false;
        });
      } else {
        item.open = true;
        item.classList.add("is-opening");

        // Reading a layout property forces the 0fr start frame to be
        // committed. Without it the browser only ever sees the end state and
        // there is nothing to transition from.
        void body.offsetHeight;

        item.classList.remove("is-opening");
      }
    });
  });
})();
