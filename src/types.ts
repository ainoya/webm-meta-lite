// Abstraction of input source
export type Reader = {
  readonly getSize: () => number;
  readonly read: (offset: number, length: number) => Promise<Uint8Array>;
};

// Parsing result (Immutable object)
export type WebmMeta = {
  readonly durationMilliSeconds?: number; // Milliseconds
  readonly fileSize: number;
  readonly mimeType: string;        // "video/webm; codecs=..."
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
