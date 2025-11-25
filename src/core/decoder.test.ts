import { describe, it, expect } from 'vitest';
import { readVint, readFloat, readString } from './decoder.js';
import { VINT_UNKNOWN_MARKER } from '../constants.js';

describe('decoder', () => {
  describe('readVint', () => {
    it('should read 1-byte VINT', () => {
      const buffer = new Uint8Array([0x81]); // 1000 0001 -> value 1
      const view = new DataView(buffer.buffer);
      expect(readVint(view, 0)).toEqual({ value: 1, length: 1 });
    });

    it('should read 2-byte VINT', () => {
      const buffer = new Uint8Array([0x40, 0x02]); // 0100 0000 0000 0010 -> value 2
      const view = new DataView(buffer.buffer);
      expect(readVint(view, 0)).toEqual({ value: 2, length: 2 });
    });

    it('should read max safe integer VINT (within JS limits)', () => {
       // 8-byte VINT: 0000 0001 ...
       // 0x01 00 00 00 00 00 00 01 -> value 1
       const buffer = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]);
       const view = new DataView(buffer.buffer);
       expect(readVint(view, 0)).toEqual({ value: 1, length: 8 });
    });

    it('should handle Unknown Size marker', () => {
      const buffer = new Uint8Array([0xFF]); // 1111 1111 -> Unknown
      const view = new DataView(buffer.buffer);
      expect(readVint(view, 0)).toEqual({ value: VINT_UNKNOWN_MARKER, length: 1 });
    });
    
    it('should handle Unknown Size marker (8 bytes)', () => {
        const buffer = new Uint8Array([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
        const view = new DataView(buffer.buffer);
        expect(readVint(view, 0)).toEqual({ value: VINT_UNKNOWN_MARKER, length: 8 });
    });
  });

  describe('readFloat', () => {
    it('should read float32', () => {
      const buffer = new Float32Array([1.5]);
      // Need to handle endianness carefully. DataView is Big Endian by default for getFloat, but TypedArrays are platform endian (usually Little).
      // Let's manually create Big Endian buffer for 1.5
      // 1.5 in hex is 0x3FC00000
      const u8 = new Uint8Array([0x3F, 0xC0, 0x00, 0x00]);
      const view = new DataView(u8.buffer);
      expect(readFloat(view, 0, 4)).toBeCloseTo(1.5);
    });

    it('should read float64', () => {
      // 1.5 in double hex is 0x3FF8000000000000
      const u8 = new Uint8Array([0x3F, 0xF8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const view = new DataView(u8.buffer);
      expect(readFloat(view, 0, 8)).toBeCloseTo(1.5);
    });
  });

  describe('readString', () => {
    it('should read utf-8 string', () => {
      const encoder = new TextEncoder();
      const buffer = encoder.encode("Hello WebM");
      const view = new DataView(buffer.buffer);
      expect(readString(view, 0, buffer.length)).toBe("Hello WebM");
    });
  });
});
