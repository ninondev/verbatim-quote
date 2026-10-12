// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// Runs bin/verbatim-quote.js the way the README documents it, including the
// exit codes scripts rely on: 0 found, 1 not found, 2 bad usage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { findQuote } from "../index.js";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const bin = path.join(root, "bin", "verbatim-quote.js");
const dir = mkdtempSync(path.join(tmpdir(), "verbatim-cli-"));
const page =
  "Who can participate\nParticipants must be at least 18 years old — and “legal residents” of an eligible country.";
const rules = path.join(dir, "rules.txt");
writeFileSync(rules, page);

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", ...options });
}

function foundLine(quote, options) {
  const match = findQuote(quote, page, options);
  assert.ok(match, "test premise: the library itself must find this quote");
  return `found at ${match.start}-${match.end}: ${match.text}`;
}

test("a found quote prints offset and sentence and exits 0, as the README shows", () => {
  const result = run([rules, "must be at least 18 years old"]);
  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    "found at 33-62: must be at least 18 years old\n" +
      "sentence: Participants must be at least 18 years old — and “legal residents” of an eligible country.\n",
  );
});

test("a missing quote exits 1 and says so", () => {
  const result = run([rules, "must be at least 21 years old"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "not found\n");
});

test("a hyphen reads the source from standard input", () => {
  const result = run(["-", "legal residents"], { input: page });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.startsWith(`${foundLine("legal residents")}\n`), result.stdout);
});

test("flags map to the documented options", () => {
  assert.equal(run([rules, "MUST BE AT LEAST 18 YEARS OLD"]).status, 1, "case is kept unless asked");
  assert.equal(run([rules, "MUST BE AT LEAST 18 YEARS OLD", "--ignore-case"]).status, 0);

  const gap = "at least 18 … eligible country";
  assert.equal(run([rules, gap]).status, 1, "an ellipsis needs --ellipsis");
  const ellipsis = run([rules, gap, "--ellipsis"]);
  assert.equal(ellipsis.status, 0);
  assert.ok(ellipsis.stdout.startsWith(`${foundLine(gap, { allowEllipsis: true })}\n`), ellipsis.stdout);

  const zh = path.join(dir, "zh.txt");
  writeFileSync(zh, "参赛对象：全国高校在校学生。");
  const spaced = "参赛对象: 全国 高校在校学生";
  assert.equal(run([zh, spaced]).status, 1, "a space is not forgiven without --ignore-whitespace");
  assert.equal(run([zh, spaced, "--ignore-whitespace"]).status, 0);
});

test("--json prints a machine-readable report", () => {
  const result = run([rules, "must be at least 18 years old", "--json"]);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.found, true);
  assert.equal(report.match.start, 33);
  assert.equal(report.match.end, 62);
  assert.equal(
    report.sentence.text,
    "Participants must be at least 18 years old — and “legal residents” of an eligible country.",
  );
});

test("bad usage exits 2 with a usage line on stderr", () => {
  assert.equal(run([]).status, 2);
  assert.match(run([]).stderr, /^Usage: verbatim-quote/);
});

test("an unknown flag, a missing quote or an extra argument exits 2", () => {
  for (const [name, args] of [
    ["unknown flag", [rules, "a quote", "--nope"]],
    ["missing quote", [rules]],
    ["extra argument", [rules, "a quote", "and one more"]],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, name);
    assert.ok(result.stderr.trim().length > 0, `${name}: a message on stderr`);
  }
});

