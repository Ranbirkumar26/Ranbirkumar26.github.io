/*
 * Interaction layer: scroll reveals, nav state, hero rotator, mobile menu.
 * Deliberately dependency-free; medium-motion per design brief, and all
 * motion defers to prefers-reduced-motion via the CSS side.
 */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NAV_OFFSET = 78;

  /* ----- Smooth scroll (JS-driven; CSS scroll-behavior unreliable in some
     Chromium builds, silently no-opping anchor jumps) ----- */
  function animateScrollTo(targetY) {
    if (reducedMotion) {
      window.scrollTo(0, targetY);
      return;
    }
    var startY = window.scrollY;
    var delta = targetY - startY;
    if (Math.abs(delta) < 2) return;
    var duration = Math.min(700, 350 + Math.abs(delta) * 0.06);
    var start = null;
    var ticked = false;
    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    function step(ts) {
      ticked = true;
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      window.scrollTo(0, startY + delta * ease(p));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // Watchdog: some embedded/automation contexts freeze rAF entirely;
    // land instantly rather than not at all.
    setTimeout(function () {
      if (!ticked) window.scrollTo(0, targetY);
    }, 120);
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    var id = link.getAttribute("href").slice(1);
    if (!id) {
      e.preventDefault();
      animateScrollTo(0);
      return;
    }
    var target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    animateScrollTo(target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
    if (history.pushState) history.pushState(null, "", "#" + id);
  });

  /* Landing on a hash URL: jump manually (native jump is unreliable when the
     frame clock is throttled). Second pass corrects for font-load reflow. */
  if (location.hash) {
    var initialTarget = document.getElementById(location.hash.slice(1));
    if (initialTarget) {
      var jumpToInitial = function () {
        window.scrollTo(0, initialTarget.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
      };
      jumpToInitial();
      setTimeout(jumpToInitial, 300);
    }
  }

  /* ----- Scroll reveal ----- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ----- Nav scrolled state ----- */
  var nav = document.querySelector(".nav");
  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 12);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ----- Active nav link ----- */
  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav-links a");
  if ("IntersectionObserver" in window) {
    var sectionIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            link.classList.toggle(
              "active",
              link.getAttribute("href") === "#" + entry.target.id
            );
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (s) { sectionIO.observe(s); });
  }

  /* ----- Hero rotator ----- */
  var rotator = document.getElementById("heroRotator");
  if (rotator && !reducedMotion) {
    var phrases = [
      "RAG pipelines,",
      "semantic retrieval,",
      "real-time vision,",
      "edge AI on Jetson,",
      "autonomous rovers,"
    ];
    var idx = 0;
    setInterval(function () {
      // Backgrounded tabs throttle timers; skipping there keeps the swap's
      // hide/show pair adjacent so the text is never left stuck invisible.
      if (document.hidden) return;
      rotator.classList.add("swap");
      setTimeout(function () {
        idx = (idx + 1) % phrases.length;
        rotator.textContent = phrases[idx];
        rotator.classList.remove("swap");
      }, 300);
    }, 2600);
  }

  /* ----- Scroll progress + back-to-top ----- */
  var progress = document.getElementById("scrollProgress");
  var toTop = document.getElementById("toTop");
  function onScrollProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    if (progress) {
      progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
    if (toTop) {
      toTop.classList.toggle("show", window.scrollY > 600);
    }
  }
  window.addEventListener("scroll", onScrollProgress, { passive: true });
  onScrollProgress();
  if (toTop) {
    toTop.addEventListener("click", function () {
      animateScrollTo(0);
    });
  }

  /* ----- Mobile menu ----- */
  var burger = document.getElementById("navBurger");
  var links = document.getElementById("navLinks");
  if (burger && links) {
    burger.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }
})();
