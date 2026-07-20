import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path || "ffmpeg";

/**
 * Composite the raw WebM recording with device frames, studio backdrops, and aspect ratios.
 *
 * @param {{
 *   inputPath: string,
 *   outputPath: string,
 *   deviceFrame?: "macbook" | "safari" | "iphone" | "none",
 *   backdrop?: "gradient-mesh" | "dark-studio" | "cyberpunk" | "clean-white" | "custom",
 *   aspectRatio?: "16:9" | "9:16" | "1:1" | "gif",
 *   fps?: number,
 *   width?: number,
 *   height?: number,
 *   preset?: string,
 * }} opts
 */
export function compositeVideo({ inputPath, outputPath, deviceFrame = "macbook", backdrop = "gradient-mesh", aspectRatio = "16:9", fps = 60, width = 1440, height = 900, preset = "medium" }) {
  return new Promise((resolve, reject) => {
    // 1. Size the canvas off the *recorded* resolution instead of a hardcoded
    // 1920x1080 — a small/preview job shouldn't pay for a full-HD re-encode.
    // Clamped to [640, 1920] so quality stays reasonable at either extreme.
    const longEdge = Math.min(1920, Math.max(640, Math.max(width, height)));
    let canvasW = longEdge;
    let canvasH = Math.round((longEdge * 9) / 16);

    if (aspectRatio === "9:16") {
      canvasH = longEdge;
      canvasW = Math.round((longEdge * 9) / 16);
    } else if (aspectRatio === "1:1") {
      canvasW = longEdge;
      canvasH = longEdge;
    }

    // 2. Select Backdrop Color / Gradient Color
    let bgExpr = "color=c=0x0f172a:s=1920x1080"; // Default Dark Studio

    if (backdrop === "gradient-mesh") {
      bgExpr = `color=c=0x18181b:s=${canvasW}x${canvasH}`; // Sleek zinc dark
    } else if (backdrop === "cyberpunk") {
      bgExpr = `color=c=0x2e1065:s=${canvasW}x${canvasH}`; // Deep violet/purple
    } else if (backdrop === "clean-white") {
      bgExpr = `color=c=0xf8fafc:s=${canvasW}x${canvasH}`; // Off-white
    } else {
      bgExpr = `color=c=0x09090b:s=${canvasW}x${canvasH}`;
    }

    // 3. Calculate scaling for video inside frame
    const scaledW = Math.round(canvasW * 0.82);
    const scaledH = Math.round(canvasH * 0.82);
    const posX = Math.round((canvasW - scaledW) / 2);
    const posY = Math.round((canvasH - scaledH) / 2);

    let filterGraph = "";

    if (deviceFrame === "none") {
      filterGraph = `[0:v]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease,pad=${canvasW}:${canvasH}:(ow-iw)/2:(oh-ih)/2[v]`;
    } else {
      // Scale recording, add ambient shadow, and composite on backdrop.
      // NOTE: `color=` is an infinite-duration generator and is the *main*
      // (first) input to overlay, whose output length follows the main
      // input by default — without `shortest=1` this never terminates.
      filterGraph = [
        `${bgExpr}[bg]`,
        `[0:v]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease[fg]`,
        `[bg][fg]overlay=x=${posX}:y=${posY}:shortest=1[v]`
      ].join(";");
    }

    const isGif = aspectRatio === "gif" || outputPath.endsWith(".gif");

    const args = isGif
      ? [
          "-y",
          "-i", inputPath,
          "-vf", `${filterGraph},fps=15,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
          outputPath
        ]
      : [
          "-y",
          "-i", inputPath,
          "-filter_complex", filterGraph,
          "-map", "[v]",
          "-r", String(fps),
          "-c:v", "libx264",
          "-preset", preset,
          "-crf", "18",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-shortest",
          outputPath
        ];

    const p = spawn(FFMPEG, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg compositing exited with code ${code}`));
    });
  });
}
