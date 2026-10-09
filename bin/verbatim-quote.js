#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
// verbatim-quote <source-file|-> <quote> [flags]
// verbatim-quote <source-file|-> --quotes <quotes.json|-> [flags]
//
// Flags: --ignore-case --ellipsis --ignore-whitespace --json
//
// Exit code 0 when every quote is found, 1 when at least one is missing, 2 on bad usage:
// an unknown flag, a missing or extra argument, a file that cannot be read, quotes that are
// not a JSON array of strings or objects with a `quote` field, or an empty array.

import { readFileSync } from "node:fs";
import { checkQuotes, explainMiss, findQuote, sentenceAt } from "../index.js";

const USAGE =
  "Usage: verbatim-quote <source-file|-> <quote> [--ignore-case] [--ellipsis] [--ignore-whitespace] [--json] [--explain]\n" +
  "       verbatim-quote <source-file|-> --quotes <quotes.json|-> [--json] [--ignore-case] [--ellipsis] [--ignore-whitespace] [--explain]";
const KNOWN_FLAGS = new Set(["--ignore-case", "--ellipsis", "--ignore-whitespace", "--json", "--explain", "--help"]);

function fail(message) {
  if (message) console.error(`verbatim-quote: ${message}`);
  console.error(USAGE);
  process.exit(2);
}

const flags = new Set();
const positional = [];
let quotesFile = null;
let flagsEnded = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!flagsEnded && arg === "--") {
    flagsEnded = true; // everything after -- is an argument, so a quote may start with --
  } else if (!flagsEnded && arg === "--quotes") {
    quotesFile = argv[i + 1];
    if (quotesFile === undefined) fail("missing file after --quotes");
    i += 1;
  } else if (!flagsEnded && arg.startsWith("--")) {
    if (!KNOWN_FLAGS.has(arg)) fail(`unknown flag ${arg}`);
    flags.add(arg);
  } else {
    positional.push(arg);
  }
}
if (flags.has("--help")) fail();

const options = {
  ignoreCase: flags.has("--ignore-case"),
  allowEllipsis: flags.has("--ellipsis"),
  whitespace: flags.has("--ignore-whitespace") ? "ignore" : "collapse",
};

function readInput(file, what) {
  try {
    return readFileSync(file === "-" ? 0 : file, "utf8");
  } catch (error) {
    console.error(`verbatim-quote: cannot read ${file} (${what}): ${error.message}`);
    process.exit(2);
  }
}

// Quotes longer than 60 graphemes are cut at 60 and end with an ellipsis character.
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
function display(quote) {
  const units = [...graphemes.segment(quote)];
  return units.length > 60 ? units.slice(0, 60).map((g) => g.segment).join("") + "…" : quote;
}

// With --explain, a close diagnosis adds the suggested passage and the first difference,
// indented under its own line in batch mode.
function explainLines(miss, indent) {
  if (!miss || miss.status !== "close") return [];
  const lines = [`closest at ${miss.nearest.start}-${miss.nearest.end}: ${miss.nearest.text}`];
  const difference = miss.differences[0];
  if (difference) lines.push(`difference: quote "${difference.quote}", source "${difference.source}"`);
  return lines.map((line) => indent + line);
}

if (quotesFile !== null) {
  if (positional.length < 1) fail();
  if (positional.length > 1) fail("a positional quote cannot be combined with --quotes");
  const [file] = positional;
  if (file === "-" && quotesFile === "-") fail("the source and the quotes cannot both be standard input");
  const source = readInput(file, "source");
  const raw = readInput(quotesFile, "quotes");

  let items;
  try {
    items = JSON.parse(raw);
  } catch (error) {
    fail(`the quotes file is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(items) || items.some((item) => typeof item !== "string" && typeof item?.quote !== "string")) {
    fail('the quotes file must be an array of strings or objects with a string field "quote"');
  }
  if (items.length === 0) fail("the quotes file contains no quotes");

  const report = checkQuotes(items, source, options);
  if (flags.has("--json")) {
    const withMiss = flags.has("--explain")
      ? {
          ...report,
          results: report.results.map((result) =>
            result.match === null ? { ...result, miss: explainMiss(typeof result.quote === "string" ? result.quote : "", source, options) } : result,
          ),
        }
      : report;
    console.log(JSON.stringify({ version: 1, ...withMiss }, null, 2));
  } else {
    for (const [i, item] of items.entries()) {
      const match = report.results[i].match;
      const quote = typeof item === "string" ? item : item.quote;
      if (match) console.log(`found ${match.start}-${match.end}  ${display(quote)}`);
      else {
        console.log(`missing      ${display(quote)}`);
        if (flags.has("--explain")) {
          for (const line of explainLines(explainMiss(quote, source, options), "  ")) console.log(line);
        }
      }
    }
    console.log(`${report.found} found, ${report.missing} missing`);
  }
  process.exit(report.missing > 0 ? 1 : 0);
}

if (positional.length > 2) fail("too many arguments");
if (positional.length !== 2) fail();
const [file, quote] = positional;
const source = readInput(file, "source");

const match = findQuote(quote, source, options);
const sentence = match ? sentenceAt(source, match.start) : null;

if (flags.has("--json")) {
  const miss = match === null && flags.has("--explain") ? explainMiss(quote, source, options) : undefined;
  console.log(JSON.stringify({ found: match !== null, match, sentence, ...(miss !== undefined && { miss }) }, null, 2));
} else if (match) {
  console.log(`found at ${match.start}-${match.end}: ${match.text}`);
  if (sentence) console.log(`sentence: ${sentence.text}`);
} else {
  console.log("not found");
  if (flags.has("--explain")) {
    for (const line of explainLines(explainMiss(quote, source, options), "")) console.log(line);
  }
}
process.exit(match ? 0 : 1);
