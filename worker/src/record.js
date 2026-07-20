import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { prepareInput } from "./input.js";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path || "ffmpeg";

/**
 * @param {{
 *   id: string,
 *   outDir: string,
 *   input: any,
 *   options: any,
 *   steps?: Array<{ action: string, selector?: string, value?: string, ms?: number }>,
 * }} args
 */
export async function runJob({ id, outDir, input, options, steps }) {
  const opts = withPreset(options || {});
  const prep = await prepareInput(input, path.join(outDir, "src"));
  const targetUrl = prep.url;

  const videoDir = path.join(outDir, "video");
  await fs.mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
  });

  let webmPath = null;
  const startedAt = Date.now();

  try {
    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.deviceScaleFactor,
      colorScheme: opts.darkMode ? "dark" : "light",
      reducedMotion: "no-preference",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      recordVideo: { dir: videoDir, size: { width: opts.width, height: opts.height } },
    });

    const page = await context.newPage();

    await page.goto(targetUrl, { waitUntil: opts.waitUntil, timeout: 45_000 });

    // Wait for fonts + a settle beat.
    await page.evaluate(async () => {
      try { await document.fonts.ready; } catch { }
      await new Promise((r) => setTimeout(r, 400));
    });

    if (opts.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 15_000 }).catch(() => { });
    }
    if (opts.extraWaitMs) await page.waitForTimeout(opts.extraWaitMs);

    // Kill smooth-scroll CSS + banners.
    await page.addStyleTag({
      content: `
        html, body { scroll-behavior: auto !important; }
        ${(opts.hideSelectors || []).map((s) => `${s}{display:none!important}`).join("")}
      `,
    });

    // Click-flow: replay any recorded actions (login, form fill, nav) before the
    // auto-scroll pass, on the same page/context so it's one continuous recording.
    if (steps && steps.length) {
      await runSteps(page, steps);
    }

    // Detect sections + headings + hero.
    const targets = await page.evaluate(() => {
      const vh = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const pts = new Set([0]);
      const push = (y) => { if (y > 8 && y < total - vh) pts.add(Math.round(y)); };
      const sels = "section, [data-section], main > *, header, footer, h1, h2, .hero, [class*='hero']";
      document.querySelectorAll(sels).forEach((el) => {
        const r = el.getBoundingClientRect();
        push(r.top + window.scrollY - 32);
      });
      const arr = [...pts].sort((a, b) => a - b);
      const dedup = arr.filter((y, i) => i === 0 || y - arr[i - 1] > 120);
      return { total, vh, points: dedup };
    });

    // Build timeline of segments.
    const timeline = buildTimeline(targets, opts);

    // Cap total duration.
    let acc = 0;
    const capped = [];
    for (const seg of timeline) {
      if (acc + seg.duration > opts.maxDurationSec * 1000) break;
      capped.push(seg);
      acc += seg.duration;
    }

    // Execute the scroll pass.
    await runTimeline(page, capped);

    // Final beat so the last frame breathes.
    await page.waitForTimeout(600);

    await context.close();

    // Locate the video file (Playwright writes a randomly-named .webm on close).
    const files = await fs.readdir(videoDir);
    const webm = files.find((f) => f.endsWith(".webm"));
    if (!webm) throw new Error("No video captured");
    webmPath = path.join(videoDir, webm);

    // Transcode to MP4.
    const mp4Path = path.join(outDir, "out.mp4");
    const posterPath = path.join(outDir, "poster.jpg");
    await transcode(webmPath, mp4Path, opts.fps);
    await extractPoster(mp4Path, posterPath).catch(() => { });

    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    return { mp4: mp4Path, poster: posterPath, durationSec };
  } finally {
    await browser.close().catch(() => { });
    await prep.cleanup?.().catch(() => { });
    if (webmPath) await fs.rm(webmPath, { force: true }).catch(() => { });
  }
}

function withPreset(o) {
  const isLite = !!process.env.RENDER || o.preset === "lite";
  const preset = o.preset || (isLite ? "lite" : "editorial");
  const base = isLite
    ? { width: 1024, height: 640, deviceScaleFactor: 1, fps: 30, maxDurationSec: 18, easing: "cubic-bezier(.22,.61,.36,1)", waitUntil: "domcontentloaded" }
    : { width: 1440, height: 900, deviceScaleFactor: 2, fps: 60, maxDurationSec: 30, easing: "cubic-bezier(.22,.61,.36,1)", waitUntil: "load" };
  const p = preset === "cinematic"
    ? { scrollSpeedPxPerSec: 500, sectionHoldMs: 1100, headingHoldMs: 700 }
    : preset === "lite"
      ? { scrollSpeedPxPerSec: 900, sectionHoldMs: 500, headingHoldMs: 280 }
      : { scrollSpeedPxPerSec: 800, sectionHoldMs: 700, headingHoldMs: 400 };
  return { ...base, ...p, ...o };
}

