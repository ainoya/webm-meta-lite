import { IDS, VINT_UNKNOWN_MARKER } from "../constants.js";
import { readFloat, readString, readVint, readID } from "./decoder.js";
import { Reader, ScanContext, WebmInfo, WebmTrack } from "../types.js";

// --- Internal Helpers ---

const readElementHeader = async (reader: Reader, offset: number): Promise<{ id: number; size: number; headerSize: number }> => {
  // Read enough bytes for ID (max 4) and Size (max 8)
  // Max ID length is 4, max Size length is 8.
  // We read 12 bytes to be safe, or less if file is small.
  const buffer = await reader.read(offset, 12);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  let localOffset = 0;
  
  // Read ID (Raw value)
  const { value: id, length: idLen } = readID(view, localOffset);
  localOffset += idLen;
  
  // Read Size (Decoded VINT value)
  const { value: size, length: sizeLen } = readVint(view, localOffset);
  localOffset += sizeLen;
  
  return { id, size, headerSize: localOffset };
};

// --- Header Scanner ---

export const scanHeader = async (reader: Reader): Promise<{ info: WebmInfo; tracks: WebmTrack[]; cuesOffset: number | null }> => {
  const fileSize = reader.getSize();
  // Read first 64KB or file size
  const scanLimit = Math.min(fileSize, 64 * 1024);
  
  // We need to read chunks or just read the whole header area if it's small.
  // For simplicity in this "lite" version, let's assume we can seek/read as needed.
  // But to be efficient, we should probably read a buffer.
  // However, the reader abstraction allows random access.
  
  let offset = 0;
  
  // 1. Find EBML Header (optional but good practice)
  // 2. Find Segment
  
  let segmentStart = -1;
  
  // Simple loop to find Segment
  while (offset < scanLimit) {
    const { id, size, headerSize } = await readElementHeader(reader, offset);
    
    if (id === IDS.SEGMENT) {
      segmentStart = offset + headerSize;
      break;
    }
    
    offset += headerSize + size;
  }
  
  if (segmentStart === -1) {
    throw new Error("WebM Segment not found");
  }
  
  // Now scan children of Segment
  offset = segmentStart;
  const segmentEnd = fileSize; // We don't know the size if it's unknown, or we can trust the size if known.
  // Usually Segment size is unknown for live streams.
  
  const info: any = { timecodeScale: 1000000 };
  const tracks: WebmTrack[] = [];
  let cuesOffset: number | null = null;
  
  // We scan until we find Info and Tracks.
  // We also look for SeekHead to find Cues.
  
  // Limit the scan for header elements to avoid reading the whole file if it's huge and linear scan.
  // But usually Info and Tracks are at the beginning.
  
  while (offset < scanLimit) { // Re-using scanLimit for header scan
     // Check if we are out of bounds
     if (offset >= fileSize) break;

     const { id, size, headerSize } = await readElementHeader(reader, offset);
     const contentOffset = offset + headerSize;
     const nextElementOffset = contentOffset + size;
     
     if (id === IDS.SEEK_HEAD) {
       // Parse SeekHead to find Cues
       await parseSeekHead(reader, contentOffset, size, (seekId, seekPos) => {
         if (seekId === IDS.CUES) {
           cuesOffset = segmentStart + seekPos;
         }
       });
     } else if (id === IDS.INFO) {
       await parseInfo(reader, contentOffset, size, info);
     } else if (id === IDS.TRACKS) {
       const parsedTracks = await parseTracks(reader, contentOffset, size);
       tracks.push(...parsedTracks);
     } else if (id === IDS.CLUSTER) {
       // Stop if we hit a Cluster, header is done.
       break;
     } else if (id === IDS.CUES) {
        // If we hit Cues directly (rare at start but possible)
        cuesOffset = offset;
     }
     
     // If size is unknown, we can't skip easily.
     // But top level elements inside Segment usually have known size.
     // If VINT_UNKNOWN_MARKER, we might be in trouble for skipping.
     if (size === VINT_UNKNOWN_MARKER) {
       // If it's a Cluster, we stopped anyway.
       // If it's something else, we might need to parse inside or give up.
       // For Header Scan, we assume Info/Tracks have sizes.
       console.warn(`Element ${id.toString(16)} has unknown size at ${offset}`);
       // Try to find next valid element? Or just break?
       break;
     }
     
     offset = nextElementOffset;
  }
  
  return {
    info: info as WebmInfo,
    tracks,
    cuesOffset
  };
};

