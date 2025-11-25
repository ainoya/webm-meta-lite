# webm-meta-lite

A lightweight, functional TypeScript library for parsing WebM metadata.

## Features

- **Fast & Lightweight**: Scans only necessary parts of the file (Header, Cues, Tail) to extract metadata.
- **Browser & Node.js Compatible**: Works with standard `Blob` objects.
- **Zero Runtime Dependencies**: Pure TypeScript implementation.

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

### Output Example

```json
{
  "duration": 120.5,
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

## License

ISC
