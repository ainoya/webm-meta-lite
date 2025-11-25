import { Reader } from "../types.js";

/**
 * Creates a Reader from a Blob (Browser/Node.js).
 * @param blob The source Blob
 * @returns A Reader instance
 */
export const createBlobReader = (blob: Blob): Reader => {
  return {
    getSize: () => blob.size,
    read: async (offset: number, length: number): Promise<Uint8Array> => {
      const slice = blob.slice(offset, offset + length);
      const buffer = await slice.arrayBuffer();
      return new Uint8Array(buffer);
    },
  };
};

/**
 * Creates a Reader from a Uint8Array (In-memory buffer).
 * Useful for testing or small files.
 * @param buffer The source buffer
 * @returns A Reader instance
 */
export const createBufferReader = (buffer: Uint8Array): Reader => {
  return {
    getSize: () => buffer.byteLength,
    read: async (offset: number, length: number): Promise<Uint8Array> => {
      // Emulate async I/O
      return Promise.resolve(buffer.subarray(offset, offset + length));
    },
  };
};
