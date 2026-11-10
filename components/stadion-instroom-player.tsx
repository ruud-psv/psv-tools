"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Tag, ZoomIn, ZoomOut } from "lucide-react";
import tokens from "@psv/branding/tokens/tokens.json";
import { areaCenter, FIELD_FILL } from "@/lib/aangrenzende-stoelen/stadium";
import { areaPolygon } from "@/lib/instroom/geometry";
import type { Replay } from "@/lib/instroom/replay-types";
import { buildScene, enteredAt, scanHistogram } from "@/lib/instroom/scene";

/**
 * Het stadion met elke stoel als punt, en een tijdlijn die ze laat oplichten op
 * het moment van de scan.
 *
 * Getekend op een canvas: ruim 35.000 stoelen is te veel voor losse elementen.
 * Drie lagen, zodat een beeld weinig werk is: de stoelen in rust (alleen opnieuw
 * bij een ander formaat of zoom), de stoelen die al binnen zijn (groeit mee met
 * de tijdlijn), en daarbovenop wie er net binnenkomt.
 */

/** Het deel van de plattegrond dat in beeld moet: de tribunes met een kleine marge. */
const VIEW = { x: 270, y: 170, w: 1455, h: 1162 };
const FIELD = { x: 587, y: 492, w: 823, h: 491 };

/** Een canvas kent geen Tailwind-classes; de kleuren komen rechtstreeks uit de PSV-tokens. */
const COLORS = {
  background: tokens.color.neutralDark,
  outline: tokens.color.gray["11"],
  empty: tokens.color.gray["11"],
  sold: tokens.color.gray["10"],
  entered: tokens.color.red.primary,
  fresh: tokens.color.white,
  label: tokens.color.white,
  demo: tokens.color.gold,
};

const SPEEDS = [30, 60, 120, 300, 600];
const MAX_ZOOM = 12;
/** Hoe lang een net gescande stoel wit blijft, in echte seconden. */
const FLASH_SECONDS = 0.7;
const HISTOGRAM_BINS = 160;

