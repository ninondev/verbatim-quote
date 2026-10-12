// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// Executes the README's JavaScript examples as written, so the documented outputs
// cannot drift from the library. The only rewrite is the import specifier, which
// points at this checkout instead of the package name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { findQuote } from "../index.js";
import { similarity } from "./similarity.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const readme = readFileSync(path.join(root, "README.md"), "utf8");
const blocks = [...readme.matchAll(/```js\r?\n([\s\S]*?)```/g)].map((m) => m[1]);

function rewrite(code) {
  return code.replace(
    'from "verbatim-quote"',
    `from ${JSON.stringify(pathToFileURL(path.join(root, "index.js")).href)}`,
  );
}

// Run one identified block with a probe appended; returns the probe's exports.
async function runExample(signature, probe, id) {
  const block = blocks.find((code) => code.includes(signature));
  assert.ok(block, `README.md must keep a js example containing ${JSON.stringify(signature)}`);
  const file = path.join(tmpdir(), `verbatim-readme-${id}-${process.pid}.mjs`);
  writeFileSync(file, `${rewrite(block)}\n${probe}`);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    unlinkSync(file);
  }
}

test("the first-screen example runs and returns the documented values", async () => {
  const example = await runExample(
    "const page = \"Entrants must be at least 18 years old — and “legal residents” of an eligible country.\";",
    `
export const find = findQuote('at least 18 years old - and "legal residents"', page);
export const rejected = findQuote("at least 21 years old", page);
export const explain = explainMiss("at least 21 years old", page);
`,
    "screen",
  );
  assert.deepEqual(
    { start: example.find.start, end: example.find.end, parts: example.find.parts.length },
    { start: 17, end: 62, parts: 1 },
  );
  assert.equal(example.find.text, "at least 18 years old — and “legal residents”");
  assert.equal(example.rejected, null, "a changed digit never matches");
  assert.deepEqual(example.explain, {
    status: "close",
    nearest: { start: 17, end: 38, text: "at least 18 years old" },
    distance: 2,
    differences: [{ kind: "changed", quote: "21", source: "18", start: 26, end: 28 }],
  });
});

test("the use example runs and returns the documented values", async () => {
  const example = await runExample(
    "const page = \"Who can participate",
    `
export const find = findQuote('must be at least 18 years old - and "legal residents"', page);
export const verify = verifyQuote("must be at least 21 years old", page);
export const reportOut = report;
export const sentence = sentenceAt(page, report.results[0].match.start).text;
`,
    "use",
  );
  assert.deepEqual(
    { start: example.find.start, end: example.find.end, parts: example.find.parts.length },
    { start: 33, end: 86, parts: 1 },
  );
  assert.equal(example.find.text, "must be at least 18 years old — and “legal residents”");
  assert.equal(example.verify, false, "a changed digit never matches");
  assert.equal(example.reportOut.found, 1);
  assert.equal(example.reportOut.missing, 1);
  assert.equal(example.reportOut.results[0].rule, "age", "caller's fields are kept");
  assert.equal(example.reportOut.results[1].match, null);
  assert.equal(
    example.sentence,
    "Participants must be at least 18 years old — and “legal residents” of an eligible country.",
  );
});

test("the model-output example runs and returns the documented values", async () => {
  const example = await runExample(
    "const evidence = [",
    `
export const keptOut = kept;
export const reportOut = report;
export const wrongQuote = wrong.quote;
export const droppedSource = explainMiss(wrong.quote, page).differences[0].source;
`,
    "model",
  );
  assert.deepEqual(example.keptOut, ["Entrants must be 18 or older"]);
  assert.equal(example.reportOut.found, 1);
  assert.equal(example.reportOut.missing, 1);
  assert.equal(example.wrongQuote, "Entries must be shared publicly");
  assert.ok(example.droppedSource.includes("not"), "the dropped word is named");
});

test("every cell of the comparison table is what the code computes", () => {
  const rows = [
    {
      source: "at least 18 years old — and “legal residents”",
      quote: 'at least 18 years old - and "legal residents"',
      includes: "**misses it**",
      similarityCell: "accepts",
      verbatim: "found",
    },
    {
      source: "at least 18 years old — and “legal residents”",
      quote: "at least 21 years old — and “legal residents”",
      includes: "rejects",
      similarityCell: "**accepts a changed number**",
      verbatim: "rejects",
    },
    {
      source: "Entries must not be shared publicly before judging ends",
      quote: "Entries must be shared publicly before judging ends",
      includes: "rejects",
      similarityCell: '**accepts a dropped "not"**',
      verbatim: "rejects",
    },
    {
      source: "at least 180 days",
      quote: "at least 18",
      includes: "**accepts a cut-off number**",
      similarityCell: "rejects",
      verbatim: "rejects",
    },
    {
      source: "参赛对象：在校学生",
      quote: "参赛对象:在校学生",
      includes: "**misses it**",
      similarityCell: "rejects",
      verbatim: "found",
    },
  ];
  for (const row of rows) {
    const includesVerdict = row.source.includes(row.quote);
    const sim = similarity(row.source, row.quote);
    const match = findQuote(row.quote, row.source);

    // The cell text must agree with the computed verdicts, whatever they are.
    assert.equal(/accepts/.test(row.includes), includesVerdict, `includes() cell: ${row.quote}`);
    assert.equal(/misses|rejects/.test(row.includes), !includesVerdict, `includes() cell: ${row.quote}`);
    assert.equal(row.similarityCell.includes("accepts"), sim >= 0.9, `similarity verdict: ${row.quote}`);
    assert.equal(row.verbatim === "found", match !== null, `verbatim verdict: ${row.quote}`);

    const line = `| \`${row.source}\` | \`${row.quote}\` | ${row.includes} | ${sim.toFixed(2)}, ${row.similarityCell} | ${row.verbatim} |`;
    assert.ok(readme.includes(line), `README must contain the computed row:\n${line}`);
  }
});
