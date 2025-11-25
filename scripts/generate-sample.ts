import { buildWebm } from "../src/test/webm-builder";
import { writeFileSync } from "fs";
import { join } from "path";

const buffer = buildWebm({
  info: {
    duration: 10000, // 10s
    timecodeScale: 1000000, // 1ms
  },
  tracks: [
    {
      type: 1,
      codecId: "V_VP8",
    },
  ],
  clusters: [
    {
      timecode: 0,
    },
  ],
});

const outputPath = join(process.cwd(), "sample.webm");
writeFileSync(outputPath, buffer);
console.log(`Sample WebM file generated at ${outputPath}`);
