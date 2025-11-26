import { describe, it, expect } from 'vitest';
import { parseWebm } from '../index.js';
import { buildWebm } from './webm-builder.js';

describe('Integration Tests', () => {
  it('Scenario 1: Standard WebM (Duration in Header)', async () => {
    // Case: Info element contains Duration.
    // This is the most common case for VOD files.
    
    const webm = buildWebm({
      info: {
        timecodeScale: 1000000, // 1ms
        duration: 5000.0,       // 5000ms = 5s
      },
      tracks: [
        { number: 1, type: 1, codecId: "V_VP9" }
      ],
      clusters: [
        { timecode: 0 },
        { timecode: 2500 },
        { timecode: 4900 }
      ]
    });
      
    // Mock Blob
    const blob = new Blob([webm as unknown as BlobPart]);
    const meta = await parseWebm(blob);
    
    expect(meta.info.durationMilliSeconds).toBe(5000.0);
    expect(meta.durationMilliSeconds).toBe(5000.0); // 5000ms
    expect(meta.tracks).toHaveLength(1);
    expect(meta.tracks[0].codecId).toBe("V_VP9");
  });

  it('Scenario 2: Live Stream Style (No Duration in Header, Cues present)', async () => {
    // Case: Info has no Duration. Cues are present at the end.
    // SeekHead points to Cues.
    // This simulates a file recorded from a stream where duration wasn't known at start,
    // but Cues were written at the end.
    
    const webm = buildWebm({
      info: {
        timecodeScale: 1000000,
        // No Duration in Info
      },
      tracks: [
        { number: 1, type: 1, codecId: "V_VP8" }
      ],
      clusters: [
        { timecode: 0 },
        { timecode: 1000 },
        { timecode: 2000 }
      ],
      cues: [
        { time: 2000 } // Max time in Cues is 2000
      ],
      seekHead: true // Puts Cues at end and SeekHead at start
    });
      
    const blob = new Blob([webm as unknown as BlobPart]);
    const meta = await parseWebm(blob);
    
    expect(meta.info.durationMilliSeconds).toBeUndefined();
    expect(meta.durationMilliSeconds).toBe(2000.0); // Derived from Cues: 2000ms
  });

  it('Scenario 3: Truncated/Resync (No Duration, No Cues)', async () => {
    // Case: No Duration in Info, No Cues (or Cues not found).
    // Tail Scan must find the last Cluster.
    // We add some junk data at the end to force Resync logic if we were strictly reading from end.
    // But scanTail scans the last N bytes.
    
    const validWebm = buildWebm({
      info: {
        timecodeScale: 1000000,
      },
      tracks: [
        { number: 1, type: 1, codecId: "V_AV1" }
      ],
      clusters: [
        { timecode: 0 },
        { timecode: 3000 },
        { timecode: 6500 } // Last Cluster at 6.5s
      ]
    });
    
    // Append junk data to simulate non-clean cut or garbage
    const junk = new Uint8Array(1024).fill(0xFF);
    const fileContent = new Uint8Array(validWebm.length + junk.length);
    fileContent.set(validWebm);
    fileContent.set(junk, validWebm.length);
    
    const blob = new Blob([fileContent as unknown as BlobPart]);
    const meta = await parseWebm(blob);
    
    expect(meta.info.durationMilliSeconds).toBeUndefined();
    // Tail scan should find the Cluster at 6500
    expect(meta.durationMilliSeconds).toBe(6500.0);
  });
  
  it('Scenario 4: Audio Only (Audio Track)', async () => {
    const webm = buildWebm({
      info: {
        timecodeScale: 1000000,
        duration: 12000.0,
      },
      tracks: [
        { number: 1, type: 2, codecId: "A_OPUS" } // Audio
      ]
    });
      
    const blob = new Blob([webm as unknown as BlobPart]);
    const meta = await parseWebm(blob);
    
    expect(meta.tracks[0].trackType).toBe(2);
    expect(meta.tracks[0].codecId).toBe("A_OPUS");
    expect(meta.durationMilliSeconds).toBe(12000.0);
  });
});
