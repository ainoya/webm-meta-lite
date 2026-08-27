# webm-meta-lite

A lightweight, functional TypeScript library for parsing WebM metadata.

[![npm version](https://badge.fury.io/js/webm-meta-lite.svg)](https://www.npmjs.com/package/webm-meta-lite)


## Features

- **Fast & Lightweight**: Scans only necessary parts of the file (Header, Cues, Tail) to extract metadata.
- **Robust**: Handles files with missing duration (e.g., from `MediaRecorder`) by scanning the file tail.
- **Browser & Node.js Compatible**: Works with standard `Blob` objects.
- **Zero Runtime Dependencies**: Pure TypeScript implementation.

## Demo

Try the demo here: [https://ainoya.github.io/webm-meta-lite/](https://ainoya.github.io/webm-meta-lite/)

- **Record & Analyze**: Record audio directly in the browser and view its metadata.
- **File Upload**: Upload existing WebM files to inspect their structure and metadata.


## Installation

```bash
npm install webm-meta-lite
```

## Usage

### Basic Usage

```typescript
import { parseWebm } from "webm-meta-lite";

// Example: Parsing a file from an input element
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    const metadata = await parseWebm(file);
    console.log(metadata);
  }
});
```

### Node.js Usage

In Node.js (v19.8.0+), you can use `openAsBlob` to efficiently read files without loading the entire file into memory.

```typescript
import { openAsBlob } from "node:fs";
import { parseWebm } from "webm-meta-lite";

const blob = await openAsBlob("./video.webm");
const metadata = await parseWebm(blob);
console.log(metadata);
```

### Reading from URL (S3, etc.)

To read a file from a URL efficiently (using HTTP Range Requests), use `createFetchReader`. This is ideal for large files stored on S3 or other cloud storage.

```typescript
import { parseWebm, createFetchReader } from "webm-meta-lite";

const url = "https://example.com/large-video.webm";
const reader = await createFetchReader(url);
const metadata = await parseWebm(reader);
console.log(metadata);
```

### Output Example

```json
{
  "durationMilliSeconds": 120500,
  "durationSource": "header",
  "fileSize": 15000000,
  "mimeType": "video/webm; codecs=\"vp9, opus\"",
  "info": {
    "timecodeScale": 1000000,
    "muxingApp": "Chrome",
    "writingApp": "Chrome"
  },
  "tracks": [
    {
      "trackNumber": 1,
      "trackType": 1,
      "codecId": "V_VP9",
      "video": { "width": 1920, "height": 1080 }
    },
    {
      "trackNumber": 2,
      "trackType": 2,
      "codecId": "A_OPUS",
      "audio": { "sampleRate": 48000, "channels": 2 }
    }
  ]
}
```

## Where each field comes from

Most fields are reported exactly as stored in the file; only the duration is resolved by
the library.

| Field | Source |
| --- | --- |
| `info.*`, `tracks[*]` | Read from the file header as-is (Info / Tracks elements) |
| `fileSize` | The size of the source Blob or file, not a value stored in the file |
| `mimeType` | Assembled by this library from the track codec IDs |
| `durationMilliSeconds` | Resolved through the Header → Cues → Tail pipeline below |
| `durationSource` | Which of the three methods produced the duration |

### Duration resolution

The three methods are tried in order, stopping at the first one that yields a value.
`durationSource` reports the one that produced `durationMilliSeconds`, so callers can tell an
exact value from an estimate. It is `undefined` when no method found a duration.

| `durationSource` | Method | Accuracy |
| --- | --- | --- |
| `"header"` | The `Duration` element of the Info header | Exact. Absent in files written by `MediaRecorder` and other live muxers |
| `"cues"` | The last `CueTime` of the Cues index | Estimate: points at the last indexed cluster, not at the end of the last frame |
| `"tail"` | The last Cluster/Block timecode found by scanning the file tail | Estimate: excludes the play time of the last frame itself |

## License

MIT