const parseSeekHead = async (reader: Reader, offset: number, size: number, callback: (id: number, pos: number) => void) => {
  let current = offset;
  const end = offset + size;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === 0x4DBB) { // Seek
      let seekId = 0;
      let seekPos = 0;
      
      let subCurrent = content;
      const subEnd = content + elSize;
      
      while (subCurrent < subEnd) {
         const { id: subId, size: subSize, headerSize: subHeaderSize } = await readElementHeader(reader, subCurrent);
         const subContent = subCurrent + subHeaderSize;
         
         if (subId === 0x53AB) { // SeekID
           const data = await reader.read(subContent, subSize);
           const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
           // SeekID is binary, but usually matches EBML IDs.
           // It can be 4 bytes.
           const { value } = readVint(view, 0); // It's stored as VINT? No, it's binary.
           // Wait, SeekID is "Binary". But it represents an EBML ID.
           // EBML IDs are VINT-encoded in the file structure, but here it's just bytes.
           // Let's read it as bytes and construct the number.
           let idVal = 0;
           for(let i=0; i<subSize; i++) {
             idVal = (idVal * 256) + view.getUint8(i);
           }
           seekId = idVal;
         } else if (subId === 0x53AC) { // SeekPosition
           const data = await reader.read(subContent, subSize);
           const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
           // SeekPosition is UInteger.
           // We can reuse readVint logic if we assume it's VINT-like or just readUint.
           // But standard says UInteger.
           let posVal = 0;
           for(let i=0; i<subSize; i++) {
             posVal = (posVal * 256) + view.getUint8(i);
           }
           seekPos = posVal;
         }
         
         subCurrent += subHeaderSize + subSize;
      }
      callback(seekId, seekPos);
    }
    
    current += headerSize + elSize;
  }
};

const parseInfo = async (reader: Reader, offset: number, size: number, info: any) => {
  let current = offset;
  const end = offset + size;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === IDS.TIMECODE_SCALE) {
      const data = await reader.read(content, elSize);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      // UInteger
      let val = 0;
      for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
      info.timecodeScale = val;
    } else if (id === IDS.DURATION) {
      const data = await reader.read(content, elSize);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      info.duration = readFloat(view, 0, elSize);
    } else if (id === IDS.MUXING_APP) {
      const data = await reader.read(content, elSize);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      info.muxingApp = readString(view, 0, elSize);
    } else if (id === IDS.WRITING_APP) {
      const data = await reader.read(content, elSize);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      info.writingApp = readString(view, 0, elSize);
    }
    
    current += headerSize + elSize;
  }
};

const parseTracks = async (reader: Reader, offset: number, size: number): Promise<WebmTrack[]> => {
  const tracks: WebmTrack[] = [];
  let current = offset;
  const end = offset + size;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === IDS.TRACK_ENTRY) {
      const track = await parseTrackEntry(reader, content, elSize);
      tracks.push(track);
    }
    
    current += headerSize + elSize;
  }
  return tracks;
};

const parseTrackEntry = async (reader: Reader, offset: number, size: number): Promise<WebmTrack> => {
  const track: any = {};
  let current = offset;
  const end = offset + size;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === IDS.TRACK_NUMBER) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       let val = 0;
       for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
       track.trackNumber = val;
    } else if (id === IDS.TRACK_TYPE) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       let val = 0;
       for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
       track.trackType = val;
    } else if (id === IDS.CODEC_ID) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       track.codecId = readString(view, 0, elSize);
    } else if (id === IDS.VIDEO) {
       track.video = await parseVideo(reader, content, elSize);
    } else if (id === IDS.AUDIO) {
       track.audio = await parseAudio(reader, content, elSize);
    }
    
    current += headerSize + elSize;
  }
  return track as WebmTrack;
};

