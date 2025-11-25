#!/usr/bin/env node
import { openAsBlob } from "node:fs";
import { parseWebm } from "./index.js";

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx webm-meta-lite <file-path>");
    process.exit(1);
  }

  const filePath = args[0];
  try {
    const blob = await openAsBlob(filePath);
    const metadata = await parseWebm(blob);
    console.log(JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error("Error parsing WebM file:", error);
    process.exit(1);
  }
};

main();
