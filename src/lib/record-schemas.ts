import { z } from "zod";

export const OptionsSchema = z.object({
  preset: z.enum(["editorial", "cinematic", "lite", "custom"]).optional().default("editorial"),
  width: z.number().int().min(320).max(3840).optional(),
  height: z.number().int().min(240).max(2160).optional(),
  deviceScaleFactor: z.number().min(1).max(3).optional(),
  fps: z.number().int().min(24).max(60).optional(),
  maxDurationSec: z.number().int().min(3).max(120).optional(),
  scrollSpeedPxPerSec: z.number().int().min(100).max(4000).optional(),
  sectionHoldMs: z.number().int().min(0).max(5000).optional(),
  headingHoldMs: z.number().int().min(0).max(5000).optional(),
  easing: z.string().optional(),
  waitForSelector: z.string().optional(),
  extraWaitMs: z.number().int().min(0).max(30_000).optional(),
  hideSelectors: z.array(z.string()).optional(),
  darkMode: z.boolean().optional(),
}).optional().default({});

export const InputSchema = z.discriminatedUnion("type", [
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

export const RecordBodySchema = z.object({
  input: InputSchema,
  options: OptionsSchema,
});

export type RecordBody = z.infer<typeof RecordBodySchema>;
