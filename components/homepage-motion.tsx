/** Draw-on rules, conversion-flow stages, and the one-shot hero diagram. Runs without waiting on hydration. */
export const HOMEPAGE_MOTION_SCRIPT = `(function(){
  var root = document.querySelector(".home");
  if (!root) return;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function painted(el) {
    var fill = el.getAttribute("fill");
    var stroke = el.getAttribute("stroke");
    if (stroke === "none") return true;
    if (fill && fill !== "none" && (!stroke || stroke === "none")) return true;
    var dash = el.getAttribute("stroke-dasharray");
    return !!(dash && dash !== "none");
  }
  function lengthOf(el) {
    try {
      var len = el.getTotalLength();
      if (!len || !isFinite(len)) return 64;
      return len;
    } catch (e) { return 64; }
  }
  function prepDraw(node) {
    node.querySelectorAll("path, line, polyline, circle, rect, ellipse").forEach(function(el) {
      if (painted(el)) return;
      var len = lengthOf(el);
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = reduced ? "0" : String(len);
    });
  }
  function revealDraw(node) {
    node.classList.add("is-drawn");
    node.querySelectorAll("path, line, polyline, circle, rect, ellipse").forEach(function(el) {
      if (painted(el)) return;
      el.style.strokeDashoffset = "0";
    });
  }
  function revealTarget(target) {
    var strokes = target.classList.contains("draw-stroke") ? [target] : [];
    target.querySelectorAll(".draw-stroke").forEach(function(node) { strokes.push(node); });
    strokes.forEach(revealDraw);
  }
  root.querySelectorAll(".draw-stroke").forEach(prepDraw);
  var drawRoots = root.querySelectorAll(".draw-in, .graphic, .pillar, .cmp-item, .mr, .net-cluster");
  if (reduced || !("IntersectionObserver" in window)) {
    root.querySelectorAll(".draw-stroke").forEach(revealDraw);
  } else {
    var drawObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        revealTarget(entry.target);
        drawObs.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    drawRoots.forEach(function(node) { drawObs.observe(node); });
  }
  var flow = root.querySelector(".ui-flow");
  function setFlowStage(stage) {
    if (!flow) return;
    flow.classList.add("is-on");
    flow.setAttribute("data-stage", String(stage));
    if (stage >= 2) flow.querySelectorAll(".ui-row-dup").forEach(function(row) { row.classList.add("is-struck"); });
    if (stage >= 4) flow.classList.add("is-final");
  }
  function playFlow() {
    if (!flow || flow.classList.contains("is-on") || flow.classList.contains("is-final")) return;
    setFlowStage(1);
    window.setTimeout(function() { setFlowStage(2); }, 700);
    window.setTimeout(function() { setFlowStage(3); }, 1300);
    window.setTimeout(function() { setFlowStage(4); }, 1900);
  }
  if (flow) {
    if (reduced || !("IntersectionObserver" in window)) setFlowStage(4);
    else {
      var flowObs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          playFlow();
          flowObs.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.25 });
      flowObs.observe(flow);
    }
  }
  var svg = root.querySelector(".hero-diag");
  if (!svg) return;
  var lines = svg.querySelectorAll(".ch-line");
  var pulses = svg.querySelectorAll(".ch-pulse");
  lines.forEach(function(line, index) {
    var len = lengthOf(line);
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
    var pulse = pulses[index];
    if (!pulse) return;
    pulse.style.strokeDasharray = "14 " + Math.ceil(len);
    pulse.style.strokeDashoffset = "16";
    pulse.style.setProperty("--pulse-len", String(Math.round(len)));
  });
  function ready() {
    svg.classList.add("is-ready");
    lines.forEach(function(line) { line.style.strokeDashoffset = "0"; });
  }
  if (reduced || !("IntersectionObserver" in window)) { ready(); return; }
  function start() {
    if (svg.classList.contains("is-animating") || svg.classList.contains("is-ready")) return;
    svg.classList.add("is-animating");
    window.setTimeout(function() { svg.classList.add("is-ready"); }, 2500);
  }
  var heroObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      window.setTimeout(start, 300);
      heroObs.unobserve(entry.target);
    });
  }, { threshold: 0.35 });
  heroObs.observe(svg);
})();`;
