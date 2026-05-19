#!/usr/bin/env node

import { HELP_TEXT, HelpRequested, parseArgs, wantsJson } from "./args.js";
import {
  assertWebToolsCompatible,
  canonicalizeMode,
  loadConfig,
  resolveCliOptions,
  resolveWebOptions,
  validateWebOptions,
} from "./config.js";
import { formatError, formatJson, formatMarkdown, formatRaw } from "./formatters.js";
import { runMode } from "./modes.js";
import { callOpenRouter } from "./openrouter.js";

async function main() {
  const argv = process.argv.slice(2);
  let jsonMode = wantsJson(argv);

  try {
    const parsedOptions = parseArgs(argv);
    jsonMode = parsedOptions.json;
    const config = loadConfig();
    const options = resolveCliOptions(config, parsedOptions);
    const { mode } = canonicalizeMode(options.mode);
    const web = resolveWebOptions(config, mode, options.web);
    validateWebOptions(web, options.web);
    assertWebToolsCompatible(config, options.profile, mode, web);

    if (web.searchEnabled) {
      console.error("hint: OpenRouter web search is enabled (--no-web to disable)");
    }

    const result = await runMode(config, options, (call) => callOpenRouter(config.openrouter, call));

    if (!options.json && options.outputFormat === "raw" && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.error(`warning: ${warning}`);
      }
    }

    if (options.json) {
      console.log(formatJson(result));
    } else if (options.outputFormat === "raw") {
      console.log(formatRaw(result));
    } else {
      console.log(formatMarkdown(result));
    }
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(HELP_TEXT);
      return;
    }

    console.error(formatError(error, jsonMode));
    process.exitCode = 1;
  }
}

await main();
