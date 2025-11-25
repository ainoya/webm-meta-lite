import { describe, it, expect } from 'vitest';
import { scanHeader, scanCues, scanTail } from './scanner.js';
import { createBufferReader } from '../io/reader.js';
import { IDS } from '../constants.js';

// Helper to write VINT
const writeVint = (value: number, length: number = 0): Uint8Array => {
  if (length === 0) {
    // Auto calculate
    if (value < 0x80) length = 1;
    else if (value < 0x4000) length = 2;
    else if (value < 0x200000) length = 3;
    else if (value < 0x10000000) length = 4;
    else length = 5; // simplified
  }
  
  const buffer = new Uint8Array(length);
  let marker = 0;
  if (length === 1) marker = 0x80;
  else if (length === 2) marker = 0x40;
  else if (length === 3) marker = 0x20;
  else if (length === 4) marker = 0x10;
  else if (length === 5) marker = 0x08;
  else if (length === 8) marker = 0x01;
  
  // Write value
  // This is a bit tricky to do generic VINT writing correctly for all sizes in JS without bitwise ops on BigInt or careful math.
  // For tests, we usually use small values or specific lengths.
  
  let val = value;
  for (let i = length - 1; i >= 0; i--) {
    buffer[i] = val & 0xFF;
    val = Math.floor(val / 256);
  }
  buffer[0] |= marker;
  return buffer;
};

// Helper to write ID (which is VINT encoded but we treat as constant usually)
const writeID = (id: number): Uint8Array => {
  // ID is usually 1-4 bytes.
  // 0x1A45DFA3 -> 4 bytes
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

describe('scanner', () => {
  describe('scanHeader', () => {
    it('should parse Info and Tracks', async () => {
      // Construct Info
      const timecodeScale = new Uint8Array([0x0F, 0x42, 0x40]); // 1000000
      const durationVal = new Float64Array([1000.0]);
      const durationBuf = new Uint8Array(durationVal.buffer).reverse(); // Big Endian
      
      const infoContent = concat(
        createElement(IDS.TIMECODE_SCALE, timecodeScale),
        createElement(IDS.DURATION, durationBuf),
        createElement(IDS.MUXING_APP, new TextEncoder().encode("TestApp"))
      );
      const info = createElement(IDS.INFO, infoContent);
      
      // Construct Tracks
      const trackEntryContent = concat(
        createElement(IDS.TRACK_NUMBER, new Uint8Array([1])),
        createElement(IDS.TRACK_TYPE, new Uint8Array([1])), // Video
        createElement(IDS.CODEC_ID, new TextEncoder().encode("V_VP8"))
      );
      const trackEntry = createElement(IDS.TRACK_ENTRY, trackEntryContent);
      const tracks = createElement(IDS.TRACKS, trackEntry);
      
      // Segment
      const segmentContent = concat(info, tracks);
      const segment = createElement(IDS.SEGMENT, segmentContent);
      
      const reader = createBufferReader(segment);
      const result = await scanHeader(reader);
      
      expect(result.info.timecodeScale).toBe(1000000);
      expect(result.info.duration).toBe(1000.0);
      expect(result.info.muxingApp).toBe("TestApp");
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].codecId).toBe("V_VP8");
    });
  });

  describe('scanCues', () => {
    it('should find max timecode in Cues', async () => {
      // CuePoint 1: Time 100
      const cueTime1 = createElement(IDS.CUE_TIME, new Uint8Array([100]));
      const cuePoint1 = createElement(IDS.CUE_POINT, cueTime1);
      
      // CuePoint 2: Time 500
      // 500 = 0x01F4
      const cueTime2 = createElement(IDS.CUE_TIME, new Uint8Array([0x01, 0xF4]));
      const cuePoint2 = createElement(IDS.CUE_POINT, cueTime2);
      
      const cuesContent = concat(cuePoint1, cuePoint2);
      const cues = createElement(IDS.CUES, cuesContent);
      
      const reader = createBufferReader(cues);
      // Offset 0 because reader contains only Cues
      const result = await scanCues(reader, 0, 1000000);
      
      // 500 * 1000000 / 1e9 = 0.5
      expect(result).toBe(0.5);
    });
  });
  
  describe('scanTail', () => {
    it('should find last Cluster timecode', async () => {
      // Cluster 1: Time 1000
      // Timecode (0xE7) - UInteger
      // 1000 = 0x03E8
      const tc1 = createElement(IDS.TIMECODE, new Uint8Array([0x03, 0xE8]));
      const cluster1 = createElement(IDS.CLUSTER, tc1);
      
      // Cluster 2: Time 2000
      // 2000 = 0x07D0
      const tc2 = createElement(IDS.TIMECODE, new Uint8Array([0x07, 0xD0]));
      const cluster2 = createElement(IDS.CLUSTER, tc2);
      
      // Some junk data before
      const junk = new Uint8Array(100).fill(0);
      
      const file = concat(junk, cluster1, cluster2);
      const reader = createBufferReader(file);
      
      const result = await scanTail(reader, file.length, 1000000);
      
      // 2000 * 1000000 / 1e9 = 2.0
      expect(result).toBe(2.0);
    });

    it('should handle Unknown Size Cluster with Timecode 0', async () => {
      // Cluster with Unknown Size (8 bytes of 0xFF)
      // ID: 0x1F43B675
      // Size: 0xFFFFFFFFFFFFFFFF (Unknown)
      
      const clusterId = writeID(IDS.CLUSTER);
      const unknownSize = new Uint8Array([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
      
      // Timecode 0
      const tc = createElement(IDS.TIMECODE, new Uint8Array([0]));
      
      // SimpleBlock (optional, but good to have content)
      // ID 0xA3, Size 4, Track 1, Timecode 0, Flags 0
      const sbContent = new Uint8Array([0x81, 0x00, 0x00, 0x00]);
      const sb = createElement(IDS.SIMPLE_BLOCK, sbContent);
      
      const clusterContent = concat(tc, sb);
      const cluster = concat(clusterId, unknownSize, clusterContent);
      
      const reader = createBufferReader(cluster);
      
      const result = await scanTail(reader, cluster.length, 1000000);
      
      // Should find Timecode 0
      expect(result).toBe(0);
    });
  });
});
