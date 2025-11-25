import { describe, it, expect } from 'vitest';
import { parseWebm } from '../index.js';
import * as fs from 'fs';
import * as path from 'path';

const ASSETS_DIR = path.join(process.cwd(), 'test_assets');

function loadAsset(filename: string): Blob {
  const buffer = fs.readFileSync(path.join(ASSETS_DIR, filename));
  return new Blob([buffer]);
}

describe('FFmpeg Generated Assets Tests', () => {
  it('1. Standard WebM (Duration in Header)', async () => {
    const blob = loadAsset('standard.webm');
    const meta = await parseWebm(blob);

    // Should have duration in Info
    expect(meta.info.duration).toBeDefined();
    // Duration should be approx 10s
    expect(meta.duration).toBeCloseTo(10.0, 1);
    
    // Check tracks
    expect(meta.tracks).toHaveLength(2); // Video + Audio
    const videoTrack = meta.tracks.find(t => t.trackType === 1);
    const audioTrack = meta.tracks.find(t => t.trackType === 2);
    expect(videoTrack).toBeDefined();
    expect(audioTrack).toBeDefined();
    expect(videoTrack?.codecId).toBe('V_VP9');
    expect(audioTrack?.codecId).toBe('A_OPUS');
  });

  it('2. Live WebM (No Duration in Header)', async () => {
    const blob = loadAsset('live_no_duration.webm');
    const meta = await parseWebm(blob);

    // Should NOT have duration in Info
    expect(meta.info.duration).toBeUndefined();
    
    // Should calculate duration from Tail Scan
    // The user said "Duration: N/A" in ffprobe, but our lib should find it.
    expect(meta.duration).toBeCloseTo(10.0, 1);
  });

  it('3. Audio Only WebM', async () => {
    const blob = loadAsset('audio_only.webm');
    const meta = await parseWebm(blob);

    expect(meta.tracks).toHaveLength(1);
    expect(meta.tracks[0].trackType).toBe(2); // Audio
    expect(meta.tracks[0].codecId).toBe('A_OPUS');
    
    // Duration should be approx 10s
    expect(meta.duration).toBeCloseTo(10.0, 1);
  });

  it('4. Truncated WebM (Resync Logic)', async () => {
    const blob = loadAsset('truncated.webm');
    const meta = await parseWebm(blob);

    // Should handle truncated file gracefully
    // Duration might be slightly less than 10s, or exactly 10s if the last cluster keyframe is before the cut.
    // The cut is 10KB.
    expect(meta.duration).toBeGreaterThan(0);
    expect(meta.duration).toBeLessThanOrEqual(10.0);
    // It should be reasonably close to 10s
    expect(meta.duration).toBeGreaterThan(9.0);
  });
});
