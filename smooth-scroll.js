/**
 * Xenon Hub — Lenis-style Smooth Scroll Engine
 * Intercepts native scroll and applies an easing function for
 * that buttery, weighted feel seen on premium sites.
 *
 * Covers:
 *  1. CSS scroll-behavior: smooth  (already in style.css)
 *  2. Lenis-style lerped scroll    (this file)
 *  3. Hardware acceleration hints  (will-change, passive listeners)
 *  4. Anchor smooth-scroll override
 */

(function () {
  "use strict";

  /* ── Config ──────────────────────────────────────── */
  const LERP        = 0.08;   // lower = smoother / heavier
  const WHEEL_MULT  = 1.0;    // wheel sensitivity multiplier
  const TOUCH_MULT  = 2.0;    // touch swipe multiplier
  const DURATION    = 1.2;    // seconds for anchor scrollTo easing
  const EASING      = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)); // expo out

  /* ── State ───────────────────────────────────────── */
  let targetY   = window.scrollY;
  let currentY  = window.scrollY;
  let isRunning = false;
  let rafId     = null;

  // Touch tracking
  let touchStartY = 0;
  let touchPrevY  = 0;

  /* ── Detect reduced-motion preference ── */
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Skip on mobile / reduced motion ─── */
  const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
  if (prefersReduced || isMobile) return; // fall back to native scroll

  /* ── Prevent native smooth-scroll so we handle it ── */
  document.documentElement.style.scrollBehavior = "auto";

  /* ── Clamp helper ─────────────────────── */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function maxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }

  /* ── Wheel handler (passive: false so we can preventDefault) ── */
  function onWheel(e) {
    e.preventDefault();

    const delta = e.deltaMode === 1
      ? e.deltaY * 36    // LINE mode
      : e.deltaY;        // PIXEL mode

    targetY = clamp(targetY + delta * WHEEL_MULT, 0, maxScroll());
    startLoop();
  }

  /* ── Touch handlers ──────────────────── */
  function onTouchStart(e) {
    touchStartY = e.touches[0].clientY;
    touchPrevY  = touchStartY;
  }

  function onTouchMove(e) {
    const y     = e.touches[0].clientY;
    const delta = (touchPrevY - y) * TOUCH_MULT;
    touchPrevY  = y;

    targetY = clamp(targetY + delta, 0, maxScroll());
    startLoop();
  }

  /* ── Keyboard scroll ─────────────────── */
  function onKeyDown(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    let delta = 0;
    switch (e.key) {
      case "ArrowDown": delta =  60;  break;
      case "ArrowUp":   delta = -60;  break;
      case "PageDown":  delta =  window.innerHeight * 0.85; break;
      case "PageUp":    delta = -window.innerHeight * 0.85; break;
      case "Home":      targetY = 0; startLoop(); return;
      case "End":       targetY = maxScroll(); startLoop(); return;
      case " ":
        if (tag === "button" || tag === "a") return;
        delta = e.shiftKey
          ? -window.innerHeight * 0.85
          :  window.innerHeight * 0.85;
        break;
      default: return;
    }

    e.preventDefault();
    targetY = clamp(targetY + delta, 0, maxScroll());
    startLoop();
  }

  /* ── Animation loop (lerp toward target) ── */
  function tick() {
    currentY += (targetY - currentY) * LERP;

    // Snap when close enough
    if (Math.abs(targetY - currentY) < 0.5) {
      currentY = targetY;
      window.scrollTo(0, currentY);
      isRunning = false;
      return;
    }

    window.scrollTo(0, currentY);
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (!isRunning) {
      isRunning = true;
      rafId = requestAnimationFrame(tick);
    }
  }

  /* ── Sync when the user scrolls natively (e.g. scrollbar drag) ── */
  let scrollTimer = null;
  window.addEventListener("scroll", () => {
    if (!isRunning) {
      currentY = window.scrollY;
      targetY  = window.scrollY;
    }
  }, { passive: true });

  /* ── Anchor smooth-scroll override ──── */
  function smoothScrollTo(target, duration) {
    const start    = currentY;
    const end      = clamp(
      target - 80, // offset for fixed nav height
      0,
      maxScroll()
    );
    const distance = end - start;
    const startT   = performance.now();

    function step(now) {
      const elapsed = (now - startT) / (duration * 1000);
      const progress = Math.min(elapsed, 1);
      const eased    = EASING(progress);

      targetY  = start + distance * eased;
      currentY = targetY;
      window.scrollTo(0, currentY);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const el = document.querySelector(href);
      if (!el) return;

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      smoothScrollTo(rect.top + window.scrollY, DURATION);

      // Update URL hash without jump
      history.pushState(null, "", href);
    });
  });

  /* ── Bind events ─────────────────────── */
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("keydown", onKeyDown);

  /* ── Resize re-clamp ─────────────────── */
  window.addEventListener("resize", () => {
    targetY  = clamp(targetY, 0, maxScroll());
    currentY = clamp(currentY, 0, maxScroll());
  }, { passive: true });

  /* ── Handle hash on load ─────────────── */
  if (window.location.hash) {
    const el = document.querySelector(window.location.hash);
    if (el) {
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        targetY  = clamp(rect.top + window.scrollY - 80, 0, maxScroll());
        currentY = targetY;
        window.scrollTo(0, currentY);
      });
    }
  }

})();
