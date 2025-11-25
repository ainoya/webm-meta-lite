export const IDS = {
  // Global
  EBML: 0x1A45DFA3,
  SEGMENT: 0x18538067,
  
  // Top Level
  SEEK_HEAD: 0x114D9B74,
  INFO: 0x1549A966,
  TRACKS: 0x1654AE6B,
  CUES: 0x1C53BB6B,
  CLUSTER: 0x1F43B675,
  
  // Info Elements
  TIMECODE_SCALE: 0x2AD7B1,
  DURATION: 0x4489,
  MUXING_APP: 0x4D80,
  WRITING_APP: 0x5741,

  // Tracks Elements
  TRACK_ENTRY: 0xAE,
  TRACK_NUMBER: 0xD7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  VIDEO: 0xE0,
  PIXEL_WIDTH: 0xB0,
  PIXEL_HEIGHT: 0xBA,
  AUDIO: 0xE1,
  SAMPLING_FREQ: 0xB5,
  CHANNELS: 0x9F,

  // Cluster & Cues
  TIMECODE: 0xE7,
  CUE_POINT: 0xBB,
  CUE_TIME: 0xB3,
  SIMPLE_BLOCK: 0xA3,
  BLOCK_GROUP: 0xA0
} as const;

// For VINT parsing: "Unknown Size" if all bits are 1
export const VINT_UNKNOWN_MARKER = -1;
