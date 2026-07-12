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

  /* ----- Scroll reveal (batch-staggered: items revealed in the same
     observer tick cascade instead of appearing at once) ----- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        var batch = 0;
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.style.setProperty("--stagger", Math.min(batch, 5) * 90 + "ms");
            entry.target.classList.add("in");
            io.unobserve(entry.target);
            batch++;
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

  /* ----- Theme toggle ----- */
  var themeToggle = document.getElementById("themeToggle");
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyThemeMeta() {
    if (themeMeta) {
      themeMeta.setAttribute(
        "content",
        document.documentElement.getAttribute("data-theme") === "light" ? "#f3f5fa" : "#0a0f1b"
      );
    }
  }
  applyThemeMeta();
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next =
        document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      applyThemeMeta();
    });
  }

  /* ----- Cursor follower ring (fine pointers only) ----- */
  var ring = document.getElementById("cursorRing");
  if (ring && !reducedMotion && window.matchMedia("(pointer: fine)").matches) {
    var rx = -100, ry = -100, tx = -100, ty = -100, ringOn = false;
    document.addEventListener("mousemove", function (e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!ringOn) {
        ringOn = true;
        rx = tx; ry = ty;
        ring.classList.add("on");
      }
    });
    document.addEventListener("mouseleave", function () {
      ringOn = false;
      ring.classList.remove("on");
    });
    (function follow() {
      rx += (tx - rx) * 0.16;
      ry += (ty - ry) * 0.16;
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(follow);
    })();
    document.querySelectorAll("a, button, .card, .shot, .placeholder").forEach(function (el) {
      el.addEventListener("mouseenter", function () { ring.classList.add("hovering"); });
      el.addEventListener("mouseleave", function () { ring.classList.remove("hovering"); });
    });
  }

  /* ----- Pointer-tracked glow + tilt on media panels ----- */
  if (!reducedMotion && window.matchMedia("(pointer: fine)").matches) {
    document.querySelectorAll(".card, .shot, .placeholder").forEach(function (el) {
      el.classList.add("glow-track");
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });
    document.querySelectorAll(".project-media .shot, .project-media .placeholder").forEach(function (el) {
      el.classList.add("tilt");
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          "perspective(800px) rotateY(" + px * 7 + "deg) rotateX(" + -py * 7 + "deg) translateY(-4px)";
      });
      el.addEventListener("mouseleave", function () {
        el.style.transform = "";
      });
    });
  }

  /* ----- Experience timeline draws with scroll ----- */
  var timeline = document.querySelector(".timeline");
  if (timeline && !reducedMotion) {
    var onTimelineScroll = function () {
      var r = timeline.getBoundingClientRect();
      var viewH = window.innerHeight;
      var progress = (viewH * 0.75 - r.top) / r.height;
      timeline.style.setProperty("--tl-progress", Math.max(0, Math.min(1, progress)).toFixed(3));
    };
    window.addEventListener("scroll", onTimelineScroll, { passive: true });
    onTimelineScroll();
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