const number = new Intl.NumberFormat("nl-NL");
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** `1:12:30` of `47:30`. */
function duration(seconds: number): string {
  const total = Math.round(Math.abs(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** De snelheid waarbij de hele tijdlijn ongeveer anderhalve minuut duurt. */
function defaultSpeed(length: number): number {
  const wanted = length / 95;
  return SPEEDS.reduce((best, speed) => (Math.abs(speed - wanted) < Math.abs(best - wanted) ? speed : best));
}

interface View {
  /** Zoom: 1 is het hele stadion in beeld. */
  k: number;
  /** Het punt van de plattegrond in het midden van het scherm. */
  cx: number;
  cy: number;
}

const HOME: View = { k: 1, cx: VIEW.x + VIEW.w / 2, cy: VIEW.y + VIEW.h / 2 };

function clampView(view: View): View {
  const k = Math.min(Math.max(view.k, 1), MAX_ZOOM);
  // Ingezoomd mag het midden niet verder dan de rand van de plattegrond.
  const slackX = (VIEW.w / 2) * (1 - 1 / k);
  const slackY = (VIEW.h / 2) * (1 - 1 / k);
  return {
    k,
    cx: Math.min(Math.max(view.cx, HOME.cx - slackX), HOME.cx + slackX),
    cy: Math.min(Math.max(view.cy, HOME.cy - slackY), HOME.cy + slackY),
  };
}

export function StadionInstroomPlayer({ replay }: { replay: Replay }) {
  const scene = useMemo(() => buildScene(replay.areas), [replay]);
  /** De plekken met een geldige kaart, voor de laag in rust. */
  const soldSeats = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < scene.count; i++) if (scene.sold[i]) indices.push(i);
    return Uint32Array.from(indices);
  }, [scene]);
  const histogram = useMemo(
    () => scanHistogram(scene.orderTimes, replay.duration, HISTOGRAM_BINS),
    [scene, replay.duration]
  );
  const startMs = useMemo(() => new Date(replay.start).getTime(), [replay.start]);
  const kickoffMs = useMemo(() => (replay.match.kickoff ? new Date(replay.match.kickoff).getTime() : null), [replay]);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<{ base: HTMLCanvasElement; lit: HTMLCanvasElement } | null>(null);
  const viewRef = useRef<View>(HOME);
  const nowRef = useRef(0);
  /** Tot welke plek in `scene.order` de laag met binnengekomen stoelen is getekend. */
  const litRef = useRef(0);
  const speedRef = useRef(defaultSpeed(replay.duration));
  const labelsRef = useRef(false);

  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(speedRef.current);
  const [labels, setLabels] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  /* ---------- Tekenen ---------- */

  /** Van de plattegrond naar pixels van het canvas. */
  const projection = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { k, cx, cy } = viewRef.current;
    const scale = Math.min(canvas.width / VIEW.w, canvas.height / VIEW.h) * k;
    return { scale, ox: canvas.width / 2 - cx * scale, oy: canvas.height / 2 - cy * scale, w: canvas.width, h: canvas.height };
  }, []);

  /** Tekent de plekken `indices[from..to)` als vierkantjes; `grow` maakt ze groter. */
  const drawSeats = useCallback(
    (ctx: CanvasRenderingContext2D, indices: Uint32Array | null, from: number, to: number, grow = 1) => {
      const p = projection();
      if (!p) return;
      const minimum = window.devicePixelRatio || 1;
      for (let n = from; n < to; n++) {
        const i = indices ? indices[n] : n;
        const side = Math.max(scene.size[i] * p.scale, minimum) * grow;
        const x = scene.x[i] * p.scale + p.ox;
        const y = scene.y[i] * p.scale + p.oy;
        if (x < -side || y < -side || x > p.w + side || y > p.h + side) continue;
        ctx.fillRect(x - side / 2, y - side / 2, side, side);
      }
    },
    [projection, scene]
  );

  const renderBase = useCallback(() => {
    const layers = layersRef.current;
    const p = projection();
    if (!layers || !p) return;
    const ctx = layers.base.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, p.w, p.h);

    // Het veld en de omtrek van de vakken, in de maten van de plattegrond.
    ctx.setTransform(p.scale, 0, 0, p.scale, p.ox, p.oy);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = FIELD_FILL;
    ctx.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(FIELD.x + 35, FIELD.y + 35, FIELD.w - 70, FIELD.h - 70);

    // De wedstrijd staat op het veld: daar is ruimte, en hij zoomt en schuift mee.
    const title = replay.match.name.toUpperCase();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.label;
    ctx.font = "64px psv-condensed, sans-serif";
    const titleSize = Math.min(64, (64 * (FIELD.w - 160)) / Math.max(ctx.measureText(title).width, 1));
    const centerX = FIELD.x + FIELD.w / 2;
    const centerY = FIELD.y + FIELD.h / 2;
    ctx.globalAlpha = 0.55;
    ctx.font = "24px psv-condensed, sans-serif";
    ctx.fillText("INSTROOM PHILIPS STADION", centerX, centerY - titleSize / 2 - 26);
    ctx.globalAlpha = 0.92;
    ctx.font = `${titleSize}px psv-condensed, sans-serif`;
    ctx.fillText(title, centerX, centerY + 4);
    if (replay.demo) {
      ctx.fillStyle = COLORS.demo;
      ctx.globalAlpha = 1;
      ctx.font = "26px psv-condensed, sans-serif";
      ctx.fillText("VOORBEELD · GEEN ECHTE SCANS", centerX, centerY + titleSize / 2 + 34);
    }

    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1 / p.scale;
    for (const shape of scene.shapes) {
      const polygon = areaPolygon(shape);
      ctx.beginPath();
      polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Eerst alle plekken in de kleur van "geen kaart", daar overheen de verkochte.
    ctx.fillStyle = COLORS.empty;
    drawSeats(ctx, null, 0, scene.count);
    ctx.fillStyle = COLORS.sold;
    drawSeats(ctx, soldSeats, 0, soldSeats.length);
  }, [drawSeats, projection, replay.demo, replay.match.name, scene, soldSeats]);

  /** Werkt de laag met binnengekomen stoelen bij tot de tijd van nu. */
  const syncLit = useCallback(() => {
    const layers = layersRef.current;
    const ctx = layers?.lit.getContext("2d");
    if (!layers || !ctx) return;
    const upTo = enteredAt(scene.orderTimes, nowRef.current);
    // Terug in de tijd: opnieuw vanaf het begin.
    if (upTo < litRef.current) {
      ctx.clearRect(0, 0, layers.lit.width, layers.lit.height);
      litRef.current = 0;
    }
    ctx.fillStyle = COLORS.entered;
    drawSeats(ctx, scene.order, litRef.current, upTo);
    litRef.current = upTo;
  }, [drawSeats, scene]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const layers = layersRef.current;
    const ctx = canvas?.getContext("2d");
    const p = projection();
    if (!canvas || !layers || !ctx || !p) return;

    syncLit();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(layers.base, 0, 0);
    ctx.drawImage(layers.lit, 0, 0);

    // Wie net binnenkomt: even wit en groter, daarna vervaagt het naar rood.
    const flash = Math.max(FLASH_SECONDS * speedRef.current, 1);
    const from = enteredAt(scene.orderTimes, nowRef.current - flash);
    ctx.fillStyle = COLORS.fresh;
    for (let n = from; n < litRef.current; n++) {
      const age = (nowRef.current - scene.orderTimes[n]) / flash;
      ctx.globalAlpha = Math.max(1 - age, 0);
      drawSeats(ctx, scene.order, n, n + 1, 1.9);
    }
    ctx.globalAlpha = 1;

    if (labelsRef.current) {
      const fontSize = Math.max(22 * p.scale, 11 * (window.devicePixelRatio || 1));
      ctx.font = `${fontSize}px psv-condensed, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = fontSize / 4;
      ctx.strokeStyle = COLORS.background;
      ctx.fillStyle = COLORS.label;
      for (const shape of scene.shapes) {
        const [cx, cy] = areaCenter(shape);
        const name = shape.area === "BEZOEKERS" ? "BEZOEKERS" : shape.area;
        ctx.strokeText(name, cx * p.scale + p.ox, cy * p.scale + p.oy);
        ctx.fillText(name, cx * p.scale + p.ox, cy * p.scale + p.oy);
      }
    }
  }, [drawSeats, projection, scene, syncLit]);

  /** Na een ander formaat of een andere zoom: alle lagen opnieuw. */
  const rebuild = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(Math.round(stage.clientWidth * ratio), 1);
    const height = Math.max(Math.round(stage.clientHeight * ratio), 1);
    if (!layersRef.current) {
      layersRef.current = { base: document.createElement("canvas"), lit: document.createElement("canvas") };
    }
    for (const layer of [canvas, layersRef.current.base, layersRef.current.lit]) {
      layer.width = width;
      layer.height = height;
    }
    litRef.current = 0;
    renderBase();
    draw();
  }, [draw, renderBase]);

  // Een andere wedstrijd: terug naar het begin.
  useEffect(() => {
    nowRef.current = 0;
    viewRef.current = HOME;
    speedRef.current = defaultSpeed(replay.duration);
    setNow(0);
    setPlaying(false);
    setSpeed(speedRef.current);
    setZoomed(false);
  }, [replay]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    rebuild();
    const observer = new ResizeObserver(rebuild);
    observer.observe(stage);
    // De naam op het veld staat in het PSV-lettertype; is dat nog niet geladen, dan daarna opnieuw.
    let mounted = true;
    void document.fonts?.ready.then(() => mounted && rebuild());
    return () => {
      mounted = false;
      observer.disconnect();
    };
  }, [rebuild]);

  /* ---------- Afspelen ---------- */

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (time: number) => {
      // Een tabblad op de achtergrond staat stil; daarna geen sprong vooruit.
      const elapsed = Math.min((time - last) / 1000, 0.1);
      last = time;
      nowRef.current = Math.min(nowRef.current + elapsed * speedRef.current, replay.duration);
      draw();
      const finished = nowRef.current >= replay.duration;
      // De klok en de teller hoeven niet bij elk beeld mee.
      if (finished || time - lastUi > 90) {
        lastUi = time;
        setNow(nowRef.current);
      }
      if (finished) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw, playing, replay.duration]);

  const seek = useCallback(
    (value: number) => {
      nowRef.current = Math.min(Math.max(value, 0), replay.duration);
      setNow(nowRef.current);
      draw();
    },
    [draw, replay.duration]
  );

  const togglePlay = useCallback(() => {
    setPlaying((current) => {
      // Aan het eind opnieuw beginnen.
      if (!current && nowRef.current >= replay.duration) {
        nowRef.current = 0;
        setNow(0);
      }
      return !current;
    });
  }, [replay.duration]);

  /* ---------- Zoomen en schuiven ---------- */

  const setView = useCallback(
    (next: View) => {
      viewRef.current = clampView(next);
      setZoomed(viewRef.current.k > 1);
      rebuild();
    },
    [rebuild]
  );

  /** Zoomt rond een punt op het scherm (in pixels van het canvas), zodat dat punt blijft staan. */
  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) => {
      const p = projection();
      if (!p) return;
      const view = viewRef.current;
      const k = Math.min(Math.max(view.k * factor, 1), MAX_ZOOM);
      const x = px ?? p.w / 2;
      const y = py ?? p.h / 2;
      const mapX = (x - p.ox) / p.scale;
      const mapY = (y - p.oy) / p.scale;
      const scale = (p.scale / view.k) * k;
      setView({ k, cx: mapX - (x - p.w / 2) / scale, cy: mapY - (y - p.h / 2) / scale });
    },
    [projection, setView]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Het wiel scrolt normaal de pagina. Zoomen alleen in volledig scherm of met
    // Ctrl/Cmd, anders blijf je op de pagina hangen zodra de muis boven het stadion is.
    const onWheel = (event: WheelEvent) => {
      if (!document.fullscreenElement && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      zoomAt(Math.exp(-event.deltaY * 0.0015), (event.clientX - rect.left) * ratio, (event.clientY - rect.top) * ratio);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const dragRef = useRef<{ x: number; y: number; view: View } | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewRef.current.k <= 1) return;
    dragRef.current = { x: event.clientX, y: event.clientY, view: viewRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const p = projection();
    if (!drag || !p) return;
    const ratio = window.devicePixelRatio || 1;
    setView({
      k: drag.view.k,
      cx: drag.view.cx - ((event.clientX - drag.x) * ratio) / p.scale,
      cy: drag.view.cy - ((event.clientY - drag.y) * ratio) / p.scale,
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  /* ---------- Volledig scherm, vaknamen, toetsen ---------- */

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const toggleLabels = () => {
    labelsRef.current = !labelsRef.current;
    setLabels(labelsRef.current);
    draw();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // Een knop, de schuif of de keuzelijst handelt zijn eigen toetsen af.
    if (target !== event.currentTarget && ["BUTTON", "INPUT", "SELECT"].includes(target.tagName)) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    }
  };

  /* ---------- Cijfers ---------- */

  const entered = enteredAt(scene.orderTimes, now);
  const sold = replay.totals.sold;
  const wallClock = clock.format(new Date(startMs + now * 1000));
  const toKickoff = kickoffMs === null ? null : (kickoffMs - startMs) / 1000 - now;
  const kickoffShare =
    kickoffMs !== null && replay.duration > 0 ? (kickoffMs - startMs) / 1000 / replay.duration : null;
  const progress = replay.duration > 0 ? now / replay.duration : 0;
  const peak = Math.max(...histogram, 1);

  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-psv-white/25 bg-psv-neutralDark/85 text-psv-white transition-colors hover:bg-psv-gray-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-psv-white disabled:opacity-40 disabled:hover:bg-psv-neutralDark/85";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`flex flex-col overflow-hidden bg-psv-neutralDark text-psv-white outline-none ${
        fullscreen ? "h-screen w-screen" : "h-[calc(100vh-17rem)] min-h-[480px] rounded-lg"
      }`}
    >
      <div
        ref={stageRef}
        className={`relative min-h-0 flex-1 touch-none ${zoomed ? "cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setView(HOME)}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Plattegrond van het Philips Stadion met alle stoelen. Om ${wallClock} zijn er ${number.format(
            entered
          )} van de ${number.format(sold)} verkochte plaatsen gescand.`}
        />

        <div className="absolute right-4 top-4 flex gap-2" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className={iconButton} onClick={() => zoomAt(1 / 1.6)} disabled={!zoomed} aria-label="Zoom uit">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" className={iconButton} onClick={() => zoomAt(1.6)} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${iconButton} ${labels ? "border-psv-white bg-psv-gray-11" : ""}`}
            onClick={toggleLabels}
            aria-pressed={labels}
            aria-label="Vaknamen tonen"
          >
            <Tag className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Volledig scherm sluiten" : "Volledig scherm"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-psv-white/15 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-psv-red-primary text-psv-white transition-colors hover:bg-psv-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-psv-white"
            aria-label={playing ? "Pauzeer" : "Speel af"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
          </button>
          <button type="button" className={iconButton} onClick={() => seek(0)} aria-label="Terug naar het begin">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-[7.5rem]">
          <p className="font-heading text-3xl leading-none tabular-nums">{wallClock}</p>
          <p className="mt-1 text-xs text-psv-white/70 tabular-nums">
            {toKickoff === null
              ? "aftrap onbekend"
              : toKickoff >= 0
                ? `${duration(toKickoff)} voor de aftrap`
                : `${duration(toKickoff)} na de aftrap`}
          </p>
        </div>

        <div className="relative h-14 min-w-[12rem] flex-1">
          <svg
            viewBox={`0 0 ${HISTOGRAM_BINS} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {histogram.map((count, bin) => {
              const height = (count / peak) * 92;
              const passed = (bin + 0.5) / HISTOGRAM_BINS <= progress;
              return (
                <rect
                  key={bin}
                  x={bin + 0.12}
                  y={100 - height}
                  width={0.76}
                  height={height}
                  className={passed ? "fill-psv-red-primary" : "fill-psv-gray-10"}
                />
              );
            })}
          </svg>
          {kickoffShare !== null && kickoffShare >= 0 && kickoffShare <= 1 && (
            <div
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-psv-gold"
              style={{ left: `${kickoffShare * 100}%` }}
            >
              <span className="absolute -top-0.5 left-1 whitespace-nowrap font-heading text-[10px] uppercase tracking-wide text-psv-gold">
                Aftrap
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-psv-white" style={{ left: `${progress * 100}%` }} />
          <input
            type="range"
            min={0}
            max={Math.max(replay.duration, 1)}
            step={1}
            value={Math.round(now)}
            onChange={(event) => seek(Number(event.target.value))}
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Tijdlijn"
            aria-valuetext={wallClock}
          />
          <div className="pointer-events-none absolute inset-0 rounded-sm ring-psv-white peer-focus-visible:ring-2" />
        </div>

        <div className="min-w-[9rem]">
          <p className="font-heading text-3xl leading-none tabular-nums">{number.format(entered)}</p>
          <p className="mt-1 text-xs text-psv-white/70 tabular-nums">
            binnen van {number.format(sold)} verkocht{sold > 0 ? ` · ${percent.format(entered / sold)}` : ""}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-psv-white/70">
          <span className="font-heading uppercase tracking-wide">Snelheid</span>
          <select
            value={speed}
            onChange={(event) => {
              speedRef.current = Number(event.target.value);
              setSpeed(speedRef.current);
            }}
            className="h-9 rounded-md border border-psv-white/25 bg-psv-neutralDark px-2 font-heading text-sm text-psv-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-psv-white"
          >
            {SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
