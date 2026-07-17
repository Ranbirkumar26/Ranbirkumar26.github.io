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
            var isActive = link.getAttribute("href") === "#" + entry.target.id;
            link.classList.toggle("active", isActive);
            if (isActive) link.setAttribute("aria-current", "true");
            else link.removeAttribute("aria-current");
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
      // leave no stale #section hash after returning to the top
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
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

  /* ----- Rover-cam reticle cursor (fine pointers only) ----- */
  var ring = document.getElementById("cursorRing");
  if (ring && !reducedMotion && window.matchMedia("(pointer: fine)").matches) {
    var coords = document.getElementById("retCoords");
    var rx = -100, ry = -100, tx = -100, ty = -100, ringOn = false, frame = 0;
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
      // text updates are cheap but pointless at 60fps; every 3rd frame reads fine
      if (coords && frame++ % 3 === 0) {
        coords.textContent = "x:" + Math.round(rx) + "\ny:" + Math.round(ry);
      }
      requestAnimationFrame(follow);
    })();
    document.querySelectorAll("a, button, .card, .shot, .placeholder, .motion-panel").forEach(function (el) {
      el.addEventListener("mouseenter", function () { ring.classList.add("hovering"); });
      el.addEventListener("mouseleave", function () { ring.classList.remove("hovering"); });
    });
  }

  /* ----- Mission clock: time since joining the robotics team ----- */
  var missionClock = document.getElementById("missionClock");
  if (missionClock) {
    var MISSION_START = new Date("2024-03-01T00:00:00+05:30").getTime();
    var tickMission = function () {
      if (document.hidden) return;
      var s = Math.max(0, Math.floor((Date.now() - MISSION_START) / 1000));
      var d = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      missionClock.textContent = d + "d " + h + "h " + m + "m " + (sec < 10 ? "0" : "") + sec + "s";
    };
    tickMission();
    setInterval(tickMission, 1000);
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
    document.querySelectorAll(".project-media .shot, .project-media .placeholder, .project-media .field-ai-diagram").forEach(function (el) {
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

  /* ----- Project scenes: boot-on-view, hover intensity and tiny parallax ----- */
  var scenePanels = document.querySelectorAll("[data-scene-panel]");
  if (scenePanels.length) {
    if (!reducedMotion && window.matchMedia("(pointer: fine)").matches) {
      scenePanels.forEach(function (panel) {
        panel.classList.add("scene-ready");
        panel.addEventListener("mouseenter", function () {
          panel.classList.add("scene-active");
        });
        panel.addEventListener("mouseleave", function () {
          panel.classList.remove("scene-active");
          panel.style.setProperty("--scene-dx", "0px");
          panel.style.setProperty("--scene-dy", "0px");
        });
        panel.addEventListener("mousemove", function (e) {
          var r = panel.getBoundingClientRect();
          var dx = ((e.clientX - r.left) / r.width - 0.5) * 12;
          var dy = ((e.clientY - r.top) / r.height - 0.5) * 10;
          panel.style.setProperty("--scene-dx", dx.toFixed(1) + "px");
          panel.style.setProperty("--scene-dy", dy.toFixed(1) + "px");
        });
      });

      if ("IntersectionObserver" in window) {
        var sceneIO = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("scene-booted");
              sceneIO.unobserve(entry.target);
            });
          },
          { threshold: 0.28, rootMargin: "0px 0px -70px 0px" }
        );
        scenePanels.forEach(function (panel) { sceneIO.observe(panel); });
      } else {
        scenePanels.forEach(function (panel) { panel.classList.add("scene-booted"); });
      }

      document.addEventListener("visibilitychange", function () {
        document.documentElement.classList.toggle("scene-paused", document.hidden);
      });
      document.documentElement.classList.toggle("scene-paused", document.hidden);
    } else {
      scenePanels.forEach(function (panel) { panel.classList.add("scene-static"); });
    }
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

  /* ----- Demo pre-warm: SemantiCache (Streamlit + Render API) and
     CraveConnect (Render) all sleep on free tiers. Pinging a project's
     stack when its card scrolls into view (and again on hover/click) means
     the services spin up while the visitor is still reading, so "Live demo"
     lands on a working app instead of a cold start. ----- */
  [
    {
      cardId: "semanticache",
      urls: [
        "https://trademarkia-api-trh5.onrender.com/docs",
        "https://trademarkia-j8favfyrs6vqqm9nifpdsm.streamlit.app/"
      ]
    },
    {
      cardId: "craveconnect",
      urls: ["https://craveconnect.onrender.com/"]
    }
  ].forEach(function (target) {
    var lastWarm = 0;
    var warm = function () {
      // re-ping if the visitor lingers; Render idles out after ~15 min
      if (Date.now() - lastWarm < 4 * 60 * 1000) return;
      lastWarm = Date.now();
      target.urls.forEach(function (url) {
        try {
          fetch(url, { mode: "no-cors", cache: "no-store" }).catch(function () {});
        } catch (e) {}
      });
    };
    var card = document.getElementById(target.cardId);
    if (!card) return;
    if ("IntersectionObserver" in window) {
      var warmIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              warm();
              warmIO.disconnect();
            }
          });
        },
        { rootMargin: "200px 0px" }
      );
      warmIO.observe(card);
    }
    card.querySelectorAll(".project-links .btn").forEach(function (el) {
      el.addEventListener("click", warm);
      el.addEventListener("mouseenter", warm);
    });
  });

  /* ----- Demo health badges: status.json is refreshed by a scheduled
     GitHub Action that curls each demo. Badges only downgrade (Live ->
     Demo offline); they never upgrade a hand-set offline badge, so a
     stale JSON can't oversell anything. ----- */
  fetch("status.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (status) {
      if (!status) return;
      document.querySelectorAll("[data-health]").forEach(function (badge) {
        var state = status[badge.getAttribute("data-health")];
        if (!state) return;
        if (state.up === false && badge.classList.contains("badge-live")) {
          badge.classList.add("health-down");
          badge.textContent = "Demo offline";
        }
        if (status.checked) {
          badge.title = "Demo health last checked " + status.checked.slice(0, 16).replace("T", " ") + " UTC";
        }
      });

      // live systems board in the projects head
      var board = document.getElementById("systemsBoard");
      if (board) {
        var systems = [
          ["iORA DocQA", "docqa"],
          ["SemantiCache", "semanticache"],
          ["CraveConnect", "craveconnect"]
        ];
        systems.forEach(function (sys) {
          var state = status[sys[1]];
          if (!state) return;
          var el = document.createElement("span");
          el.className = "sys " + (state.up ? "sys-up" : "sys-down");
          el.innerHTML = '<span class="sys-dot"></span>' + sys[0] + ": " + (state.label || (state.up ? "online" : "offline"));
          board.appendChild(el);
        });
        if (status.checked) {
          var when = document.createElement("span");
          when.className = "sys-checked";
          when.textContent = "checked " + status.checked.slice(0, 16).replace("T", " ") + " UTC";
          board.appendChild(when);
        }
        board.hidden = board.children.length === 0;
      }
    })
    .catch(function () {});

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
