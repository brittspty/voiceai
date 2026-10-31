"use client";

import { useEffect, useRef } from "react";

type Particle = { x: number; y: number; v: number; bot: boolean; seg: number; o: number; j: number };

function brandRgb() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : "";
  if (hex.length === 6) {
    return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
  }
  return "255,88,0";
}

/** Decorative field. One still frame when the visitor prefers reduced motion. */
export function HomepageField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const surface = canvas;
    const drawContext = context;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const orange = brandRgb();
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let running = true;
    let frame = 0;

    const count = () => Math.min(reduced ? 420 : 1100, Math.round((width * height) / (reduced ? 1400 : 900)));
    const make = (x: number): Particle => {
      const roll = Math.random();
      return {
        x,
        y: height * 0.16 + Math.random() * height * 0.52,
        v: 0.25 + Math.random() * 0.45,
        bot: roll < 0.28,
        seg: (Math.random() * 3) | 0,
        o: (Math.random() - 0.5) * 26,
        j: Math.random() * 6.28,
      };
    };
    const lane = (seg: number) => height * (0.24 + seg * 0.15);
    const gate = () => width * (width > 960 ? 0.6 : 0.45);
    const keep = () => width * (width > 960 ? 0.76 : 0.7);

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = surface.clientWidth;
      height = surface.clientHeight;
      surface.width = Math.max(1, Math.floor(width * ratio));
      surface.height = Math.max(1, Math.floor(height * ratio));
      drawContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = [];
      for (let i = 0; i < count(); i++) particles.push(make(Math.random() * width));
    }

    function draw(time: number) {
      drawContext.clearRect(0, 0, width, height);
      drawContext.strokeStyle = "rgba(168,159,154,.14)";
      drawContext.lineWidth = 1;
      drawContext.beginPath();
      drawContext.moveTo(gate(), height * 0.14);
      drawContext.lineTo(gate(), height * 0.72);
      drawContext.moveTo(keep(), height * 0.14);
      drawContext.lineTo(keep(), height * 0.72);
      drawContext.stroke();
      for (const particle of particles) {
        let color = "110,101,103";
        let alpha = 1;
        let size = 1.6;
        if (particle.x < gate()) {
          alpha = 0.45 + 0.35 * (particle.x / Math.max(gate(), 1));
        } else if (particle.bot) {
          alpha = Math.max(0, 1 - (particle.x - gate()) / 70);
        } else if (particle.x < keep()) {
          color = "243,238,233";
          size = 1.9;
        } else {
          color = particle.seg === 2 ? orange : "243,238,233";
          size = particle.seg === 2 ? 2.6 : 1.9;
          alpha = particle.seg === 2 ? 1 : 0.55;
        }
        if (alpha <= 0) continue;
        drawContext.fillStyle = `rgba(${color},${alpha})`;
        const wobble = reduced ? 0 : Math.sin(particle.j + time * 0.001) * 1.2;
        drawContext.fillRect(particle.x, particle.y + wobble, size, size);
      }
      if (width > 960) {
        drawContext.font = "12px var(--font-plex-mono), 'IBM Plex Mono', monospace";
        drawContext.fillStyle = "rgba(168,159,154,.8)";
        drawContext.fillText("segment A", width - 110, lane(0) - 14);
        drawContext.fillText("segment B", width - 120, lane(1) - 14);
        drawContext.fillStyle = `rgba(${orange},.95)`;
        drawContext.fillText("segment C", width - 120, lane(2) - 14);
      }
    }

    function step() {
      for (const particle of particles) {
        particle.x += particle.v;
        particle.j += 0.01;
        if (particle.bot && particle.x > gate()) particle.y += 0.5;
        if (!particle.bot && particle.x > keep()) {
          const target = lane(particle.seg) + particle.o + Math.sin(particle.j * 3) * 4;
          particle.y += (target - particle.y) * 0.035;
        }
        if (particle.x > width + 4 || (particle.bot && particle.x > gate() + 80)) Object.assign(particle, make(-4));
      }
    }

    function loop(time: number) {
      step();
      draw(time);
      if (running) frame = requestAnimationFrame(loop);
    }

    resize();
    for (let i = 0; i < 900; i++) step();
    draw(0);

    const resizeObserver = new ResizeObserver(() => {
      if (surface.clientWidth === width && surface.clientHeight === height) return;
      resize();
      for (let i = 0; i < 900; i++) step();
      draw(0);
    });
    resizeObserver.observe(surface);

    const onHide = () => {
      if (!document.hidden) return;
      running = false;
      cancelAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onHide);

    let intersection: IntersectionObserver | undefined;
    if (!reduced) {
      intersection = new IntersectionObserver((entries) => {
        const visible = entries[0]?.isIntersecting;
        if (visible && !running) {
          running = true;
          frame = requestAnimationFrame(loop);
        } else if (!visible) {
          running = false;
          cancelAnimationFrame(frame);
        }
      });
      intersection.observe(surface);
      frame = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return <canvas ref={ref} id="field" aria-hidden="true" />;
}
