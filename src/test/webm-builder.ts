import { IDS } from "../constants.js";

// Helper to write VINT (Variable Size Integer)
const writeVint = (value: number, length: number = 0): Uint8Array => {
  if (length === 0) {
    if (value < 0x80) length = 1;
    else if (value < 0x4000) length = 2;
    else if (value < 0x200000) length = 3;
    else if (value < 0x10000000) length = 4;
    else length = 5; 
  }
  
  const buffer = new Uint8Array(length);
  let marker = 0;
  if (length === 1) marker = 0x80;
  else if (length === 2) marker = 0x40;
  else if (length === 3) marker = 0x20;
  else if (length === 4) marker = 0x10;
  else if (length === 5) marker = 0x08;
  else if (length === 8) marker = 0x01;
  
  let val = value;
  for (let i = length - 1; i >= 0; i--) {
    buffer[i] = val & 0xFF;
    val = Math.floor(val / 256);
  }
  buffer[0] |= marker;
  return buffer;
};

// Helper to write ID (VINT encoded)
const writeID = (id: number): Uint8Array => {
  if (id > 0xFFFFFF) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, id, false);
    return b;
  } else if (id > 0xFFFF) {
    const b = new Uint8Array(3);
    b[0] = (id >> 16) & 0xFF;
    b[1] = (id >> 8) & 0xFF;
    b[2] = id & 0xFF;
    return b;
  } else if (id > 0xFF) {
    const b = new Uint8Array(2);
    b[0] = (id >> 8) & 0xFF;
    b[1] = id & 0xFF;
    return b;
  } else {
    return new Uint8Array([id]);
  }
};

