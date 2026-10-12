// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// Runs every case in spec/cases.json: the shared, plain-data list of what must
// match and what must not under the folding, cluster, boundary and ellipsis rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { findQuote } from "../index.js";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const cases = JSON.parse(readFileSync(path.join(root, "spec", "cases.json"), "utf8"));

test("spec/cases.json is a non-empty array of well-formed cases", () => {
  assert.ok(Array.isArray(cases) && cases.length > 0);
  const names = new Set();
  for (const c of cases) {
    assert.equal(typeof c.name, "string", "name is required");
    assert.equal(typeof c.quote, "string", "quote is required");
    assert.equal(typeof c.source, "string", "source is required");
    assert.ok(c.expect === "match" || c.expect === "miss", "expect is match or miss");
    assert.ok(!names.has(c.name), `duplicate case name: ${c.name}`);
    names.add(c.name);
    if (c.start !== undefined || c.end !== undefined) {
      assert.ok(c.expect === "match" && Number.isInteger(c.start) && Number.isInteger(c.end),
        "offsets belong to a match case");
    }
  }
});

for (const { name, quote, source, options, expect, start, end } of cases) {
  test(`cases.json: ${name}`, () => {
    const match = findQuote(quote, source, options);
    if (expect === "miss") {
      assert.equal(match, null, JSON.stringify({ quote, source, options }));
    } else {
      assert.ok(match, JSON.stringify({ quote, source, options }));
      if (start !== undefined) assert.equal(match.start, start, JSON.stringify({ quote, source, options }));
      if (end !== undefined) assert.equal(match.end, end, JSON.stringify({ quote, source, options }));
      assert.equal(source.slice(match.start, match.end), match.text);
    }
  });
}
