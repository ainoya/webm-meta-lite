// Abstraction of input source
export type Reader = {
  readonly getSize: () => number;
  readonly read: (offset: number, length: number) => Promise<Uint8Array>;
};

// Which method resolved `durationMilliSeconds`:
// - "header": the Duration element stored in the Info header (exact)
// - "cues": the last CueTime of the Cues index (estimate)
// - "tail": the last Cluster/Block timecode found by scanning the file tail (estimate)
export type DurationSource = "header" | "cues" | "tail";

// Parsing result (Immutable object)
export type WebmMeta = {
  readonly durationMilliSeconds?: number; // Milliseconds
  readonly durationSource?: DurationSource; // undefined when the duration could not be resolved
  readonly fileSize: number;
  readonly mimeType: string;        // "video/webm; codecs=..." (assembled from track codec IDs)
  readonly info: WebmInfo;
  readonly tracks: WebmTrack[];
};

export type WebmInfo = {
  readonly timecodeScale: number;   // Default 1,000,000
  readonly muxingApp?: string;
  readonly writingApp?: string;
  readonly durationMilliSeconds?: number;       // Duration in Milliseconds
};

export type WebmTrack = {
  readonly trackNumber: number;
  readonly trackType: number;       // 1: Video, 2: Audio
  readonly codecId: string;
  readonly video?: {
    readonly width: number;
    readonly height: number;
  };
  readonly audio?: {
    readonly sampleRate: number;
    readonly channels: number;
  };
};

// Context information during scanning
export type ScanContext = {
  readonly reader: Reader;
  readonly fileSize: number;
  // Important offset positions discovered during parsing
  readonly offsets: {
    readonly cues?: number;    // If found from SeekHead
    readonly segment: number;        // Start position of Segment element
  };
};
