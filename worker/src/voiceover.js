import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import say from "say";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path || "ffmpeg";

/**
 * Generates narration audio using the OS's own built-in TTS engine (Windows
 * SAPI, macOS `say`, Linux espeak via the `say` package — MIT-licensed, no
 * API key, no network call, runs entirely on the paired worker's machine)
 * and merges it with the recording.
 *
 * @param {{
 *   mp4Path: string,
 *   outMp4Path: string,
 *   textContext?: string,
 *   voiceName?: string,
 *   speed?: number,
 * }} opts
 */
export async function generateAndMergeVoiceover({ mp4Path, outMp4Path, textContext, voiceName, speed = 1.0 }) {
  if (!textContext || !textContext.trim()) {
    await fs.copyFile(mp4Path, outMp4Path);
    return false;
  }

  const audioPath = path.join(path.dirname(mp4Path), process.platform === "darwin" ? "narration.aiff" : "narration.wav");

  try {
    // 1. Generate voiceover locally via the OS TTS engine.
    await new Promise((resolve, reject) => {
      say.export(textContext.slice(0, 500), voiceName || null, speed, audioPath, (err) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve(undefined);
      });
    });

    // 2. Merge Video and Voiceover Audio via FFmpeg
    await new Promise((resolve, reject) => {
      const args = [
        "-y",
        "-i", mp4Path,
        "-i", audioPath,
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        outMp4Path,
      ];
      const p = spawn(FFMPEG, args, { stdio: "ignore" });
      p.on("error", reject);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg audio merge exited ${code}`))));
    });

    await fs.rm(audioPath, { force: true }).catch(() => {});
    return true;
  } catch (err) {
    console.warn("[SmoothRecord Voiceover] Local TTS skipped:", err instanceof Error ? err.message : err);
    await fs.copyFile(mp4Path, outMp4Path).catch(() => {});
    return false;
  }
}
