import { createBlobReader } from "./io/reader.js";
import { scanHeader, scanCues, scanTail } from "./core/scanner.js";
import { Reader, WebmMeta } from "./types.js";

/**
 * Parses a WebM file (Blob) and returns its metadata.
 * @param source The WebM Blob or Reader to parse
 * @returns The parsed WebmMeta object
 */
export const parseWebm = async (source: Blob | Reader): Promise<WebmMeta> => {
  const reader = "read" in source ? source : createBlobReader(source);
  const fileSize = reader.getSize();

  // 1. Header Scan (Required)
  const headerResult = await scanHeader(reader);
  
  // Base result construction
  // Determine mimeType based on tracks if possible, or default to video/webm
  // Simple heuristic: if video track exists -> video/webm, else audio/webm?
  // Or just "video/webm" as spec suggested.
  
  let mimeType = "video/webm";
  const codecs: string[] = [];
  for (const track of headerResult.tracks) {
    if (track.codecId) {
      // Map Matroska Codec ID to MIME codec string if needed.
      // e.g. V_VP9 -> vp9, A_OPUS -> opus
      // For now just use the ID or a simplified version.
      // The spec example said "video/webm; codecs=..."
      // Let's just append codec IDs for now.
      codecs.push(track.codecId);
    }
  }
  if (codecs.length > 0) {
    mimeType += `; codecs="${codecs.join(", ")}"`;
  }

  const resultBase: WebmMeta = {
    duration: null,
    fileSize,
    mimeType,
    info: headerResult.info,
    tracks: headerResult.tracks
  };

  // Duration Resolution Pipeline
  let duration = headerResult.info.duration 
    ? (headerResult.info.duration * headerResult.info.timecodeScale) / 1e9 
    : null;

  // 2. Cues Scan (If Header didn't have duration)
  if (duration === null && headerResult.cuesOffset !== null) {
    duration = await scanCues(reader, headerResult.cuesOffset, headerResult.info.timecodeScale);
  }

  // 3. Tail Scan (If still no duration)
  if (duration === null) {
    duration = await scanTail(reader, fileSize, headerResult.info.timecodeScale);
  }

  return { ...resultBase, duration };
};

export * from "./types.js";
export * from "./io/reader.js";