test("-- ends the flags, so a quote may start with --", () => {
  const dashes = path.join(dir, "dashes.txt");
  writeFileSync(dashes, "Take the --narrow path.");
  const result = run([dashes, "--", "--narrow path"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^found at 9-22: --narrow path/);
});

test("a source file that cannot be read exits 2 with a message, not a stack trace", () => {
  const result = run([path.join(dir, "missing.txt"), "a quote"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^verbatim-quote: cannot read/);
  assert.ok(!result.stderr.includes("\n    at "), "no stack trace on stderr");
});

test("--quotes checks a batch, one line per quote and a summary", () => {
  const quotes = path.join(dir, "quotes.json");
  writeFileSync(quotes, JSON.stringify(["must be at least 18 years old", "must be at least 21 years old"]));
  const result = run([rules, "--quotes", quotes]);
  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    "found 33-62  must be at least 18 years old\n" +
      "missing      must be at least 21 years old\n" +
      "1 found, 1 missing\n",
  );

  const all = path.join(dir, "all.json");
  writeFileSync(all, JSON.stringify(["legal residents"]));
  assert.equal(run([rules, "--quotes", all]).status, 0);
});

test("--quotes reads from standard input and applies the flags", () => {
  const result = run([rules, "--quotes", "-", "--ignore-case"], {
    input: JSON.stringify(["MUST BE AT LEAST 18 YEARS OLD", "must be at least 21 years old"]),
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^found 33-62  MUST BE AT LEAST 18 YEARS OLD\n/);
});

test("--quotes keeps object fields and reports version 1 in --json", () => {
  const quotes = path.join(dir, "objects.json");
  writeFileSync(quotes, JSON.stringify([{ rule: "age", quote: "must be at least 18 years old" }, { rule: "team", quote: "teams of four" }]));
  const result = run([rules, "--quotes", quotes, "--json"]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.version, 1);
  assert.equal(report.found, 1);
  assert.equal(report.missing, 1);
  assert.equal(report.results[0].rule, "age");
  assert.equal(report.results[0].match.start, 33);
  assert.equal(report.results[1].match, null);
});

test("--quotes cuts quotes longer than 60 graphemes", () => {
  const quotes = path.join(dir, "long.json");
  writeFileSync(quotes, JSON.stringify(["x".repeat(70), "\u{1F468}".repeat(61)]));
  const result = run([rules, "--quotes", quotes]);
  assert.equal(result.status, 1);
  const lines = result.stdout.split("\n");
  assert.equal(lines[0], `missing      ${"x".repeat(60)}…`);
  assert.equal(lines[1], `missing      ${"\u{1F468}".repeat(60)}…`);
  assert.equal(lines[2], "0 found, 2 missing");
});

test("--explain adds the closest passage and the first difference", () => {
  const result = run([rules, "must be at least 21 years old", "--explain"]);
  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    "not found\n" +
      "closest at 33-62: must be at least 18 years old\n" +
      'difference: quote "21", source "18"\n',
  );
  const json = run([rules, "must be at least 21 years old", "--explain", "--json"]);
  const report = JSON.parse(json.stdout);
  assert.equal(report.found, false);
  assert.equal(report.miss.status, "close");
  assert.equal(report.miss.differences[0].source, "18");
});

test("--explain indents the explanation under a missing batch line", () => {
  const quotes = path.join(dir, "explain.json");
  writeFileSync(quotes, JSON.stringify(["must be at least 18 years old", "must be at least 21 years old"]));
  const result = run([rules, "--quotes", quotes, "--explain"]);
  assert.equal(
    result.stdout,
    "found 33-62  must be at least 18 years old\n" +
      "missing      must be at least 21 years old\n" +
      "  closest at 33-62: must be at least 18 years old\n" +
      '  difference: quote "21", source "18"\n' +
      "1 found, 1 missing\n",
  );
  const json = run([rules, "--quotes", quotes, "--explain", "--json"]);
  const report = JSON.parse(json.stdout);
  assert.equal(report.results[0].miss, undefined);
  assert.equal(report.results[1].miss.status, "close");
});

test("batch mode refuses what it does not understand", () => {
  const quotes = path.join(dir, "ok.json");
  writeFileSync(quotes, JSON.stringify(["legal residents"]));
  const notArray = path.join(dir, "not-array.json");
  writeFileSync(notArray, JSON.stringify({ quote: "legal residents" }));
  const badItem = path.join(dir, "bad-item.json");
  writeFileSync(badItem, JSON.stringify(["legal residents", 17]));
  const empty = path.join(dir, "empty.json");
  writeFileSync(empty, "[]");

  for (const [name, args] of [
    ["both inputs are -", ["-", "--quotes", "-"]],
    ["positional quote with --quotes", [rules, "a quote", "--quotes", quotes]],
    ["missing source", ["--quotes", quotes]],
    ["unreadable quotes file", [rules, "--quotes", path.join(dir, "nope.json")]],
    ["quotes not an array", [rules, "--quotes", notArray]],
    ["item without a quote", [rules, "--quotes", badItem]],
    ["empty array", [rules, "--quotes", empty]],
    ["missing --quotes argument", [rules, "--quotes"]],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, name);
    assert.ok(result.stderr.trim().length > 0, `${name}: a message on stderr`);
  }
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
