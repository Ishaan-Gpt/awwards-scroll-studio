import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const OptionsSchema = z.object({
  preset: z.enum(["editorial", "cinematic", "custom"]).optional().default("editorial"),
  width: z.number().int().min(320).max(3840).optional().default(1440),
  height: z.number().int().min(240).max(2160).optional().default(900),
  deviceScaleFactor: z.number().min(1).max(3).optional().default(2),
  fps: z.number().int().min(24).max(60).optional().default(60),
  maxDurationSec: z.number().int().min(3).max(120).optional().default(30),
  scrollSpeedPxPerSec: z.number().int().min(100).max(4000).optional(),
  sectionHoldMs: z.number().int().min(0).max(5000).optional(),
  headingHoldMs: z.number().int().min(0).max(5000).optional(),
  easing: z.string().optional(),
  waitForSelector: z.string().optional(),
  extraWaitMs: z.number().int().min(0).max(30_000).optional(),
  hideSelectors: z.array(z.string()).optional(),
  darkMode: z.boolean().optional(),
}).optional().default({});

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

const StepSchema = z.object({
  action: z.enum(["click", "fill", "press", "hover", "waitFor", "wait", "goto", "scrollTo"]),
  selector: z.string().max(500).optional(),
  value: z.string().max(2000).optional(),
  ms: z.number().int().min(0).max(30_000).optional(),
});

const Body = z.object({
  input: InputSchema,
  options: OptionsSchema,
  steps: z.array(StepSchema).max(50).optional(),
  callbackUrl: z.string().url().optional(),
});

export const Route = createFileRoute("/api/public/record")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        const workerUrl = process.env.WORKER_BASE_URL;
        const workerToken = process.env.WORKER_TOKEN;

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid request", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        // No worker configured yet — return a helpful, non-crashing response.
        if (!workerUrl || !workerToken) {
          const jobId = `demo_${crypto.randomUUID()}`;
          return Response.json(
            {
              jobId,
              statusUrl: `/api/public/record/${jobId}`,
              worker: "not_configured",
              hint: "Deploy the /worker service and set WORKER_BASE_URL + WORKER_TOKEN. See /docs.",
            },
            { status: 202 },
          );
        }

        try {
          const res = await fetch(`${workerUrl.replace(/\/$/, "")}/jobs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${workerToken}`,
            },
            body: JSON.stringify(parsed.data),
          });
          const text = await res.text();
          if (!res.ok) {
            console.error(`Worker rejected job [${res.status}]: ${text}`);
            return Response.json({ error: "Worker error", status: res.status, body: text }, { status: 502 });
          }
          const body = JSON.parse(text);
          return Response.json({
            jobId: body.jobId ?? body.id,
            statusUrl: `/api/public/record/${body.jobId ?? body.id}`,
          });
        } catch (e) {
          console.error("Worker unreachable:", e);
          return Response.json({ error: "Worker unreachable" }, { status: 502 });
        }
      },
    },
  },
});