function buildTimeline({ total, vh, points }, opts) {
  const target = Math.max(0, total - vh);
  // Ensure the final resting point is bottom.
  const pts = [...points, target].filter((y, i, a) => i === 0 || y - a[i - 1] > 60);
  const segments = [];
  for (let i = 1; i < pts.length; i++) {
    const from = pts[i - 1];
    const to = pts[i];
    const distance = Math.max(1, Math.abs(to - from));
    const speed = opts.scrollSpeedPxPerSec || 800;
    const dur = Math.min(4500, Math.max(500, (distance / speed) * 1000));
    segments.push({ kind: "scroll", from, to, duration: dur, easing: opts.easing });
    // Hold at every point; longer at first + last, shorter mid-scroll.
    const isEdge = i === pts.length - 1;
    segments.push({ kind: "hold", y: to, duration: isEdge ? opts.sectionHoldMs || 700 : opts.headingHoldMs || 400 });
  }
  return segments;
}

/**
 * Replays a sequence of real interactions (click, fill, hover, navigate, scroll-to)
 * on the live page so click-flows — logins, signups, checkouts — can be captured,
 * not just a passive scroll of a static page.
 * @param {import("playwright").Page} page
 * @param {Array<{ action: string, selector?: string, value?: string, ms?: number }>} steps
 */
async function runSteps(page, steps) {
  for (const step of steps) {
    try {
      switch (step.action) {
        case "click":
          await page.click(step.selector, { timeout: 10_000 });
          break;
        case "fill":
          await page.fill(step.selector, step.value ?? "", { timeout: 10_000 });
          break;
        case "press":
          if (step.selector) await page.locator(step.selector).press(step.value ?? "Enter");
          else await page.keyboard.press(step.value ?? "Enter");
          break;
        case "hover":
          await page.hover(step.selector, { timeout: 10_000 });
          break;
        case "waitFor":
          await page.waitForSelector(step.selector, { timeout: step.ms || 10_000 });
          break;
        case "wait":
          await page.waitForTimeout(step.ms ?? 500);
          break;
        case "goto":
          await page.goto(step.value, { waitUntil: "load", timeout: 30_000 });
          break;
        case "scrollTo":
          if (step.selector) {
            await page.locator(step.selector).scrollIntoViewIfNeeded({ timeout: 10_000 });
          } else if (step.value) {
            const y = Number(step.value) || 0;
            await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
          }
          break;
      }
    } catch (err) {
      console.warn(`[SmoothRecord] step "${step.action}" failed:`, err instanceof Error ? err.message : err);
    }
    // Small breathing hold so the action reads clearly on camera.
    if (step.action !== "wait") await page.waitForTimeout(350);
  }
}

async function runTimeline(page, timeline) {
  await page.evaluate((tl) => {
    return new Promise((resolve) => {
      const easings = {
        "cubic-bezier(.22,.61,.36,1)": (t) => {
          // approximation
          return 1 - Math.pow(1 - t, 3);
        },
      };
      const easeFor = (e) => easings[e] || ((t) => t);
      let i = 0;
      const step = () => {
        if (i >= tl.length) return resolve(null);
        const seg = tl[i++];
        if (seg.kind === "hold") {
          window.scrollTo(0, seg.y);
          // Micro-parallax breath: small sinusoidal offset.
          const startY = seg.y;
          const start = performance.now();
          const dur = seg.duration;
          const breathe = () => {
            const t = performance.now() - start;
            if (t >= dur) return step();
            const offset = Math.sin((t / dur) * Math.PI) * 4;
            window.scrollTo(0, startY + offset);
            requestAnimationFrame(breathe);
          };
          requestAnimationFrame(breathe);
        } else {
          const ease = easeFor(seg.easing);
          const start = performance.now();
          const { from, to, duration } = seg;
          const anim = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const y = from + (to - from) * ease(t);
            window.scrollTo(0, y);
            if (t < 1) requestAnimationFrame(anim);
            else step();
          };
          requestAnimationFrame(anim);
        }
      };
      step();
    });
  }, timeline);
}

function transcode(inputPath, outputPath, fps) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-r", String(fps),
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      outputPath,
    ];
    const p = spawn(FFMPEG, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

function extractPoster(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", inputPath, "-ss", "0.5", "-vframes", "1", "-q:v", "3", outputPath];
    const p = spawn(FFMPEG, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg poster exited ${code}`))));
  });
}
