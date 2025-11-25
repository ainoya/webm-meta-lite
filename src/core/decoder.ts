import { VINT_UNKNOWN_MARKER } from "../constants.js";

/**
 * Reads a Variable Size Integer (VINT) from the DataView.
 * Returns the decoded value (marker bit removed).
 * @param view DataView containing the binary data
 * @param offset Offset to start reading from
 * @returns Object containing the parsed value and the length of the VINT in bytes
 */
export const readVint = (view: DataView, offset: number): { value: number; length: number } => {
  const byte1 = view.getUint8(offset);
  let length = 0;
  let value = 0;

  if (byte1 >= 0x80) {
    length = 1;
    value = byte1 & 0x7F;
  } else if (byte1 >= 0x40) {
    length = 2;
    value = byte1 & 0x3F;
  } else if (byte1 >= 0x20) {
    length = 3;
    value = byte1 & 0x1F;
  } else if (byte1 >= 0x10) {
    length = 4;
    value = byte1 & 0x0F;
  } else if (byte1 >= 0x08) {
    length = 5;
    value = byte1 & 0x07;
  } else if (byte1 >= 0x04) {
    length = 6;
    value = byte1 & 0x03;
  } else if (byte1 >= 0x02) {
    length = 7;
    value = byte1 & 0x01;
  } else if (byte1 >= 0x01) {
    length = 8;
    value = byte1 & 0x00;
  } else {
    throw new Error(`Invalid VINT marker at offset ${offset}`);
  }

  for (let i = 1; i < length; i++) {
    const b = view.getUint8(offset + i);
    value = (value * 256) + b;
  }

  // Check for unknown size
  const maxVal = Math.pow(2, 7 * length) - 1;
  if (value === maxVal) {
    return { value: VINT_UNKNOWN_MARKER, length };
  }

  return { value, length };
};

/**
 * Reads an EBML ID from the DataView.
 * Returns the raw value (marker bit INCLUDED).
 * @param view DataView containing the binary data
 * @param offset Offset to start reading from
 * @returns Object containing the parsed ID and the length in bytes
 */
export const readID = (view: DataView, offset: number): { value: number; length: number } => {
  const byte1 = view.getUint8(offset);
  let length = 0;

  if (byte1 >= 0x80) length = 1;
  else if (byte1 >= 0x40) length = 2;
  else if (byte1 >= 0x20) length = 3;
  else if (byte1 >= 0x10) length = 4;
  else if (byte1 >= 0x08) length = 5; // IDs are rarely > 4 bytes
  else if (byte1 >= 0x04) length = 6;
  else if (byte1 >= 0x02) length = 7;
  else if (byte1 >= 0x01) length = 8;
  else throw new Error(`Invalid ID marker at offset ${offset}`);

  let value = 0;
  for (let i = 0; i < length; i++) {
    const b = view.getUint8(offset + i);
    value = (value * 256) + b;
  }

  return { value, length };
};

/**
 * Reads a float value (32-bit or 64-bit) from the DataView.
 * @param view DataView containing the binary data
 * @param offset Offset to start reading from
 * @param size Size of the float in bytes (4 or 8)
 * @returns The parsed float value
 */
export const readFloat = (view: DataView, offset: number, size: number): number => {
  if (size === 4) {
    return view.getFloat32(offset, false); // Big Endian
  } else if (size === 8) {
    return view.getFloat64(offset, false); // Big Endian
  }
  throw new Error(`Invalid float size: ${size}`);
};

/**
 * Reads a string from the DataView.
 * @param view DataView containing the binary data
 * @param offset Offset to start reading from
 * @param size Length of the string in bytes
 * @returns The parsed string
 */
export const readString = (view: DataView, offset: number, size: number): string => {
  const buffer = view.buffer.slice(view.byteOffset + offset, view.byteOffset + offset + size);
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
};
