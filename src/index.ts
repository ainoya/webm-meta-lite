import { createBlobReader } from "./io/reader.js";
import { scanHeader, scanCues, scanTail } from "./core/scanner.js";
import { DurationSource, Reader, WebmMeta, WebmTrack } from "./types.js";

type ResolvedDuration = {
  readonly durationMilliSeconds?: number;
  readonly durationSource?: DurationSource;
};

/**
 * Builds the MIME type from the codec IDs of the parsed tracks.
 * Note: this value is assembled by this library, it is not stored in the file.
 */
const buildMimeType = (tracks: ReadonlyArray<WebmTrack>): string => {
  const codecs = tracks.map((track) => track.codecId).filter((codecId) => Boolean(codecId));
  return codecs.length > 0 ? `video/webm; codecs="${codecs.join(", ")}"` : "video/webm";
};

/**
 * Resolves the duration by trying up to three methods in order, stopping at the
 * first one that yields a value. The method used is reported as `durationSource`.
 *
 * 1. "header": the Duration element of the Info header. Exact, but absent in files
 *    written by `MediaRecorder` and other live muxers.
 * 2. "cues": the last CueTime of the Cues index. An estimate: it points at the last
 *    indexed cluster, not at the end of the last frame.
 * 3. "tail": the last Cluster/Block timecode found by scanning the file tail. Also an
 *    estimate: it excludes the play time of the last frame itself.
 */
const resolveDuration = async (
  reader: Reader,
  fileSize: number,
  timecodeScale: number,
  headerDurationMilliSeconds: number | undefined,
  cuesOffset: number | undefined
): Promise<ResolvedDuration> => {
  if (headerDurationMilliSeconds !== undefined) {
    return { durationMilliSeconds: headerDurationMilliSeconds, durationSource: "header" };
  }

  const cuesDuration =
    cuesOffset !== undefined ? await scanCues(reader, cuesOffset, timecodeScale) : undefined;
  if (cuesDuration !== undefined) {
    return { durationMilliSeconds: cuesDuration, durationSource: "cues" };
  }

  const tailDuration = await scanTail(reader, fileSize, timecodeScale);
  if (tailDuration !== undefined) {
    return { durationMilliSeconds: tailDuration, durationSource: "tail" };
  }

  return {};
};

/**
 * Parses a WebM file (Blob) and returns its metadata.
 *
 * `info` and `tracks` are reported as stored in the file. `fileSize` is the size of
 * the source itself and `mimeType` is assembled from the track codec IDs.
 * `durationMilliSeconds` is resolved through the Header/Cues/Tail pipeline and the
 * method that produced it is reported as `durationSource`.
 *
 * @param source The WebM Blob or Reader to parse
 * @returns The parsed WebmMeta object
 */
export const parseWebm = async (source: Blob | Reader): Promise<WebmMeta> => {
  const reader = "read" in source ? source : createBlobReader(source);
  const fileSize = reader.getSize();

  // 1. Header Scan (Required)
  const headerResult = await scanHeader(reader);

  // 2. Duration Resolution Pipeline (Header -> Cues -> Tail)
  const duration = await resolveDuration(
    reader,
    fileSize,
    headerResult.info.timecodeScale,
    headerResult.info.durationMilliSeconds,
    headerResult.cuesOffset
  );

  return {
    ...duration,
    fileSize,
    mimeType: buildMimeType(headerResult.tracks),
    info: headerResult.info,
    tracks: headerResult.tracks
  };
};

export * from "./types.js";
export * from "./io/reader.js";
