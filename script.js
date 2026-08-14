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
  var io = null;
  function revealElement(el, batch) {
    el.style.setProperty("--stagger", Math.min(batch, 5) * 90 + "ms");
    el.classList.add("in");
    if (io) io.unobserve(el);
  }
  function revealVisibleNow() {
    var batch = 0;
    revealEls.forEach(function (el) {
      if (el.classList.contains("in")) return;
      var rect = el.getBoundingClientRect();
      if (rect.bottom >= NAV_OFFSET && rect.top <= window.innerHeight - 40) {
        revealElement(el, batch);
        batch++;
      }
    });
  }
  if ("IntersectionObserver" in window && !reducedMotion) {
    io = new IntersectionObserver(
      function (entries) {
        var batch = 0;
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            revealElement(entry.target, batch);
            batch++;
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
    revealVisibleNow();
    requestAnimationFrame(revealVisibleNow);
    setTimeout(revealVisibleNow, 360);
    window.addEventListener("pageshow", revealVisibleNow);
    window.addEventListener("hashchange", function () { setTimeout(revealVisibleNow, 160); });
    window.addEventListener("popstate", function () { setTimeout(revealVisibleNow, 160); });
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
      var checkedAt = status.checked ? Date.parse(status.checked) : 0;
      var healthStale = !checkedAt || Date.now() - checkedAt > 2 * 60 * 60 * 1000;
      document.querySelectorAll("[data-health]").forEach(function (badge) {
        var state = status[badge.getAttribute("data-health")];
        if (!state) return;
        if (state.up === false && badge.classList.contains("badge-live")) {
          badge.classList.add("health-down");
          badge.textContent = "Demo offline";
        }
        if (healthStale && state.up !== false && badge.classList.contains("badge-live")) {
          badge.classList.add("health-stale");
          badge.textContent = "Status stale";
        }
        if (status.checked) {
          badge.title = "Demo health last checked " + status.checked.slice(0, 16).replace("T", " ") + " UTC" + (healthStale ? " (stale)" : "");
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
          var staleOnline = healthStale && state.up !== false;
          el.className = "sys " + (staleOnline ? "sys-stale" : (state.up ? "sys-up" : "sys-down"));
          el.innerHTML = '<span class="sys-dot"></span>' + sys[0] + ": " + (staleOnline ? "status stale" : (state.label || (state.up ? "online" : "offline")));
          board.appendChild(el);
        });
        if (status.checked) {
          var when = document.createElement("span");
          when.className = "sys-checked";
          when.textContent = (healthStale ? "stale " : "checked ") + status.checked.slice(0, 16).replace("T", " ") + " UTC";
          board.appendChild(when);
        }
        board.hidden = board.children.length === 0;
      }
    })
    .catch(function () {});

  /* ----- GitHub repo status: cards read public repository metadata directly
     from GitHub, with a short local cache to avoid noisy API traffic. ----- */
  var githubCards = Array.prototype.slice.call(document.querySelectorAll(".project, .mini")).map(function (card) {
    var link = card.querySelector('a[href*="github.com/"]');
    if (!link) return null;
    var match = link.href.match(/github\.com\/([^\/?#]+)\/([^\/?#]+)/i);
    if (!match) return null;
    var repo = match[1] + "/" + match[2].replace(/\.git$/i, "");
    var target = document.createElement("a");
    target.className = "github-meta github-meta-loading mono";
    target.href = link.href;
    target.target = "_blank";
    target.rel = "noopener";
    target.textContent = "GitHub - syncing...";
    var anchor = card.querySelector(".project-links") || card.querySelector(".mini-proof") || card.querySelector(".tag-row");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(target, anchor.nextSibling);
    return { card: card, link: link, repo: repo, target: target };
  }).filter(Boolean);

  if (githubCards.length) {
    var GITHUB_CACHE_KEY = "rk-github-status-v1";
    var GITHUB_CACHE_TTL = 30 * 60 * 1000;

    function uniqueRepos(cards) {
      return cards.reduce(function (list, item) {
        if (list.indexOf(item.repo) === -1) list.push(item.repo);
        return list;
      }, []);
    }

    function readGitHubCache() {
      try {
        var cached = JSON.parse(localStorage.getItem(GITHUB_CACHE_KEY) || "null");
        if (!cached || !cached.repos || Date.now() - cached.fetchedAt > GITHUB_CACHE_TTL) return null;
        if (!repoMapHasData(cached.repos)) return null;
        return cached;
      } catch (e) {
        return null;
      }
    }

    function writeGitHubCache(repos) {
      if (!repoMapHasData(repos)) return;
      try {
        localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), repos: repos }));
      } catch (e) {}
    }

    function repoMapHasData(repoMap) {
      return Object.keys(repoMap || {}).some(function (name) {
        return repoMap[name] && !repoMap[name].error;
      });
    }

    function daysSince(dateString) {
      var stamp = Date.parse(dateString || "");
      if (!stamp) return null;
      return Math.max(0, Math.floor((Date.now() - stamp) / 86400000));
    }

    function relativePush(dateString) {
      var days = daysSince(dateString);
      var date = new Date(dateString || "");
      if (days === null || isNaN(date.getTime())) return "push unknown";
      if (days === 0) return "pushed today";
      if (days < 60) return "pushed " + days + "d ago";
      return "pushed " + date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    function repoIsActive(repo) {
      var days = daysSince(repo && repo.pushed_at);
      return !!repo && !repo.archived && days !== null && days <= 180;
    }

    function renderGitHubStatus(repoMap, fetchedAt) {
      githubCards.forEach(function (item) {
        var repo = repoMap[item.repo];
        item.target.className = "github-meta mono";
        if (!repo || repo.error) {
          item.target.classList.add("github-meta-unavailable");
          item.target.textContent = "GitHub - status unavailable";
          item.target.title = "GitHub metadata could not be loaded for " + item.repo + ".";
          return;
        }
        var status = repo.archived ? "archived" : (repoIsActive(repo) ? "active" : "quiet");
        item.target.classList.add(repo.archived ? "github-meta-archived" : (status === "active" ? "github-meta-active" : "github-meta-quiet"));
        item.target.textContent = [
          "GitHub",
          status,
          relativePush(repo.pushed_at),
          repo.language || "",
          repo.stargazers_count ? repo.stargazers_count + " stars" : ""
        ].filter(Boolean).join(" - ");
        if (fetchedAt) {
          item.target.title = "GitHub status refreshed " + new Date(fetchedAt).toLocaleString();
        }
      });

      var board = document.getElementById("githubStatusBoard");
      if (!board) return;
      board.innerHTML = "";
      var repoNames = uniqueRepos(githubCards);
      var publicRepos = repoNames.filter(function (name) { return repoMap[name] && !repoMap[name].error; });
      var activeRepos = publicRepos.filter(function (name) { return repoIsActive(repoMap[name]); });
      var unavailable = repoNames.length - publicRepos.length;
      var main = document.createElement("span");
      main.className = "gh";
      main.innerHTML = '<span class="gh-dot"></span>GitHub: ' + activeRepos.length + "/" + publicRepos.length + " active public repos";
      board.appendChild(main);
      if (unavailable) {
        var miss = document.createElement("span");
        miss.className = "gh";
        miss.textContent = unavailable + " unavailable";
        board.appendChild(miss);
      }
      var checked = document.createElement("span");
      checked.className = "gh-checked";
      checked.textContent = "refreshed " + new Date(fetchedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      board.appendChild(checked);
      board.hidden = false;
    }

    function fetchGitHubRepo(repoName) {
      var parts = repoName.split("/");
      return fetch("https://api.github.com/repos/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]), {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("GitHub returned " + response.status);
          return response.json();
        })
        .then(function (repo) {
          return {
            full_name: repo.full_name,
            archived: !!repo.archived,
            pushed_at: repo.pushed_at,
            language: repo.language,
            stargazers_count: repo.stargazers_count || 0
          };
        })
        .catch(function () {
          return { error: true };
        });
    }

    var cachedGitHub = readGitHubCache();
    if (cachedGitHub) {
      renderGitHubStatus(cachedGitHub.repos, cachedGitHub.fetchedAt);
    } else {
      var reposToLoad = uniqueRepos(githubCards);
      Promise.all(reposToLoad.map(fetchGitHubRepo)).then(function (results) {
        var repoMap = {};
        reposToLoad.forEach(function (name, index) {
          repoMap[name] = results[index];
        });
        writeGitHubCache(repoMap);
        renderGitHubStatus(repoMap, Date.now());
      });
    }
  }

  function portfolioApiBase() {
    if (window.RK_API_BASE) return String(window.RK_API_BASE).replace(/\/$/, "");
    var meta = document.querySelector('meta[name="portfolio-api-base"]');
    return meta ? String(meta.getAttribute("content") || "").replace(/\/$/, "") : "";
  }

  function resolvePortfolioEndpoint(endpoint) {
    var cleanEndpoint = String(endpoint || "").trim();
    if (!cleanEndpoint) return "";
    if (/^https?:\/\//i.test(cleanEndpoint)) return cleanEndpoint;
    if (cleanEndpoint.charAt(0) === "/") return portfolioApiBase() + cleanEndpoint;
    return cleanEndpoint;
  }

  function portfolioApiError(body, fallback) {
    if (body && body.error && typeof body.error === "object" && body.error.message) return body.error.message;
    if (body && typeof body.error === "string") return body.error;
    if (body && body.message) return body.message;
    return fallback;
  }

  /* ----- Contact relay: post to the portfolio backend if configured;
     otherwise fall back to a prefilled email. ----- */
  var contactForm = document.getElementById("contactForm");
  if (contactForm) {
    var contactStatus = document.getElementById("contactStatus");
    var contactButton = contactForm.querySelector('button[type="submit"]');
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function cleanContactValue(value) {
      return String(value || "").trim();
    }

    function setContactStatus(message) {
      if (contactStatus) contactStatus.textContent = message || "";
    }

    function buildMailto(payload) {
      var to = cleanContactValue(contactForm.getAttribute("data-contact-email")) || "rk26.ftw@gmail.com";
      var subject = "Portfolio message from " + (payload.name || "website visitor");
      var body = [
        "Name: " + payload.name,
        "Email: " + payload.email,
        "",
        payload.message,
        "",
        "Source: " + payload.page
      ].join("\n");
      return "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    }

    function openEmailFallback(payload) {
      window.location.href = buildMailto(payload);
    }

    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var formData = new FormData(contactForm);
      if (cleanContactValue(formData.get("company"))) return;

      var payload = {
        name: cleanContactValue(formData.get("name")),
        email: cleanContactValue(formData.get("email")),
        message: cleanContactValue(formData.get("message")),
        source: "portfolio-contact",
        page: location.href,
        sentAt: new Date().toISOString()
      };

      if (!payload.name || !payload.email || !payload.message) {
        setContactStatus("Add your name, email and message.");
        if (contactForm.reportValidity) contactForm.reportValidity();
        return;
      }
      if (!emailPattern.test(payload.email)) {
        setContactStatus("Use a valid email so I can reply.");
        var emailField = contactForm.querySelector('[name="email"]');
        if (emailField && emailField.focus) emailField.focus();
        return;
      }

      var endpoint = resolvePortfolioEndpoint(contactForm.getAttribute("data-contact-endpoint"));
      if (!endpoint) {
        setContactStatus("Opening a prefilled email...");
        openEmailFallback(payload);
        return;
      }

      var headers = { "Content-Type": "application/json" };
      if (contactButton) contactButton.disabled = true;
      setContactStatus("Sending...");

      fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().catch(function () {
            return { ok: response.ok };
          }).then(function (body) {
            if (!response.ok || body.ok === false) throw new Error(portfolioApiError(body, "Contact endpoint returned " + response.status));
            return body;
          });
        })
        .then(function () {
          contactForm.reset();
          setContactStatus("Message sent. I will reply soon.");
        })
        .catch(function () {
          setContactStatus("Could not send here. Opening email instead...");
          openEmailFallback(payload);
        })
        .finally(function () {
          if (contactButton) contactButton.disabled = false;
        });
    });
  }

  /* ----- Portfolio AI assistant ----- */
  var chatbot = document.getElementById("chatbot");
  if (chatbot) {
    var chatLauncher = document.getElementById("chatLauncher");
    var chatPanel = document.getElementById("chatPanel");
    var chatClose = document.getElementById("chatClose");
    var chatClear = document.getElementById("chatClear");
    var chatForm = document.getElementById("chatForm");
    var chatInput = document.getElementById("chatInput");
    var chatMessages = document.getElementById("chatMessages");
    var chatSuggestions = document.getElementById("chatSuggestions");
    var chatStatus = document.getElementById("chatStatus");
    var chatNudge = document.getElementById("chatNudge");
    var chatNudgeClose = document.getElementById("chatNudgeClose");
    var chatNudgeTry = document.getElementById("chatNudgeTry");
    var chatTryBubble = document.getElementById("chatTryBubble");
    var chatMemory = {};
    var chatSending = false;
    var chatLastQuestion = "";
    var chatTypingEl = null;
    var chatKeys = {
      messages: "rk_chat_conversation",
      id: "rk_chat_conversation_id",
      intro: "rk_chat_intro_shown",
      prompt: "rk_chat_prompt_dismissed",
      last: "rk_chat_last_active"
    };
    var chatIntro =
      "Hey. I am Ranbir's portfolio assistant. Ask me about his skills, projects, experience, education, or which roles he could fit.";
    var chatFallback = "I am having trouble connecting to my AI service right now. Please try again in a moment.";
    var chatMaxMessages = 40;
    var chatTtl = 14 * 24 * 60 * 60 * 1000;

    function chatStoreGet(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return chatMemory[key] || null;
      }
    }

    function chatStoreSet(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        chatMemory[key] = value;
      }
    }

    function chatStoreRemove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        delete chatMemory[key];
      }
    }

    function chatId() {
      var existing = chatStoreGet(chatKeys.id);
      if (existing) return existing;
      var next = "rk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
      chatStoreSet(chatKeys.id, next);
      return next;
    }

    function loadChatMessages() {
      var last = Number(chatStoreGet(chatKeys.last) || 0);
      if (last && Date.now() - last > chatTtl) {
        chatStoreRemove(chatKeys.messages);
        chatStoreRemove(chatKeys.id);
        chatStoreRemove(chatKeys.intro);
        chatStoreRemove(chatKeys.last);
        return [];
      }

      try {
        var parsed = JSON.parse(chatStoreGet(chatKeys.messages) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter(function (item) {
            return item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string";
          })
          .slice(-chatMaxMessages);
      } catch (e) {
        return [];
      }
    }

    function saveChatMessages(messages) {
      chatStoreSet(chatKeys.messages, JSON.stringify(messages.slice(-chatMaxMessages)));
      chatStoreSet(chatKeys.last, String(Date.now()));
    }

    var chatState = {
      messages: loadChatMessages()
    };

    function setChatStatus(message) {
      if (chatStatus) chatStatus.textContent = message || "";
    }

    function addChatMessage(role, content, options) {
      chatState.messages.push({
        role: role,
        content: String(content || "").slice(0, 3000),
        error: Boolean(options && options.error),
        retry: Boolean(options && options.retry)
      });
      chatState.messages = chatState.messages.slice(-chatMaxMessages);
      saveChatMessages(chatState.messages);
      renderChatMessages();
    }

    function showIntroOnce() {
      if (chatStoreGet(chatKeys.intro) === "true") return;
      if (chatState.messages.length) {
        chatStoreSet(chatKeys.intro, "true");
        return;
      }
      addChatMessage("assistant", chatIntro);
      chatStoreSet(chatKeys.intro, "true");
    }

    function renderChatMessages() {
      if (!chatMessages) return;
      chatMessages.innerHTML = "";
      chatState.messages.forEach(function (message) {
        var row = document.createElement("div");
        row.className = "chat-msg chat-msg-" + message.role + (message.error ? " chat-msg-error" : "");
        row.textContent = message.content;
        if (message.retry) {
          var retry = document.createElement("button");
          retry.type = "button";
          retry.className = "chat-retry mono";
          retry.textContent = "Retry";
          retry.setAttribute("data-chat-retry", "true");
          row.appendChild(document.createElement("br"));
          row.appendChild(retry);
        }
        chatMessages.appendChild(row);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTyping() {
      if (!chatMessages || chatTypingEl) return;
      chatTypingEl = document.createElement("div");
      chatTypingEl.className = "chat-msg chat-msg-assistant chat-typing";
      chatTypingEl.innerHTML = "<span></span><span></span><span></span>";
      chatMessages.appendChild(chatTypingEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function hideTyping() {
      if (chatTypingEl && chatTypingEl.parentNode) chatTypingEl.parentNode.removeChild(chatTypingEl);
      chatTypingEl = null;
    }

    function chatHistoryForApi() {
      return chatState.messages
        .filter(function (message) {
          return !message.error && (message.role === "user" || message.role === "assistant");
        })
        .slice(-13, -1)
        .map(function (message) {
          return { role: message.role, content: message.content };
        });
    }

    function openChat(showBubble) {
      if (!chatPanel || !chatLauncher) return;
      chatPanel.hidden = false;
      chatLauncher.setAttribute("aria-expanded", "true");
      if (chatNudge) chatNudge.hidden = true;
      showIntroOnce();
      renderChatMessages();
      if (chatInput) setTimeout(function () { chatInput.focus(); }, 50);
      if (showBubble && chatTryBubble) {
        chatTryBubble.hidden = false;
        setTimeout(function () { chatTryBubble.hidden = true; }, 4500);
      }
    }

    function closeChat() {
      if (!chatPanel || !chatLauncher) return;
      chatPanel.hidden = true;
      chatLauncher.setAttribute("aria-expanded", "false");
      if (chatTryBubble) chatTryBubble.hidden = true;
    }

    function clearChat() {
      chatState.messages = [];
      chatStoreRemove(chatKeys.messages);
      chatStoreRemove(chatKeys.id);
      chatStoreRemove(chatKeys.intro);
      chatStoreSet(chatKeys.last, String(Date.now()));
      chatId();
      showIntroOnce();
      renderChatMessages();
      setChatStatus("Conversation cleared.");
    }

    function sendChatQuestion(question, retrying) {
      var text = String(question || "").trim();
      if (!text || chatSending) return;
      if (text.length > 900) {
        setChatStatus("Keep questions under 900 characters.");
        return;
      }

      chatSending = true;
      chatLastQuestion = text;
      setChatStatus("Thinking...");
      if (!retrying) addChatMessage("user", text);
      showTyping();

      var endpoint = resolvePortfolioEndpoint(chatbot.getAttribute("data-chat-endpoint"));
      var headers = { "Content-Type": "application/json" };

      fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          conversationId: chatId(),
          message: text,
          history: chatHistoryForApi()
        })
      })
        .then(function (response) {
          return response.json().catch(function () {
            return { ok: false, error: chatFallback };
          }).then(function (body) {
            if (!response.ok || !body.ok) {
              var safeError = new Error(portfolioApiError(body, chatFallback));
              safeError.safeChatError = true;
              throw safeError;
            }
            return body;
          });
        })
        .then(function (body) {
          hideTyping();
          addChatMessage("assistant", body.answer || chatFallback);
          setChatStatus("");
        })
        .catch(function (error) {
          hideTyping();
          addChatMessage("assistant", error && error.safeChatError ? error.message : chatFallback, { error: true, retry: true });
          setChatStatus("Connection issue. Retry when ready.");
        })
        .finally(function () {
          chatSending = false;
          if (chatInput) chatInput.value = "";
        });
    }

    renderChatMessages();
    chatId();

    if (chatLauncher) {
      chatLauncher.addEventListener("click", function () {
        if (chatPanel && !chatPanel.hidden) closeChat();
        else openChat(false);
      });
    }
    if (chatClose) chatClose.addEventListener("click", closeChat);
    if (chatClear) chatClear.addEventListener("click", clearChat);
    if (chatForm) {
      chatForm.addEventListener("submit", function (e) {
        e.preventDefault();
        sendChatQuestion(chatInput ? chatInput.value : "", false);
      });
    }
    if (chatInput) {
      chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendChatQuestion(chatInput.value, false);
        }
      });
    }
    if (chatSuggestions) {
      chatSuggestions.addEventListener("click", function (e) {
        if (e.target && e.target.tagName === "BUTTON") {
          openChat(false);
          sendChatQuestion(e.target.textContent, false);
        }
      });
    }
    if (chatMessages) {
      chatMessages.addEventListener("click", function (e) {
        var target = e.target;
        if (target && target.getAttribute && target.getAttribute("data-chat-retry") === "true") {
          sendChatQuestion(chatLastQuestion, true);
        }
      });
    }

    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && chatPanel && !chatPanel.hidden) closeChat();
    });

    if (chatNudgeClose) {
      chatNudgeClose.addEventListener("click", function () {
        chatStoreSet(chatKeys.prompt, "true");
        if (chatNudge) chatNudge.hidden = true;
      });
    }
    if (chatNudgeTry) {
      chatNudgeTry.addEventListener("click", function () {
        chatStoreSet(chatKeys.prompt, "true");
        openChat(true);
      });
    }
    if (chatStoreGet(chatKeys.prompt) !== "true") {
      setTimeout(function () {
        if (document.hidden || (chatPanel && !chatPanel.hidden)) return;
        if (chatNudge) chatNudge.hidden = false;
      }, 15000);
    }
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
