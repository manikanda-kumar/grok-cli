#!/usr/bin/env node

import { HELP_TEXT, HelpRequested, parseArgs } from "./args.js";

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(options, null, 2));
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(HELP_TEXT);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error(HELP_TEXT);
    process.exitCode = 1;
  }
}

await main();
