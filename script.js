/*
 * Interaction layer: scroll reveals, nav state, hero rotator, mobile menu.
 * Deliberately dependency-free; medium-motion per design brief, and all
 * motion defers to prefers-reduced-motion via the CSS side.
 */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NAV_OFFSET = 78;

  /* ----- Flux Lines background: ReactBits-inspired, canvas-native ----- */
  var fluxCanvas = document.getElementById("fluxLinesCanvas");
  if (fluxCanvas) initFluxLinesBackground(fluxCanvas);

  function initFluxLinesBackground(canvas) {
    var field = canvas.closest ? canvas.closest(".bg-field") : null;
    var gl = canvas.getContext && canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) {
      initFluxFallback(canvas, field);
      return;
    }

    var MAX_FLUX_COLORS = 4;
    var width = 1;
    var height = 1;
    var raf = 0;
    var last = 0;
    var pointerFine = window.matchMedia("(pointer: fine)");
    var pointer = { x: 0, y: 0, inside: false };
    var magnet = { x: 0, y: 0, active: 0 };
    var swirl = { x: 0, y: 0, age: 10 };
    var time = 0;
    var reveal = reducedMotion ? 1 : 0;
    var visible = true;
    var colorProbe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    var colorCache = new Map();
    var palette = new Float32Array(MAX_FLUX_COLORS * 3);
    var settings = {};

    var vertexSource = "#version 300 es\n" +
      "in vec2 aPosition;\n" +
      "void main(){gl_Position=vec4(aPosition,0.0,1.0);}";
    var fieldSource =
      "float hash(vec3 p3){p3=fract(p3*0.1031);p3+=dot(p3,p3.zyx+33.33);return fract((p3.x+p3.y)*p3.z);}\n" +
      "float smin(float a,float b,float k){float r=exp2(-a/k)+exp2(-b/k);return -k*log2(r);}\n" +
      "float sinlerp(float a,float b,float w){return mix(a,b,(sin(w*3.14159265-1.57079632)+1.0)/2.0);}\n" +
      "float vn(vec2 p,float s,float seed){vec2 cellp=floor(p/s);vec2 relp=mod(p,s);float g1=hash(vec3(cellp,seed));float g2=hash(vec3(cellp.x+1.0,cellp.y,seed));float g3=hash(vec3(cellp.x+1.0,cellp.y+1.0,seed));float g4=hash(vec3(cellp.x,cellp.y+1.0,seed));float bx=sinlerp(g1,g2,relp.x/s);float tx=sinlerp(g4,g3,relp.x/s);return sinlerp(bx,tx,relp.y/s);}\n" +
      "float dbn(vec2 p,float s,float seed){float o=s/2.0;float n0=vn(p,s,seed);float n1=vn(p+vec2(o,o),s,seed+0.1);float n2=vn(p+vec2(-o,o),s,seed+0.2);float n3=vn(p+vec2(o,-o),s,seed+0.3);float n4=vn(p+vec2(-o,-o),s,seed+0.4);return (2.0*n0+1.5*n1+1.25*n2+1.125*n3+n4)/7.0;}\n";
    var fragmentSource = "#version 300 es\n" +
      "precision highp float;precision highp int;\n" +
      "uniform vec2 uResolution;uniform float uTime;uniform vec2 uFlow;uniform float uSpeed;uniform float uScale;uniform float uTurbulence;uniform float uFluidity;uniform float uRimWidth;uniform float uSharpness;uniform float uShimmer;uniform float uGlow;uniform float uLine;uniform float uMaxHalf;uniform vec3 uColors[" + MAX_FLUX_COLORS + "];uniform int uColorCount;uniform vec4 uMagnet;uniform vec4 uSwirl;uniform float uReveal;uniform float uLight;uniform float uOpacity;out vec4 outColor;\n" +
      fieldSource +
      "vec3 palette(float h){float x=clamp(h,0.0,1.0)*float(uColorCount-1);int i=int(floor(x));int j=min(i+1,uColorCount-1);return mix(uColors[i],uColors[j],smoothstep(0.0,1.0,x-float(i)));}\n" +
      "void main(){float ref=700.0/max(uScale,0.05);vec2 frag=gl_FragCoord.xy;vec2 toMagnet=(frag-uMagnet.xy)/uResolution.y;float pull=uMagnet.z*exp(-dot(toMagnet,toMagnet)/(uMagnet.w*uMagnet.w));if(pull>0.001){float angle=pull*0.55;float c=cos(angle);float s=sin(angle);frag=uMagnet.xy+mat2(c,s,-s,c)*(frag-uMagnet.xy);}if(uSwirl.w>0.0){vec2 d=frag-uSwirl.xy;float reach=uSwirl.z;float angle=uSwirl.w*exp(-dot(d,d)/(reach*reach));float c=cos(angle);float s=sin(angle);frag=uSwirl.xy+mat2(c,s,-s,c)*d;}vec2 p=frag/uResolution.y*ref;float spd=200.0*uSpeed;float t=uTime;vec2 dir=uFlow;vec2 perp=vec2(-dir.y,dir.x);float distort1=vn(p+perp*(t*spd),60.0,10.0)*50.0*uTurbulence;float distort2=vn(p-perp*(t*spd),120.0,15.0)*100.0*uTurbulence;float peaks=dbn(p+distort1+dir*(t*spd*0.5),40.0,1.0);float peaks2=dbn(p+distort2-dir*(t*spd*0.5),40.0,0.0);float field=smin(peaks,peaks2,max(uFluidity,0.001));float slope=length(vec2(dFdx(field),dFdy(field)));float gap=abs(field-0.4);float pixels=gap/max(slope,1e-6);float halfBand=max(uRimWidth,0.001)*0.5;float across=max(gap/halfBand,pixels/uMaxHalf);float band=5.0*uRimWidth*(1.0-across);float reveal=smoothstep(0.2,0.85,pull);float shimmer=vn(p+dir*(t*spd*0.5),60.0,12.0)*uShimmer*(1.0-reveal*0.75);float lit=clamp(band-shimmer,0.0,1.0);float glow=pow(lit,uSharpness)*uGlow*(1.0+reveal*0.25);float core=smoothstep(uLine+0.75,uLine-0.75,pixels)*max(smoothstep(0.08,0.6,glow),reveal);float energy=max(glow*glow,core*0.85)*uReveal;float h=clamp(0.5+(peaks-peaks2)*0.8,0.0,1.0);vec3 tint=palette(h);if(uLight>0.5){float chroma=max(tint.r,max(tint.g,tint.b))-min(tint.r,min(tint.g,tint.b));vec3 ink=mix(vec3(0.07,0.07,0.08),tint*0.55,clamp(chroma*1.6,0.0,1.0));float cover=energy*uOpacity;outColor=vec4(ink*cover,cover);return;}vec3 light=tint*energy*uOpacity;outColor=vec4(light,max(light.r,max(light.g,light.b)));}";

    function compileShader(type, source) {
      var shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    }

    function createProgram() {
      var vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
      var fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      var program = gl.createProgram();
      if (!vertex || !fragment || !program) return null;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, "aPosition");
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
      gl.deleteProgram(program);
      return null;
    }

    var program = createProgram();
    if (!program) {
      initFluxFallback(canvas, field);
      return;
    }

    var uniforms = {};
    [
      "uResolution", "uTime", "uFlow", "uSpeed", "uScale", "uTurbulence", "uFluidity",
      "uRimWidth", "uSharpness", "uShimmer", "uGlow", "uLine", "uMaxHalf", "uColors",
      "uColorCount", "uMagnet", "uSwirl", "uReveal", "uLight", "uOpacity"
    ].forEach(function (name) {
      uniforms[name] = gl.getUniformLocation(program, name);
    });
    var buffer = gl.createBuffer();
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function parseColor(value, fallback) {
      var key = String(value || "");
      if (colorCache.has(key)) return colorCache.get(key);
      var rgb = fallback;
      if (colorProbe) {
        colorProbe.clearRect(0, 0, 1, 1);
        colorProbe.fillStyle = "#000";
        colorProbe.fillStyle = key;
        colorProbe.fillRect(0, 0, 1, 1);
        var data = colorProbe.getImageData(0, 0, 1, 1).data;
        rgb = [data[0] / 255, data[1] / 255, data[2] / 255];
      }
      colorCache.set(key, rgb);
      return rgb;
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function readFluxTheme() {
      var rootStyle = getComputedStyle(document.documentElement);
      var isLight = document.documentElement.getAttribute("data-theme") === "light";
      var compact = window.innerWidth < 760;
      var colors = [
        rootStyle.getPropertyValue("--flux-line-a").trim() || "#f7f2e8",
        rootStyle.getPropertyValue("--flux-line-b").trim() || "#f2b84b",
        rootStyle.getPropertyValue("--flux-line-c").trim() || "#84e4d0",
        rootStyle.getPropertyValue("--flux-line-d").trim() || "#ffffff"
      ];
      colors.forEach(function (value, index) {
        palette.set(parseColor(value, [1, 1, 1]), index * 3);
      });
      settings = {
        light: isLight ? 1 : 0,
        flowX: isLight ? 0.88 : 0.62,
        flowY: isLight ? -0.22 : -0.52,
        speed: reducedMotion ? 0 : (isLight ? 0.16 : 0.14),
        scale: compact ? 1.34 : 1.42,
        turbulence: isLight ? 0.92 : (compact ? 1.04 : 1.22),
        fluidity: isLight ? 0.085 : 0.072,
        rimWidth: isLight ? 0.13 : 0.16,
        sharpness: isLight ? 2.1 : 1.72,
        shimmer: isLight ? 0.72 : 0.98,
        glow: isLight ? 1.35 : (compact ? 0.2 : 0.26),
        lineWidth: isLight ? 0.7 : (compact ? 0.2 : 0.26),
        opacity: isLight ? 0.58 : (compact ? 0.075 : 0.095),
        mouseStrength: isLight ? 0.78 : 0.055,
        mouseRadius: isLight ? (compact ? 0.42 : 0.36) : (compact ? 0.05 : 0.04)
      };
    }

    function resizeFlux() {
      var ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.2 : 1.6);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      readFluxTheme();
      renderFlux();
    }

    function renderFlux() {
      var ratio = canvas.width / Math.max(1, width);
      var revealEase = reveal * reveal * (3 - 2 * reveal);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform2f(uniforms.uFlow, settings.flowX, settings.flowY);
      gl.uniform1f(uniforms.uSpeed, settings.speed);
      gl.uniform1f(uniforms.uScale, settings.scale);
      gl.uniform1f(uniforms.uTurbulence, settings.turbulence);
      gl.uniform1f(uniforms.uFluidity, settings.fluidity);
      gl.uniform1f(uniforms.uRimWidth, settings.rimWidth);
      gl.uniform1f(uniforms.uSharpness, settings.sharpness);
      gl.uniform1f(uniforms.uShimmer, settings.shimmer);
      gl.uniform1f(uniforms.uGlow, settings.glow);
      gl.uniform1f(uniforms.uLine, settings.lineWidth * ratio * 0.5);
      gl.uniform1f(uniforms.uMaxHalf, 24 * ratio);
      gl.uniform3fv(uniforms.uColors, palette);
      gl.uniform1i(uniforms.uColorCount, MAX_FLUX_COLORS);
      gl.uniform4f(uniforms.uMagnet, magnet.x, magnet.y, magnet.active * settings.mouseStrength, settings.mouseRadius);
      var twistBase = settings.light ? 1.9 : 0.1;
      var twist = twistBase * Math.min(1, swirl.age / 0.23) * Math.exp(-Math.max(0, swirl.age - 0.23) * 1.1);
      var swirlReach = settings.light ? 0.22 : 0.035;
      gl.uniform4f(uniforms.uSwirl, swirl.x, swirl.y, canvas.height * swirlReach * (1 + swirl.age * 0.5), swirl.age < 6 ? twist : 0);
      gl.uniform1f(uniforms.uReveal, revealEase);
      gl.uniform1f(uniforms.uLight, settings.light);
      gl.uniform1f(uniforms.uOpacity, settings.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function tick(now) {
      raf = 0;
      if (document.hidden) {
        last = 0;
        return;
      }
      var dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
      last = now;
      time += dt;
      swirl.age += dt;
      if (!reducedMotion && reveal < 1) reveal = Math.min(1, reveal + dt / 1.4);
      var engaged = !reducedMotion && pointerFine.matches && pointer.inside;
      var follow = 1 - Math.exp(-dt / 0.15);
      if (engaged) {
        magnet.x += (pointer.x - magnet.x) * follow;
        magnet.y += (pointer.y - magnet.y) * follow;
      }
      var target = engaged ? 1 : 0;
      magnet.active += (target - magnet.active) * (1 - Math.exp(-dt / 0.28));
      if (Math.abs(target - magnet.active) < 0.001) magnet.active = target;
      renderFlux();
      if (!reducedMotion && visible) raf = requestAnimationFrame(tick);
    }

    function wakeFlux() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    }

    resizeFlux();
    if (field) field.classList.add(reducedMotion ? "flux-static" : "flux-ready");

    window.addEventListener("resize", function () {
      resizeFlux();
      wakeFlux();
    });
    window.addEventListener("pointermove", function (event) {
      var rect = canvas.getBoundingClientRect();
      var ratio = canvas.width / Math.max(1, rect.width);
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x * ratio;
      pointer.y = (rect.height - y) * ratio;
      if (pointer.inside && magnet.active < 0.05) {
        magnet.x = pointer.x;
        magnet.y = pointer.y;
      }
      wakeFlux();
    }, { passive: true });
    window.addEventListener("pointerdown", function (event) {
      var rect = canvas.getBoundingClientRect();
      var ratio = canvas.width / Math.max(1, rect.width);
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x * ratio;
      pointer.y = (rect.height - y) * ratio;
      if (pointer.inside && !reducedMotion) {
        swirl.x = pointer.x;
        swirl.y = pointer.y;
        swirl.age = 0;
      }
      wakeFlux();
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", function () {
      pointer.inside = false;
      wakeFlux();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        last = 0;
        wakeFlux();
      }
    });
    var themeObserver = new MutationObserver(function () {
      readFluxTheme();
      renderFlux();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if ("IntersectionObserver" in window && field) {
      var fluxIO = new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) { return entry.isIntersecting; });
        if (visible) {
          last = 0;
          wakeFlux();
        }
      });
      fluxIO.observe(field);
    }
    if (!reducedMotion) wakeFlux();
  }

  function initFluxFallback(canvas, field) {
    var ctx = canvas.getContext && canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      if (field) field.classList.add("flux-fallback");
      return;
    }
    if (field) field.classList.add(reducedMotion ? "flux-static" : "flux-ready");
    var width = 1;
    var height = 1;
    var last = 0;
    var raf = 0;
    function resizeFallback() {
      var ratio = Math.min(window.devicePixelRatio || 1, 1.35);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawFallback(performance.now());
    }
    function drawFallback(now) {
      var rootStyle = getComputedStyle(document.documentElement);
      var a = rootStyle.getPropertyValue("--flux-line-a").trim() || "#f7f2e8";
      var b = rootStyle.getPropertyValue("--flux-line-b").trim() || "#d9a03f";
      var light = document.documentElement.getAttribute("data-theme") === "light";
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = light ? "multiply" : "lighter";
      for (var i = 0; i < 12; i++) {
        var y = (i / 11) * height + Math.sin(now * 0.00025 + i) * 90;
        var grad = ctx.createLinearGradient(0, y - 80, width, y + 80);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, i % 2 ? a : b);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = light ? 0.7 : 1.4;
        ctx.globalAlpha = light ? 0.22 : 0.42;
        ctx.beginPath();
        for (var x = -60; x <= width + 60; x += 26) {
          var yy = y + Math.sin(x * 0.01 + now * 0.0007 + i) * 46 + Math.sin(x * 0.023 - now * 0.00045) * 22;
          if (x === -60) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    function tickFallback(now) {
      raf = 0;
      if (!document.hidden) {
        last = now;
        drawFallback(now);
      }
      if (!reducedMotion) raf = requestAnimationFrame(tickFallback);
    }
    window.addEventListener("resize", resizeFallback);
    resizeFallback();
    if (!reducedMotion) raf = requestAnimationFrame(tickFallback);
  }

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
    revealSectionNow(target);
    scheduleRevealCheck();
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
  function revealSectionNow(section) {
    if (!section || !revealEls.length) return;
    var batch = 0;
    if (section.classList && section.classList.contains("reveal") && !section.classList.contains("in")) {
      revealElement(section, batch++);
    }
    section.querySelectorAll(".reveal").forEach(function (el) {
      if (!el.classList.contains("in")) revealElement(el, batch++);
    });
  }
  function scheduleRevealCheck() {
    requestAnimationFrame(revealVisibleNow);
    setTimeout(revealVisibleNow, 120);
    setTimeout(revealVisibleNow, 420);
    setTimeout(revealVisibleNow, 760);
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
    scheduleRevealCheck();
    if (location.hash) revealSectionNow(document.getElementById(location.hash.slice(1)));
    window.addEventListener("pageshow", revealVisibleNow);
    window.addEventListener("hashchange", function () {
      revealSectionNow(document.getElementById(location.hash.slice(1)));
      scheduleRevealCheck();
    });
    window.addEventListener("popstate", scheduleRevealCheck);
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

  /* ----- Scroll progress ----- */
  var progress = document.getElementById("scrollProgress");
  function onScrollProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    if (progress) {
      progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
  }
  window.addEventListener("scroll", onScrollProgress, { passive: true });
  onScrollProgress();

  /* ----- Theme toggle ----- */
  var themeToggle = document.getElementById("themeToggle");
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyThemeMeta() {
    if (themeMeta) {
      themeMeta.setAttribute(
        "content",
        document.documentElement.getAttribute("data-theme") === "light" ? "#f0ede5" : "#070706"
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

  /* ----- Proof depth carousel: static-site motion, no framework dependency ----- */
  var proofOrbit = document.querySelector("[data-proof-orbit]");
  if (proofOrbit) {
    var proofStage = proofOrbit.querySelector(".proof-orbit-stage");
    var proofCards = Array.prototype.slice.call(proofOrbit.querySelectorAll("[data-proof-card]"));
    var proofPrev = proofOrbit.querySelector("[data-proof-prev]");
    var proofNext = proofOrbit.querySelector("[data-proof-next]");
    var proofToggle = proofOrbit.querySelector("[data-proof-toggle]");
    var proofLive = proofOrbit.querySelector("[data-proof-live]");
    var proofCaptionTitle = proofOrbit.querySelector("[data-proof-caption-title]");
    var proofCaptionSubtitle = proofOrbit.querySelector("[data-proof-caption-subtitle]");
    var proofTarget = 0;
    var proofPosition = 0;
    var proofActive = 0;
    var proofPaused = reducedMotion;
    var proofVisible = true;
    var proofHover = false;
    var proofFocus = false;
    var proofDragStart = null;
    var proofDragLast = null;
    var proofMouseDrift = 0;
    var proofCompact = false;

    function proofShortest(raw) {
      if (!proofCards.length) return 0;
      var half = proofCards.length / 2;
      while (raw > half) raw -= proofCards.length;
      while (raw < -half) raw += proofCards.length;
      return raw;
    }

    function proofSyncMode() {
      proofCompact = window.matchMedia("(max-width: 760px)").matches;
    }

    function proofUpdateCaption(forceLive) {
      var activeCard = proofCards[proofActive];
      if (!activeCard) return;
      var title = activeCard.getAttribute("data-title") || activeCard.querySelector("h3").textContent || "";
      var subtitle = activeCard.getAttribute("data-subtitle") || "";
      if (proofCaptionTitle) proofCaptionTitle.textContent = title;
      if (proofCaptionSubtitle) proofCaptionSubtitle.textContent = subtitle;
      if (proofLive && forceLive) proofLive.textContent = "Showing " + title + (subtitle ? ", " + subtitle : "") + ".";
      if (proofToggle) {
        proofToggle.textContent = proofPaused ? "Resume" : "Pause";
        proofToggle.setAttribute("aria-pressed", String(proofPaused));
      }
    }

    function proofLayout(forceLive) {
      if (!proofCards.length || !proofStage) return;
      proofSyncMode();
      var nearest = ((Math.round(proofPosition) % proofCards.length) + proofCards.length) % proofCards.length;
      if (nearest !== proofActive || forceLive) {
        proofActive = nearest;
        proofUpdateCaption(true);
      } else {
        proofUpdateCaption(false);
      }

      proofCards.forEach(function (card, index) {
        if (proofCompact) {
          card.style.removeProperty("transform");
          card.style.removeProperty("opacity");
          card.style.removeProperty("filter");
          card.style.removeProperty("z-index");
          card.classList.toggle("is-active", index === proofActive);
          card.classList.toggle("is-near", Math.abs(proofShortest(index - proofActive)) === 1);
          card.setAttribute("aria-current", index === proofActive ? "true" : "false");
          return;
        }
        var offset = proofShortest(index - proofPosition);
        var abs = Math.abs(offset);
        var x = offset * Math.min(128, Math.max(92, proofStage.clientWidth * 0.16));
        var y = abs * 10;
        var z = -abs * 130;
        var rot = offset * -9;
        var scale = Math.max(0.7, 1 - abs * 0.08);
        var opacity = abs > 3.4 ? 0 : Math.max(0.18, 1 - abs * 0.23);
        var blur = Math.min(3.6, abs * 0.85);
        card.style.transform =
          "translate3d(calc(-50% + " + x.toFixed(1) + "px), calc(-50% + " + y.toFixed(1) + "px), " + z.toFixed(1) + "px) rotateY(" + rot.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = "saturate(" + Math.max(0.62, 1 - abs * 0.08).toFixed(2) + ") blur(" + blur.toFixed(2) + "px)";
        card.style.zIndex = String(100 - Math.round(abs * 10));
        var semanticActive = index === proofActive;
        card.classList.toggle("is-active", semanticActive);
        card.classList.toggle("is-near", abs >= 0.45 && abs < 1.55);
        card.setAttribute("aria-current", semanticActive ? "true" : "false");
      });
    }

    function proofSetTarget(next, forceLive) {
      if (!proofCards.length) return;
      proofTarget = next;
      if (reducedMotion || proofCompact) proofPosition = proofTarget;
      proofLayout(forceLive);
    }

    function proofGo(delta) {
      proofSetTarget(Math.round(proofTarget) + delta, true);
    }

    function proofNavigateLink(link) {
      if (!link) return;
      var href = link.getAttribute("href") || "";
      if (href.charAt(0) === "#") {
        var target = document.getElementById(href.slice(1));
        if (!target) return;
        smoothScrollTo(target.getBoundingClientRect().top + window.scrollY - navOffset);
        revealNow(target);
        forceRevealSweep();
        if (history.pushState) history.pushState(null, "", href);
        return;
      }
      link.click();
    }

    function proofOpenActiveLink(event) {
      var activeCard = proofCards[proofActive];
      if (!activeCard || !event) return false;
      if (event.target && event.target.closest && event.target.closest(".proof-orbit-link")) return false;
      var link = activeCard.querySelector(".proof-orbit-link");
      if (!link) return false;
      var rect = link.getBoundingClientRect();
      var cardRect = activeCard.getBoundingClientRect();
      var pad = 10;
      var insideLink =
        event.clientX >= rect.left - pad &&
        event.clientX <= rect.right + pad &&
        event.clientY >= rect.top - pad &&
        event.clientY <= rect.bottom + pad;
      var insideCard =
        event.clientX >= cardRect.left &&
        event.clientX <= cardRect.right &&
        event.clientY >= cardRect.top &&
        event.clientY <= cardRect.bottom;
      if (!insideLink && !insideCard) return false;
      event.preventDefault();
      proofNavigateLink(link);
      return true;
    }

    function proofSet(index) {
      if (!proofCards.length) return;
      var base = Math.round(proofTarget);
      var currentModulo = ((base % proofCards.length) + proofCards.length) % proofCards.length;
      proofSetTarget(base + proofShortest(index - currentModulo), true);
    }

    proofCards.forEach(function (card, index) {
      card.addEventListener("click", function (event) {
        if (event.target && event.target.closest && event.target.closest("a")) return;
        proofSet(index);
      });
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          proofSet(index);
        }
      });
    });

    if (proofPrev) proofPrev.addEventListener("click", function () { proofGo(-1); });
    if (proofNext) proofNext.addEventListener("click", function () { proofGo(1); });
    if (proofToggle) {
      proofToggle.addEventListener("click", function () {
        if (reducedMotion) return;
        proofPaused = !proofPaused;
        proofLayout(true);
      });
    }
    if (proofStage) {
      proofStage.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          proofGo(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          proofGo(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          proofSet(0);
        } else if (event.key === "End") {
          event.preventDefault();
          proofSet(proofCards.length - 1);
        }
      });
      proofStage.addEventListener("pointerdown", function (event) {
        if (event.target && event.target.closest && event.target.closest("a, button, input, textarea, select")) return;
        proofDragStart = event.clientX;
        proofDragLast = event.clientX;
        if (proofStage.setPointerCapture) proofStage.setPointerCapture(event.pointerId);
      });
      proofStage.addEventListener("pointermove", function (event) {
        if (proofDragStart !== null) {
          var dragDelta = event.clientX - proofDragLast;
          proofDragLast = event.clientX;
          proofTarget -= dragDelta / Math.max(190, proofStage.clientWidth * 0.34);
          return;
        }
        var rect = proofStage.getBoundingClientRect();
        var center = rect.left + rect.width / 2;
        proofMouseDrift = Math.max(-0.035, Math.min(0.035, proofMouseDrift + (event.clientX - center) / Math.max(1, rect.width) * 0.018));
      });
      proofStage.addEventListener("pointerup", function (event) {
        if (proofDragStart === null) return;
        var delta = event.clientX - proofDragStart;
        proofDragStart = null;
        proofDragLast = null;
        if (Math.abs(delta) > 34) proofGo(delta < 0 ? 1 : -1);
        else if (proofOpenActiveLink(event)) return;
        else proofSetTarget(Math.round(proofTarget), true);
      });
      proofStage.addEventListener("click", function (event) {
        proofOpenActiveLink(event);
      }, true);
      proofStage.addEventListener("pointercancel", function () {
        proofDragStart = null;
        proofDragLast = null;
        proofSetTarget(Math.round(proofTarget), false);
      });
      proofStage.addEventListener("mouseenter", function () { proofHover = true; });
      proofStage.addEventListener("mouseleave", function () {
        proofHover = false;
        proofMouseDrift = 0;
        if (proofDragStart !== null) proofSetTarget(Math.round(proofTarget), false);
        proofDragStart = null;
        proofDragLast = null;
      });
      proofStage.addEventListener("focusin", function () { proofFocus = true; });
      proofStage.addEventListener("focusout", function () { proofFocus = false; });
    }
    if ("IntersectionObserver" in window) {
      var proofIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          proofVisible = entry.isIntersecting;
        });
      }, { threshold: 0.25 });
      proofIO.observe(proofOrbit);
    }
    window.addEventListener("resize", function () {
      proofSyncMode();
      proofLayout(false);
    });
    proofSyncMode();
    proofLayout(true);
    if (!reducedMotion) {
      var proofLastTick = performance.now();
      function proofTick(now) {
        var dt = Math.min(40, now - proofLastTick);
        proofLastTick = now;
        if (!document.hidden && proofVisible && !proofPaused) {
          if (!proofHover && !proofFocus && proofDragStart === null) {
            proofTarget += 0.00018 * dt;
          }
          if (proofHover && proofDragStart === null) {
            proofTarget += proofMouseDrift * dt;
            proofMouseDrift *= 0.92;
          }
        }
        proofPosition += (proofTarget - proofPosition) * 0.095;
        if (Math.abs(proofTarget - proofPosition) < 0.001) proofPosition = proofTarget;
        proofLayout(false);
        requestAnimationFrame(proofTick);
      }
      requestAnimationFrame(proofTick);
      window.setInterval(function () {
        if (document.hidden || proofPaused || proofHover || proofFocus || !proofVisible || proofDragStart !== null) return;
        proofGo(1);
      }, 5600);
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

  /* ----- Video resume: native controls, custom mute toggle, no background playback ----- */
  var videoResume = document.getElementById("videoResume");
  var videoMuteToggle = document.getElementById("videoMuteToggle");
  if (videoResume) {
    var shouldResumeVideo = false;
    var videoVisible = false;
    var pausingForVisibility = false;

    function syncVideoMuteState() {
      if (!videoMuteToggle) return;
      videoMuteToggle.textContent = videoResume.muted ? "Muted" : "Sound on";
      videoMuteToggle.setAttribute("aria-pressed", videoResume.muted ? "true" : "false");
    }

    function tryResumeVideo() {
      if (!shouldResumeVideo || !videoVisible || document.hidden || !videoResume.muted || videoResume.ended) return;
      videoResume.play().catch(function () {});
    }

    function pauseVideoForVisibility() {
      if (videoResume.paused) return;
      pausingForVisibility = true;
      shouldResumeVideo = true;
      videoResume.pause();
      pausingForVisibility = false;
    }

    if (videoMuteToggle) {
      videoMuteToggle.addEventListener("click", function () {
        videoResume.muted = !videoResume.muted;
        syncVideoMuteState();
      });
    }

    videoResume.addEventListener("volumechange", syncVideoMuteState);
    videoResume.addEventListener("play", function () {
      shouldResumeVideo = true;
    });
    videoResume.addEventListener("pause", function () {
      if (!pausingForVisibility) shouldResumeVideo = false;
    });
    videoResume.addEventListener("ended", function () {
      shouldResumeVideo = false;
    });

    if ("IntersectionObserver" in window) {
      var videoIO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            videoVisible = entry.isIntersecting;
            if (videoVisible) tryResumeVideo();
            else pauseVideoForVisibility();
          });
        },
        { threshold: 0.45 }
      );
      videoIO.observe(videoResume);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pauseVideoForVisibility();
      else tryResumeVideo();
    });

    syncVideoMuteState();
  }

  var scrollExpandMedia = document.querySelectorAll("[data-scroll-expand]");
  if (scrollExpandMedia.length) {
    var updateScrollExpand = function () {
      scrollExpandMedia.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var range = window.innerHeight + rect.height;
        var raw = (window.innerHeight - rect.top) / Math.max(1, range);
        var progress = Math.max(0, Math.min(1, raw * 1.34));
        var inverse = 1 - progress;
        el.style.setProperty("--scroll-expand", progress.toFixed(3));
        el.style.setProperty("--scroll-inset-y", (inverse * 7).toFixed(2) + "%");
        el.style.setProperty("--scroll-inset-x", (inverse * 8).toFixed(2) + "%");
        el.style.setProperty("--scroll-scale", (0.965 + progress * 0.035).toFixed(4));
        el.style.setProperty("--scroll-y", (inverse * 18).toFixed(1) + "px");
        if (el.closest) {
          var section = el.closest(".video-resume-section");
          if (section) {
            section.style.setProperty("--video-expand", progress.toFixed(3));
            section.style.setProperty("--video-glow-opacity", (0.18 + progress * 0.16).toFixed(3));
          }
        }
      });
    };
    if (!reducedMotion) {
      window.addEventListener("scroll", updateScrollExpand, { passive: true });
      window.addEventListener("resize", updateScrollExpand);
      updateScrollExpand();
    } else {
      scrollExpandMedia.forEach(function (el) {
        el.style.setProperty("--scroll-expand", "1");
        el.style.setProperty("--scroll-inset-y", "0%");
        el.style.setProperty("--scroll-inset-x", "0%");
        el.style.setProperty("--scroll-scale", "1");
        el.style.setProperty("--scroll-y", "0px");
      });
    }
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

  /* ----- Demo health badges: status.json uses precise user-facing states
     instead of collapsing access-gated, sleeping and offline services. ----- */
  fetch("status.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (status) {
      if (!status) return;
      var checkedAt = status.checked ? Date.parse(status.checked) : 0;
      var healthStale = !checkedAt || Date.now() - checkedAt > 2 * 60 * 60 * 1000;
      function healthState(raw) {
        if (!raw) return { state: "unknown", label: "status unknown", tone: "stale" };
        var state = raw.state || (raw.up === true ? "public" : raw.up === false ? "offline" : "unknown");
        var label = raw.label || ({
          public: "public demo",
          access_gated: "access gated",
          sleeping: "sleeping demo",
          offline: "demo offline",
          unknown: "status unknown"
        }[state] || "status unknown");
        var tone = state === "public" ? "up" : state === "offline" ? "down" : "stale";
        return { state: state, label: label, tone: tone };
      }
      document.querySelectorAll("[data-health]").forEach(function (badge) {
        var health = healthState(status[badge.getAttribute("data-health")]);
        badge.classList.remove("health-up", "health-down", "health-stale");
        if (health.tone === "up" && !healthStale) badge.classList.add("health-up");
        if (health.tone === "down") badge.classList.add("health-down");
        if (health.tone === "stale" || (healthStale && health.tone === "up")) badge.classList.add("health-stale");
        badge.textContent = healthStale && health.tone === "up" ? "status stale" : health.label;
        if (status.checked) {
          badge.title = "Demo status last checked " + status.checked.slice(0, 16).replace("T", " ") + " UTC" + (healthStale ? " (stale)" : "");
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
          var health = healthState(status[sys[1]]);
          var el = document.createElement("span");
          var staleOnline = healthStale && health.tone === "up";
          el.className = "sys sys-" + (staleOnline ? "stale" : health.tone);
          el.innerHTML = '<span class="sys-dot"></span>' + sys[0] + ": " + (staleOnline ? "status stale" : health.label);
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
    var GITHUB_CACHE_KEY = "rk-github-status-v2";
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
      main.innerHTML = '<span class="gh-dot"></span>GitHub: ' + activeRepos.length + "/" + repoNames.length + " active public repos";
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

    function normalizeRepoSnapshot(raw) {
      if (!raw || !raw.repos || typeof raw.repos !== "object") return null;
      if (!repoMapHasData(raw.repos)) return null;
      return {
        repos: raw.repos,
        fetchedAt: Date.parse(raw.checked || "") || Date.now()
      };
    }

    function fetchStaticGitHubStatus() {
      return fetch("assets/github-repos.json", { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) return null;
          return response.json();
        })
        .then(normalizeRepoSnapshot)
        .catch(function () { return null; });
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
      fetchStaticGitHubStatus().then(function (snapshot) {
        if (snapshot) {
          writeGitHubCache(snapshot.repos);
          renderGitHubStatus(snapshot.repos, snapshot.fetchedAt);
          return;
        }
        Promise.all(reposToLoad.map(fetchGitHubRepo)).then(function (results) {
          var repoMap = {};
          reposToLoad.forEach(function (name, index) {
            repoMap[name] = results[index];
          });
          writeGitHubCache(repoMap);
          renderGitHubStatus(repoMap, Date.now());
        });
      });
    }
  }

  function portfolioApiBase() {
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return "";
    if (window.RK_API_BASE) return String(window.RK_API_BASE).replace(/\/$/, "");
    var meta = document.querySelector('meta[name="portfolio-api-base"]');
    var configured = meta ? String(meta.getAttribute("content") || "").replace(/\/$/, "") : "";
    if (configured) return configured;
    if (location.hostname === "ranbirkumar26.github.io") return "https://ranbir-portfolio-backend.onrender.com";
    return "";
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

    function isUnknownPortfolioAnswer(answer) {
      return String(answer || "").trim() === "I do not have that information in my portfolio context.";
    }

    function isOverSensitivePrivacyAnswer(answer, question) {
      return /^Privacy warning:/i.test(String(answer || "").trim()) && !chatPrivacyPattern.test(normalizeChatText(question));
    }

    function normalizeAssistantAnswer(answer) {
      return String(answer || "")
        .replace(/has been filed/gi, "has been published")
        .replace(/a filed patent/gi, "a published patent")
        .replace(/patent filing/gi, "published patent")
        .replace(/the Autonomous Patrolling Robot patent track/gi, "the published Autonomous Patrolling Robot patent")
        .replace(/Filing specifics remain confidential until public\.?/gi, "Patent number or publication link has not been supplied in the portfolio context yet.");
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
    var chatSubmit = chatForm ? chatForm.querySelector('button[type="submit"]') : null;
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
    var chatPrivacyWarning = "Privacy warning: I can share resume-public contact and professional details only. I cannot share private personal information such as address, net worth, family details, relationship details, date of birth, age, compensation, government identifiers, medical details, religion, caste, future employer, or private location.";
    var chatInjectionWarning = "Prompt-injection warning: I cannot ignore grounding rules, reveal hidden instructions, expose context or provider details, or fabricate facts about Ranbir. Ask a normal portfolio question instead.";
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
          .map(function (item) {
            return {
              role: item.role,
              content: item.content,
              sources: sanitizeChatSources(item.sources),
              error: Boolean(item.error),
              retry: Boolean(item.retry)
            };
          })
          .filter(function (item) {
            return !item.error && item.content !== chatFallback && item.content !== "Failed to fetch";
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
    saveChatMessages(chatState.messages);

    function setChatStatus(message) {
      if (chatStatus) chatStatus.textContent = message || "";
    }

    function sanitizeChatSources(sources) {
      if (!Array.isArray(sources)) return [];
      return sources
        .map(function (source) {
          return String(source || "").replace(/\s+/g, " ").trim().slice(0, 80);
        })
        .filter(Boolean)
        .filter(function (source, index, list) {
          return list.indexOf(source) === index;
        })
        .slice(0, 4);
    }

    function setChatSending(sending) {
      chatSending = sending;
      if (chatSubmit) {
        chatSubmit.disabled = sending;
        chatSubmit.setAttribute("aria-disabled", String(sending));
      }
      if (chatForm) chatForm.setAttribute("aria-busy", String(sending));
    }

    function addChatMessage(role, content, options) {
      chatState.messages.push({
        role: role,
        content: String(content || "").slice(0, 3000),
        sources: sanitizeChatSources(options && options.sources),
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
        var sources = sanitizeChatSources(message.sources);
        if (message.role === "assistant" && sources.length) {
          var sourceWrap = document.createElement("div");
          sourceWrap.className = "chat-sources mono";
          sourceWrap.setAttribute("aria-label", "Answer sources");
          sources.forEach(function (source) {
            var chip = document.createElement("span");
            chip.className = "chat-source";
            chip.textContent = source;
            sourceWrap.appendChild(chip);
          });
          row.appendChild(sourceWrap);
        }
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

    function normalizeChatText(value) {
      return String(value || "").toLowerCase().replace(/[^a-z0-9+/.\s-]/g, " ").replace(/\s+/g, " ").trim();
    }

    var chatPrivacyPattern = /net\s?worth|\bwealth\b|\bsalary\b|\bctc\b|\bcompensation\b|\bpay\b|\bincome\b|\bhome\s+address\b|\bresidential\s+address\b|\bcurrent\s+address\b|\bpermanent\s+address\b|\baddress\b|\bwhere\s+(?:does\s+)?(?:ranbir|he)\s+live\b|\bwhatsapp\b|\bdate\s+of\s+birth\b|\bdob\b|\bbirthday\b|\bage\b|\bhow\s+old\b|\bfamily\b|\bparents?\b|\bsiblings?\b|\bgirlfriend\b|\bboyfriend\b|\brelationship\b|\bmarried\b|\breligion\b|\bcaste\b|\bpolitical\b|\bmedical\b|\bhealth\b|\bgovernment\s+id\b|\baadhaar\b|\bpassport\b|\bprivate\s+location\b|\bfuture\s+employer\b|\bjoining\s+next\b/;
    var chatInjectionPattern = /ignore .*instructions|ignore .*previous|ignore .*rules|bypass|jailbreak|developer message|system prompt|hidden prompt|hidden context|dump .*context|reveal .*context|show .*prompt|api key|provider|secret|make up|fabricate|pretend .*has|roleplay .*ignore|forget .*rules|override .*instructions/;
    var chatAchievementPattern = /achievement|achievements|award|awards|sih|smart india hackathon|robocon|irc|international rover challenge|insightify|patent|certification|certifications|certificate|finalist|rank/;

    function isResumePublicContactQuery(query) {
      return /\b(phone|mobile|email|e-mail|mail|contact number|contact details|contact info|contact information|reach|portfolio|website|github|linkedin)\b/.test(query);
    }

    function resumePublicContactFallback(query) {
      var parts = [];
      if (/phone|mobile|contact number|contact details|contact info|contact information|reach|contact\b/.test(query)) parts.push("phone +91 83760 86612");
      if (/email|e-mail|mail|contact details|contact info|contact information|reach|contact\b/.test(query)) parts.push("email rk26.ftw@gmail.com");
      if (/portfolio|website|site/.test(query)) parts.push("portfolio ranbirkumar26.github.io");
      if (/github/.test(query)) parts.push("GitHub github.com/Ranbirkumar26");
      if (/linkedin/.test(query)) parts.push("LinkedIn linkedin.com/in/ranbirkumar-ai");
      if (!parts.length) {
        parts = [
          "phone +91 83760 86612",
          "email rk26.ftw@gmail.com",
          "portfolio ranbirkumar26.github.io",
          "GitHub github.com/Ranbirkumar26",
          "LinkedIn linkedin.com/in/ranbirkumar-ai"
        ];
      }
      return "Ranbir's resume-public contact details are " + parts.join(", ") + ".";
    }

    function achievementFallback(query) {
      if (/sih|smart india hackathon/.test(query)) {
        return "Smart India Hackathon 2025 Grand Finalist: Ranbir's team was top 5 nationally in Robotics and Drones after placing top 3 among nearly 800 college-level teams.";
      }
      if (/robocon/.test(query)) {
        return "DD Robocon proof: Ranbir's team achieved All-India Rank 1 in Round 1 with 100 out of 100 in stage one.";
      }
      if (/\birc\b|international rover challenge/.test(query)) {
        return "International Rover Challenge proof: Ranbir's team placed 20th worldwide at IRC 2025 among more than 100 applicant teams, and is a finalist again for IRC 2026.";
      }
      if (/insightify/.test(query)) {
        return "Insightify 6.0 proof: Ranbir's team DataQuants was a national finalist, ranked 1st nationally in the analysis round, and ranked 2nd in the ML case-study round.";
      }
      if (/patent/.test(query)) {
        return "Patent proof: Ranbir has a published Autonomous Patrolling Robot patent listed on the portfolio and resume. Patent number or publication link has not been supplied in the portfolio context yet.";
      }
      if (/certification|certifications|certificate/.test(query)) {
        return "Certification proof includes Cisco Networking Academy Network Support and Security plus IBM SkillsBuild AI and cloud certificates listed in the portfolio context.";
      }
      return "Ranbir's achievement proof includes Smart India Hackathon 2025 Grand Finalist, DD Robocon All-India Rank 1 in Round 1, IRC 2025 20th worldwide, Insightify 6.0 National Finalist, a published Autonomous Patrolling Robot patent, and listed certifications.";
    }

    function offlineChatFallback(question) {
      var query = normalizeChatText(question);

      if (chatInjectionPattern.test(query)) {
        return {
          answer: chatInjectionWarning,
          sources: ["Safety policy"],
          status: "Backend unreachable. Showing local safety answer."
        };
      }
      if (isResumePublicContactQuery(query)) {
        return {
          answer: resumePublicContactFallback(query) + (chatPrivacyPattern.test(query) ? " " + chatPrivacyWarning : ""),
          sources: ["Hosted resume", "Contact links"],
          status: "Backend unreachable. Showing offline resume-public answer."
        };
      }
      if (chatPrivacyPattern.test(query)) {
        return {
          answer: chatPrivacyWarning,
          sources: ["Privacy policy"],
          status: "Backend unreachable. Showing local privacy answer."
        };
      }
      if (chatAchievementPattern.test(query)) {
        return {
          answer: achievementFallback(query),
          sources: ["Achievements", "Research"],
          status: "Backend unreachable. Showing offline achievement answer."
        };
      }
      if (/why .*hire|hire .*ranbir|role fit|fit for|good for|\b(post|position|opening)\b/.test(query)) {
        if (/\b(ai\s+agent|agentic|agent engineer|llm agent|agents?|langgraph|mcp)\b/.test(query)) {
          return {
            answer: "For AI Agent Engineer roles, Ranbir's strongest public evidence is iORA DocQA for grounded RAG, multi-provider fallback and SQL routing, ForgeAI for LangGraph agents, repo indexing and approval-gated patch verification, AuthPilot for Planner, Executor and Verifier agent workflows, SemantiCache for retrieval optimization, and EnergyPlus LLM HVAC Agent for tool-driven control over live simulator telemetry.",
            sources: ["Projects", "Agentic AI", "RAG"],
            status: "Backend unreachable. Showing offline portfolio answer."
          };
        }
        if (/computer vision|vision|cv\b|yolo|resnet|jetson|edge/.test(query)) {
          return {
            answer: "For Computer Vision roles, Ranbir's strongest public evidence is Proeffico production CV work on NVIDIA Jetson Xavier NX under 40 ms inference, Annadata's YOLO and ResNet agriculture pipeline, rover perception work for terrain and arrow-marker detection, and the Vision-Based Terrain Analysis research track.",
            sources: ["Experience", "Projects", "Research"],
            status: "Backend unreachable. Showing offline portfolio answer."
          };
        }
        if (/robotics|rover|embedded|autonomous|firmware|hardware/.test(query)) {
          return {
            answer: "For Robotics or Embedded AI roles, Ranbir brings rover leadership at Technocrats Robotics, autonomy and perception work across Raspberry Pi and i7 mini-PC systems, iORA wearable integration across firmware, MQTT over TLS, GNSS and telemetry, and competition proof from Robocon and IRC.",
            sources: ["Experience", "Robotics", "Achievements"],
            status: "Backend unreachable. Showing offline portfolio answer."
          };
        }
        if (/ai|ml|machine learning|rag|llm|data/.test(query)) {
          return {
            answer: "For AI/ML roles, Ranbir's strongest public evidence is iORA DocQA for grounded RAG and SQL routing, SemantiCache for semantic retrieval optimization, CraveConnect for explainable ML, and research work in few-shot explainable AI and terrain perception.",
            sources: ["Experience", "Projects", "Research"],
            status: "Backend unreachable. Showing offline portfolio answer."
          };
        }
        if (/software|sde|backend|full stack|full-stack|frontend|web/.test(query)) {
          return {
            answer: "For software roles, Ranbir has shipped iORA DocQA, IAMAI CMS work, SemantiCache APIs, CraveConnect's Flask scoring service, Smart Task Manager, and Supabase-backed applications with auth, storage, RBAC, deployment workflows, and reliability checks.",
            sources: ["Experience", "Projects"],
            status: "Backend unreachable. Showing offline portfolio answer."
          };
        }
        return {
          answer: "What role are you considering Ranbir for: AI/ML, Computer Vision, Software Development, Data Science, Robotics, Embedded AI, Research, or something else?",
          sources: ["Hiring guide"],
          status: "Backend unreachable. Showing offline clarification."
        };
      }
      if (/project|projects|worked on|built|builds|build|what all|what has .*done|portfolio work/.test(query)) {
        return {
          answer: "Ranbir's visible portfolio projects include iORA DocQA, SemantiCache, Annadata, CraveConnect, Smart Task Manager, Apple Quality Detection, ShareKart, Rover Abhimanyu, and the published Autonomous Patrolling Robot patent.",
          sources: ["Projects", "Robotics", "Research"],
          status: "Backend unreachable. Showing offline portfolio answer."
        };
      }
      if (/internship|experience|work history|where.*worked|worked at/.test(query)) {
        return {
          answer: "Ranbir's visible experience includes IAMAI engineering work, Founder's Office Technology and AI at iora, Proeffico computer vision internship work, and rover leadership with Technocrats Robotics.",
          sources: ["Experience"],
          status: "Backend unreachable. Showing offline portfolio answer."
        };
      }
      if (/skill|skills|strongest|tech stack|technologies|tools/.test(query)) {
        return {
          answer: "Ranbir's strongest visible skill areas are AI/ML, RAG systems, computer vision, robotics, embedded systems, backend engineering, full-stack delivery, explainable ML, SQL, Supabase, Flask, Node, and deployment workflows.",
          sources: ["Skills", "Projects"],
          status: "Backend unreachable. Showing offline portfolio answer."
        };
      }
      if (/education|college|cgpa|degree|vit/.test(query)) {
        return {
          answer: "Ranbir is pursuing B.Tech Computer Science with AI and ML specialization at VIT Chennai from 2023 to 2027. His listed CGPA is 8.28 out of 10.",
          sources: ["Education"],
          status: "Backend unreachable. Showing offline portfolio answer."
        };
      }
      if (/video resume|video|watch.*resume/.test(query)) {
        return {
          answer: "Open the Video Resume section at #video-resume on the portfolio.",
          sources: ["Video Resume"],
          status: "Backend unreachable. Showing offline portfolio answer."
        };
      }
      return null;
    }

    function localPolicyChatAnswer(question) {
      var query = normalizeChatText(question);
      if (chatInjectionPattern.test(query)) {
        return { answer: chatInjectionWarning, sources: ["Safety policy"] };
      }
      if (isResumePublicContactQuery(query)) {
        return {
          answer: resumePublicContactFallback(query) + (chatPrivacyPattern.test(query) ? " " + chatPrivacyWarning : ""),
          sources: ["Hosted resume", "Contact links"]
        };
      }
      if (chatPrivacyPattern.test(query)) {
        return { answer: chatPrivacyWarning, sources: ["Privacy policy"] };
      }
      if (chatAchievementPattern.test(query)) {
        return { answer: achievementFallback(query), sources: ["Achievements", "Research"] };
      }
      return null;
    }

    function openChat(showBubble) {
      if (!chatPanel || !chatLauncher) return;
      chatbot.classList.add("chatbot-open");
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
      chatbot.classList.remove("chatbot-open");
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
      if (!text) {
        setChatStatus("Ask a question about Ranbir first.");
        if (chatInput) chatInput.focus();
        return;
      }
      if (chatSending) return;
      if (text.length > 900) {
        setChatStatus("Keep questions under 900 characters.");
        return;
      }

      var localPolicyAnswer = localPolicyChatAnswer(text);
      if (localPolicyAnswer) {
        chatLastQuestion = text;
        if (!retrying) addChatMessage("user", text);
        addChatMessage("assistant", localPolicyAnswer.answer, { sources: localPolicyAnswer.sources });
        setChatStatus("");
        if (chatInput) chatInput.value = "";
        return;
      }

      setChatSending(true);
      chatLastQuestion = text;
      setChatStatus("Thinking...");
      if (!retrying) addChatMessage("user", text);
      showTyping();

      // Primary target is the Supabase edge function (no cold start); the Render
      // Node backend stays as an automatic fallback if the edge function is
      // unreachable. Each target carries its own headers.
      var chatTargets = [];
      var primaryUrl = chatbot.getAttribute("data-chat-primary");
      var primaryKey = chatbot.getAttribute("data-chat-primary-key");
      if (primaryUrl) {
        var primaryHeaders = { "Content-Type": "application/json" };
        if (primaryKey) {
          primaryHeaders["apikey"] = primaryKey;
          primaryHeaders["Authorization"] = "Bearer " + primaryKey;
        }
        chatTargets.push({ url: primaryUrl, headers: primaryHeaders });
      }
      var fallbackUrl = resolvePortfolioEndpoint(chatbot.getAttribute("data-chat-endpoint"));
      if (fallbackUrl) chatTargets.push({ url: fallbackUrl, headers: { "Content-Type": "application/json" } });
      if (!chatTargets.length) chatTargets.push({ url: resolvePortfolioEndpoint("/api/chat"), headers: { "Content-Type": "application/json" } });
      var payload = JSON.stringify({
        conversationId: chatId(),
        message: text,
        history: chatHistoryForApi()
      });

      // The chat backend runs on a free tier that sleeps when idle. The first
      // request after a nap can 502 while the instance boots, then succeed a few
      // seconds later. So transient gateway errors are retried a couple of times
      // and the status line explains the wait rather than reading as a failure.
      var MAX_ATTEMPTS = 3;
      var RETRY_DELAYS = [3000, 5000];
      var FETCH_TIMEOUT = 9000;
      var WAKING_MESSAGE = "Waking the assistant. First reply can take up to 20 seconds.";
      var wakingTimer = null;

      function isWakingStatus(status) {
        return status === 502 || status === 503 || status === 504 || status === 0;
      }

      function armWakingNotice() {
        if (wakingTimer) return;
        wakingTimer = window.setTimeout(function () {
          if (chatSending) setChatStatus(WAKING_MESSAGE);
        }, 4000);
      }

      function clearWakingNotice() {
        if (wakingTimer) {
          window.clearTimeout(wakingTimer);
          wakingTimer = null;
        }
      }

      function finish() {
        clearWakingNotice();
        setChatSending(false);
        if (chatInput) chatInput.value = "";
      }

      function onSuccess(body) {
        clearWakingNotice();
        hideTyping();
        addChatMessage("assistant", normalizeAssistantAnswer(body.answer || chatFallback), { sources: body.sources });
        setChatStatus("");
        finish();
      }

      function onError(error) {
        clearWakingNotice();
        hideTyping();
        if (!(error && error.safeChatError)) {
          var offline = offlineChatFallback(text);
          if (offline) {
            addChatMessage("assistant", offline.answer, { sources: offline.sources });
            setChatStatus(offline.status || "");
            finish();
            return;
          }
        }
        addChatMessage("assistant", error && error.safeChatError ? error.message : chatFallback, { error: true, retry: true });
        setChatStatus("Connection issue. Retry when ready.");
        finish();
      }

      // On a transient (wake/network) failure, retry the same target with backoff;
      // once its attempts are spent, advance to the next target before giving up.
      function transientRetry(targetIndex, attemptNo, error) {
        if (attemptNo < MAX_ATTEMPTS) {
          setChatStatus(WAKING_MESSAGE);
          window.setTimeout(function () { attempt(targetIndex, attemptNo + 1); }, RETRY_DELAYS[attemptNo - 1] || 5000);
          return;
        }
        if (targetIndex + 1 < chatTargets.length) {
          attempt(targetIndex + 1, 1);
          return;
        }
        onError(error);
      }

      function attempt(targetIndex, attemptNo) {
        armWakingNotice();
        var target = chatTargets[targetIndex];
        var controller = window.AbortController ? new AbortController() : null;
        var timeout = controller ? window.setTimeout(function () {
          controller.abort();
        }, FETCH_TIMEOUT) : null;
        fetch(target.url, { method: "POST", headers: target.headers, body: payload, signal: controller ? controller.signal : undefined })
          .then(function (response) {
            if (timeout) window.clearTimeout(timeout);
            // Gateway wake statuses get retried. Auth/config/API errors on primary move to fallback.
            if (isWakingStatus(response.status)) {
              transientRetry(targetIndex, attemptNo, null);
              return null;
            }
            return response.json().catch(function () {
              return { ok: false, error: chatFallback };
            }).then(function (body) {
              if (!response.ok || !body.ok) {
                if (targetIndex + 1 < chatTargets.length) {
                  attempt(targetIndex + 1, 1);
                  return;
                }
                var safeError = new Error(portfolioApiError(body, chatFallback));
                safeError.safeChatError = true;
                throw safeError;
              }
              if (targetIndex + 1 < chatTargets.length && (isUnknownPortfolioAnswer(body.answer) || isOverSensitivePrivacyAnswer(body.answer, text))) {
                attempt(targetIndex + 1, 1);
                return;
              }
              onSuccess(body);
            });
          })
          .catch(function (error) {
            if (timeout) window.clearTimeout(timeout);
            // Network-level failure (no response): retry this target, then fall back.
            if (!(error && error.safeChatError)) {
              transientRetry(targetIndex, attemptNo, error);
              return;
            }
            onError(error);
          });
      }

      attempt(0, 1);
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
