import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path || "ffmpeg";

/**
 * Generates AI promotional narration audio script and merges audio with video.
 *
 * @param {{
 *   mp4Path: string,
 *   outMp4Path: string,
 *   textContext?: string,
 *   voiceName?: string,
 *   openaiApiKey?: string,
 * }} opts
 */
export async function generateAndMergeVoiceover({ mp4Path, outMp4Path, textContext, voiceName = "alloy", openaiApiKey = process.env.OPENAI_API_KEY }) {
  if (!openaiApiKey || !textContext) {
    // Return original mp4 if key is not configured
    await fs.copyFile(mp4Path, outMp4Path);
    return false;
  }

  try {
    const audioPath = path.join(path.dirname(mp4Path), "narration.mp3");

    // 1. Generate Voiceover via OpenAI TTS
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: textContext.slice(0, 500),
        voice: voiceName,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS returned HTTP ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(audioPath, audioBuffer);

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
    console.warn("[SmoothRecord Voiceover] Audio generation skipped:", err.message);
    await fs.copyFile(mp4Path, outMp4Path).catch(() => {});
    return false;
  }
}