const parseVideo = async (reader: Reader, offset: number, size: number) => {
  const video: any = {};
  let current = offset;
  const end = offset + size;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === IDS.PIXEL_WIDTH) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       let val = 0;
       for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
       video.width = val;
    } else if (id === IDS.PIXEL_HEIGHT) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       let val = 0;
       for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
       video.height = val;
    }
    
    current += headerSize + elSize;
  }
  return video;
};

const parseAudio = async (reader: Reader, offset: number, size: number) => {
  const audio: any = {};
  let current = offset;
  const end = offset + size;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === IDS.SAMPLING_FREQ) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       audio.sampleRate = readFloat(view, 0, elSize);
    } else if (id === IDS.CHANNELS) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       let val = 0;
       for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
       audio.channels = val;
    }
    
    current += headerSize + elSize;
  }
  return audio;
};

// --- Cues Scanner ---

export const scanCues = async (reader: Reader, cuesOffset: number, timecodeScale: number): Promise<number | null> => {
  // Read Cues element
  const { id, size, headerSize } = await readElementHeader(reader, cuesOffset);
  
  if (id !== IDS.CUES) {
    return null;
  }
  
  // We want the last CuePoint
  // Since Cues can be large, we might want to scan it or just read it all if it's reasonable.
  // But standard says "The Cues element is a list of CuePoint elements".
  // We can iterate them.
  
  let current = cuesOffset + headerSize;
  const end = cuesOffset + headerSize + size;
  
  let maxTime = 0;
  
  while (current < end) {
    const { id: subId, size: subSize, headerSize: subHeaderSize } = await readElementHeader(reader, current);
    
    if (subId === IDS.CUE_POINT) {
      // Parse CuePoint to get CueTime
      const cueTime = await parseCuePoint(reader, current + subHeaderSize, subSize);
      if (cueTime > maxTime) {
        maxTime = cueTime;
      }
    }
    
    current += subHeaderSize + subSize;
  }
  
  return (maxTime * timecodeScale) / 1e9;
};

const parseCuePoint = async (reader: Reader, offset: number, size: number): Promise<number> => {
  let current = offset;
  const end = offset + size;
  let time = 0;
  
  while (current < end) {
    const { id, size: elSize, headerSize } = await readElementHeader(reader, current);
    const content = current + headerSize;
    
    if (id === IDS.CUE_TIME) {
       const data = await reader.read(content, elSize);
       const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
       // UInteger
       let val = 0;
       for(let i=0; i<elSize; i++) val = (val * 256) + view.getUint8(i);
       time = val;
    }
    
    current += headerSize + elSize;
  }
  return time;
};

// --- Tail Scanner ---