const concat = (...arrays: Uint8Array[]) => {
  const total = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

const createElement = (id: number, content: Uint8Array): Uint8Array => {
  return concat(writeID(id), writeVint(content.length), content);
};

export interface WebmOptions {
  info?: {
    timecodeScale?: number;
    duration?: number;
  };
  tracks?: Array<{
    number?: number;
    type: number;
    codecId: string;
  }>;
  cues?: Array<{
    time: number;
    clusterOffset?: number;
  }>;
  clusters?: Array<{
    timecode: number;
    size?: number;
  }>;
  seekHead?: boolean;
}

const createInfo = (info: NonNullable<WebmOptions['info']>): Uint8Array => {
  const elements: Uint8Array[] = [];
  
  if (info.timecodeScale !== undefined) {
    const scale = info.timecodeScale;
    let buffer: Uint8Array;
    if (scale === 1000000) {
       buffer = new Uint8Array([0x0F, 0x42, 0x40]);
    } else {
       buffer = new Uint8Array(4);
       new DataView(buffer.buffer).setUint32(0, scale, false);
    }
    elements.push(createElement(IDS.TIMECODE_SCALE, buffer));
  }

  if (info.duration !== undefined) {
    const buffer = new Uint8Array(8);
    new DataView(buffer.buffer).setFloat64(0, info.duration, false);
    elements.push(createElement(IDS.DURATION, buffer));
  }

  return createElement(IDS.INFO, concat(...elements));
};

const createTracks = (tracksList: NonNullable<WebmOptions['tracks']>): Uint8Array => {
  const elements = tracksList.map((track, index) => {
    const trackNumber = track.number ?? (index + 1);
    const trackContent = concat(
      createElement(IDS.TRACK_NUMBER, new Uint8Array([trackNumber])),
      createElement(IDS.TRACK_TYPE, new Uint8Array([track.type])),
      createElement(IDS.CODEC_ID, new TextEncoder().encode(track.codecId))
    );
    return createElement(IDS.TRACK_ENTRY, trackContent);
  });
  return createElement(IDS.TRACKS, concat(...elements));
};

const createCues = (cuesList: NonNullable<WebmOptions['cues']>): Uint8Array => {
  const elements = cuesList.map(cue => {
    let timeBuf;
    if (cue.time < 0x10000) {
        timeBuf = new Uint8Array(2);
        new DataView(timeBuf.buffer).setUint16(0, cue.time, false);
    } else {
        timeBuf = new Uint8Array(4);
        new DataView(timeBuf.buffer).setUint32(0, cue.time, false);
    }
    
    // Minimal CuePoint with just CueTime for now, as per original builder
    const cuePointContent = createElement(IDS.CUE_TIME, timeBuf);
    return createElement(IDS.CUE_POINT, cuePointContent);
  });
  return createElement(IDS.CUES, concat(...elements));
};

const createCluster = (cluster: { timecode: number; size?: number }): Uint8Array => {
  let tcBuf;
  if (cluster.timecode < 0x10000) {
      tcBuf = new Uint8Array(2);
      new DataView(tcBuf.buffer).setUint16(0, cluster.timecode, false);
  } else {
      tcBuf = new Uint8Array(4);
      new DataView(tcBuf.buffer).setUint32(0, cluster.timecode, false);
  }
  
  const content = concat(
      createElement(IDS.TIMECODE, tcBuf),
      new Uint8Array(cluster.size ?? 100).fill(0xAA)
  );
  return createElement(IDS.CLUSTER, content);
};

const createSeekHead = (cuesPosition: number): Uint8Array => {
  // SeekID: Cues (0x1C53BB6B)
  const cuesIdBytes = new Uint8Array([0x1C, 0x53, 0xBB, 0x6B]);
  const seekId = createElement(0x53AB, cuesIdBytes);
  
  // SeekPosition
  const posBytes = new Uint8Array(4);
  new DataView(posBytes.buffer).setUint32(0, cuesPosition, false);
  const seekPos = createElement(0x53AC, posBytes);
  
  const seek = createElement(0x4DBB, concat(seekId, seekPos));
  return createElement(IDS.SEEK_HEAD, seek);
};

export const buildWebm = (options: WebmOptions): Uint8Array => {
  const parts: Uint8Array[] = [];

  // 1. Info
  if (options.info) {
    parts.push(createInfo(options.info));
  }

  // 2. Tracks
  if (options.tracks) {
    parts.push(createTracks(options.tracks));
  }

  // 3. Clusters
  if (options.clusters) {
    parts.push(...options.clusters.map(createCluster));
  }

  // 4. Cues
  let cuesElement: Uint8Array | null = null;
  if (options.cues && options.cues.length > 0) {
    cuesElement = createCues(options.cues);
  }

  // Assemble
  // If seekHead is requested, we need to calculate offsets.
  // Layout: [SeekHead] [Info] [Tracks] [Clusters] [Cues]
  
  if (options.seekHead && cuesElement) {
    // We need to insert SeekHead at the beginning.
    // Calculate size of everything before Cues.
    
    // Temporary SeekHead to get size
    const dummySeekHead = createSeekHead(0xFFFFFFFF);
    const seekHeadSize = dummySeekHead.length;
    
    const contentBeforeCues = concat(...parts);
    const cuesPosition = seekHeadSize + contentBeforeCues.length;
    
    const realSeekHead = createSeekHead(cuesPosition);
    
    // Re-assemble with SeekHead first, then content, then Cues
    return createElement(IDS.SEGMENT, concat(realSeekHead, contentBeforeCues, cuesElement));
  } else {
    // Simple append Cues if they exist (usually at the end or where they fit, here we put them at end for simplicity if not using SeekHead logic from original builder which put them before clusters? 
    // Wait, original builder:
    // build(): Info, Tracks, Cues, Clusters
    // buildWithSeekHead(): SeekHead, Info, Tracks, Clusters, Cues
    
    // Let's follow the logic: if seekHead is false, put Cues after Tracks (before Clusters) as per original build()
    
    const finalParts: Uint8Array[] = [];
    if (options.info) finalParts.push(createInfo(options.info));
    if (options.tracks) finalParts.push(createTracks(options.tracks));
    if (cuesElement) finalParts.push(cuesElement);
    if (options.clusters) finalParts.push(...options.clusters.map(createCluster));
    
    return createElement(IDS.SEGMENT, concat(...finalParts));
  }
};

