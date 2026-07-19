import Fastify from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { runJob } from "./record.js";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.WORKER_TOKEN;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const ROOT = "/tmp/smoothrecord/jobs";
const TTL = Number(process.env.JOB_TTL_MS || 24 * 60 * 60 * 1000);

if (!TOKEN) {
  console.warn("[smoothrecord] WORKER_TOKEN not set — refusing to boot.");
  process.exit(1);
}
await fs.mkdir(ROOT, { recursive: true });

// in-memory job registry; state also persisted to disk as job.json
/** @type {Map<string, any>} */
const jobs = new Map();

async function loadPersistedJobs() {
  const entries = await fs.readdir(ROOT).catch(() => []);
  for (const id of entries) {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(ROOT, id, "job.json"), "utf8"));
      jobs.set(id, meta);
    } catch {}
  }
}
await loadPersistedJobs();

async function persist(job) {
  await fs.mkdir(path.join(ROOT, job.id), { recursive: true });
  await fs.writeFile(path.join(ROOT, job.id, "job.json"), JSON.stringify(job, null, 2));
}

setInterval(async () => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL) {
      jobs.delete(id);
      await fs.rm(path.join(ROOT, id), { recursive: true, force: true }).catch(() => {});
    }
  }
}, 60 * 60 * 1000).unref();

const app = Fastify({ logger: true, bodyLimit: 3 * 1024 * 1024 });

const OptionsSchema = z.object({
  preset: z.enum(["editorial", "cinematic", "lite", "custom"]).default("editorial"),
  width: z.number().int().min(320).max(3840).default(1440),
  height: z.number().int().min(240).max(2160).default(900),
  deviceScaleFactor: z.number().min(1).max(3).default(2),
  fps: z.number().int().min(24).max(60).default(60),
  maxDurationSec: z.number().int().min(3).max(120).default(30),
  scrollSpeedPxPerSec: z.number().int().min(100).max(4000).optional(),
  sectionHoldMs: z.number().int().min(0).max(5000).optional(),
  headingHoldMs: z.number().int().min(0).max(5000).optional(),
  easing: z.string().optional(),
  waitForSelector: z.string().optional(),
  extraWaitMs: z.number().int().min(0).max(30_000).optional(),
  hideSelectors: z.array(z.string()).optional(),
  darkMode: z.boolean().optional(),
}).partial().default({});

const InputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: z.string().url() }),
  z.object({ type: z.literal("html"), html: z.string().min(20).max(1_500_000) }),
  z.object({ type: z.literal("zip"), zipUrl: z.string().url() }),
  z.object({
    type: z.literal("repo"),
    gitUrl: z.string().url(),
    branch: z.string().max(200).optional(),
    buildCmd: z.string().max(500).optional(),
    outputDir: z.string().max(200).optional(),
  }),
]);

const Body = z.object({
  input: InputSchema,
  options: OptionsSchema,
  callbackUrl: z.string().url().optional(),
});

app.addHook("onRequest", async (req, reply) => {
  const url = req.raw.url || "";
  if (url.startsWith("/healthz") || url.startsWith("/files/")) return;
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/healthz", async () => ({ ok: true, jobs: jobs.size }));

app.post("/jobs", async (req, reply) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });

  const id = `job_${nanoid(16)}`;
  const job = {
    id,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    input: parsed.data.input,
    options: parsed.data.options,
    callbackUrl: parsed.data.callbackUrl || null,
  };
  jobs.set(id, job);
  await persist(job);

  // Fire and forget
  process.nextTick(() => processJob(id).catch((e) => app.log.error(e)));

  return reply.code(202).send({ jobId: id, status: "queued" });
});

app.get("/jobs/:id", async (req, reply) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job) return reply.code(404).send({ error: "Not found" });
  const base = PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    durationSec: job.durationSec ?? null,
    mp4Url: job.mp4 ? `${base}/files/${id}/out.mp4` : null,
    posterUrl: job.poster ? `${base}/files/${id}/poster.jpg` : null,
    error: job.error ?? null,
  };
});

app.get("/files/:id/:name", async (req, reply) => {
  const { id, name } = req.params;
  if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(name)) return reply.code(400).send();
  const file = path.join(ROOT, id, name);
  try {
    await fs.access(file);
  } catch {
    return reply.code(404).send({ error: "Not found" });
  }
  const type = name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream";
  reply.header("Content-Type", type).header("Cache-Control", "public, max-age=86400");
  return reply.send(createReadStream(file));
});

async function processJob(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "running";
  job.updatedAt = Date.now();
  await persist(job);

  try {
    const outDir = path.join(ROOT, id);
    await fs.mkdir(outDir, { recursive: true });
    const HARD_TIMEOUT_MS = Number(process.env.JOB_HARD_TIMEOUT_MS || 3 * 60 * 1000);
    const result = await Promise.race([
      runJob({ id, outDir, input: job.input, options: job.options }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Job exceeded ${HARD_TIMEOUT_MS}ms hard timeout`)), HARD_TIMEOUT_MS)),
    ]);
    job.status = "succeeded";
    job.mp4 = result.mp4;
    job.poster = result.poster;
    job.durationSec = result.durationSec;
  } catch (e) {
    job.status = "failed";
    job.error = e instanceof Error ? e.message : String(e);
    app.log.error(e);
  }
  job.updatedAt = Date.now();
  await persist(job);

  if (job.callbackUrl) {
    fetch(job.callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: job.id, status: job.status, error: job.error ?? null,
        durationSec: job.durationSec ?? null,
      }),
    }).catch(() => {});
  }
}

app.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