export const scanTail = async (reader: Reader, fileSize: number, timecodeScale: number): Promise<number | null> => {
  const SCAN_SIZE = 2 * 1024 * 1024; // 2MB
  const startOffset = Math.max(0, fileSize - SCAN_SIZE);
  const length = fileSize - startOffset;
  
  if (length <= 0) return null;
  
  const buffer = await reader.read(startOffset, length);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  let maxTimecode = 0;
  let found = false;
  
  // Scan for Cluster ID: 0x1F43B675
  // We iterate byte by byte
  
  for (let i = 0; i < length - 4; i++) {
    // Check for Cluster ID
    if (view.getUint32(i, false) === IDS.CLUSTER) { // Big Endian
       // Validate Cluster
       // Read Size (VINT)
       try {
         const { value: size, length: sizeLen } = readVint(view, i + 4);
         
         // Basic validation
         
         const clusterContentStart = i + 4 + sizeLen;
         let currentClusterTimecode = 0;
         let clusterHasTimecode = false;
         
         // Check if we have enough bytes to read Timecode ID (1 byte) + Size (1 byte) + Value (maybe 2-4 bytes)
         if (clusterContentStart + 4 <= length) {
           const { value: firstId, length: firstIdLen } = readID(view, clusterContentStart);
           
           // Timecode ID is 0xE7.
           if (firstId === IDS.TIMECODE) {
             // Read size
             const { value: tcSize, length: tcSizeLen } = readVint(view, clusterContentStart + firstIdLen);
             const tcValStart = clusterContentStart + firstIdLen + tcSizeLen;
             
             // Read Timecode Value (UInteger)
             let tcVal = 0;
             for(let k=0; k<tcSize; k++) {
               if (tcValStart + k >= length) break;
               tcVal = (tcVal * 256) + view.getUint8(tcValStart + k);
             }
             
             currentClusterTimecode = tcVal;
             clusterHasTimecode = true;
             found = true;
             
             if (tcVal > maxTimecode) {
               maxTimecode = tcVal;
             }
             
             // Now scan for Blocks inside this Cluster to get more precise duration
             let blockScanOffset = tcValStart + tcSize;
             const clusterEnd = (size === VINT_UNKNOWN_MARKER) ? length : (clusterContentStart + size);
             
             while (blockScanOffset < Math.min(clusterEnd, length)) {
                // Read Element Header
                try {
                  const { value: elId, length: elIdLen } = readID(view, blockScanOffset);
                  const { value: elSize, length: elSizeLen } = readVint(view, blockScanOffset + elIdLen);
                  const elContentStart = blockScanOffset + elIdLen + elSizeLen;
                  
                  if (elId === IDS.SIMPLE_BLOCK || elId === IDS.BLOCK_GROUP) {
                     // We want to read the Timecode (Int16) from the Block/SimpleBlock data.
                     // SimpleBlock: [TrackNum(VINT), Timecode(Int16), ...]
                     // BlockGroup: Contains Block(0xA1). Block: [TrackNum(VINT), Timecode(Int16), ...]
                     
                     let blockDataStart = elContentStart;
                     
                     if (elId === IDS.BLOCK_GROUP) {
                        // Find Block inside BlockGroup
                        // Scan children of BlockGroup
                        let bgCurrent = elContentStart;
                        const bgEnd = elContentStart + elSize;
                        let foundBlock = false;
                        
                        while (bgCurrent < Math.min(bgEnd, length)) {
                           const { value: bgId, length: bgIdLen } = readID(view, bgCurrent);
                           const { value: bgSize, length: bgSizeLen } = readVint(view, bgCurrent + bgIdLen);
                           if (bgId === 0xA1) { // Block ID
                              blockDataStart = bgCurrent + bgIdLen + bgSizeLen;
                              foundBlock = true;
                              break;
                           }
                           bgCurrent += bgIdLen + bgSizeLen + bgSize;
                        }
                        if (!foundBlock) {
                           blockScanOffset = elContentStart + elSize;
                           continue;
                        }
                     }
                     
                     // Now we are at the start of SimpleBlock or Block data
                     // Read TrackNumber (VINT)
                     const { length: trackNumLen } = readVint(view, blockDataStart);
                     const timecodeOffset = blockDataStart + trackNumLen;
                     
                     if (timecodeOffset + 2 <= length) {
                        const relTimecode = view.getInt16(timecodeOffset, false); // Big Endian
                        const absTimecode = currentClusterTimecode + relTimecode;
                        
                        if (absTimecode > maxTimecode) {
                           maxTimecode = absTimecode;
                        }
                     }
                  }
                  
                  blockScanOffset = elContentStart + elSize;
                } catch (e) {
                  break; // Stop scanning blocks if error
                }
             }
           }
         }
         
       } catch (e) {
         // Invalid VINT or something, continue scanning
       }
    }
  }
  
  if (!found) return null;
  
  return (maxTimecode * timecodeScale) / 1e9;
};
