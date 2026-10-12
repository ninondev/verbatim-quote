// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
// The two hero images carry a <metadata id="facts"> block with the strings and the values
// they show. This test recomputes every value with the library and the similarity function
// of the comparison-table test, so the images cannot drift either.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { findQuote } from "../index.js";
import { similarity } from "./similarity.mjs";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

for (const file of ["docs/hero-light.svg", "docs/hero-dark.svg"]) {
  test(`${file}: every value in the facts block is what the code computes`, () => {
    const svg = readFileSync(path.join(root, file), "utf8");
    const raw = /<metadata id="facts">([\s\S]*?)<\/metadata>/.exec(svg)?.[1];
    assert.ok(raw, "the image must keep its <metadata id=\"facts\"> block");
    const facts = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    const sourceCodePoints = [...facts.source];

    for (const entry of facts.quotes) {
      assert.equal(facts.source.includes(entry.quote), entry.includes, `includes for ${entry.quote}`);
      assert.equal(similarity(facts.source, entry.quote).toFixed(2), entry.similarity, `similarity for ${entry.quote}`);

      const match = findQuote(entry.quote, facts.source);
      assert.equal(match !== null, entry.verbatim, `verbatim result for ${entry.quote}`);
      if (entry.verbatim) {
        assert.equal(match.start, entry.start, `offsets for ${entry.quote}`);
        assert.equal(match.end, entry.end, `offsets for ${entry.quote}`);
        assert.equal(facts.source.slice(match.start, match.end), match.text);
      }

      const differsAt = [...entry.quote]
        .map((c, i) => (i < sourceCodePoints.length && c !== sourceCodePoints[i] ? i : -1))
        .filter((i) => i >= 0);
      assert.deepEqual(differsAt, entry.differs_at, `positions where ${entry.quote} differs`);
    }
  });
}
