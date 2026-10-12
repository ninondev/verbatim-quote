// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainMiss } from "../index.js";

function editDistance(left, right) {
  const a = [...left];
  const b = [...right];
  let row = b.map((_, j) => j + 1);
  row.unshift(0);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

test("a missing leading letter is a close passage at distance one", () => {
  const miss = explainMiss("nter now", "they enter now");
  assert.equal(miss.status, "close");
  assert.deepEqual(miss.nearest, { start: 5, end: 14, text: "enter now" });
  assert.equal(miss.distance, 1);
  assert.deepEqual(miss.differences, [{ kind: "changed", quote: "nter", source: "enter", start: 5, end: 10 }]);
});

test("a rejected word suffix includes its two leading letters in the distance", () => {
  const miss = explainMiss("eligible to enter", "Minors are ineligible to enter");
  assert.equal(miss.status, "close");
  assert.equal(miss.nearest.text, "ineligible to enter");
  assert.equal(miss.distance, 2);
});

test("reported diagnostic distances equal an independent edit distance on seeded inputs", (t) => {
  let seed = 0x74657874;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 0x100000000 * n);
  };
  const word = () => Array.from({ length: 4 + random(8) }, () => "abcde"[random(5)]).join("");
  let checked = 0;
  for (let i = 0; i < 3000; i += 1) {
    const passage = `${word()} ${word()} ${word()}`;
    const source = `${word()} ${passage} ${word()}`;
    let quote = passage.slice(random(4), passage.length - random(4));
    if (random(2)) {
      const at = random(quote.length);
      quote = quote.slice(0, at) + "f" + quote.slice(at + 1);
    }
    const miss = explainMiss(quote, source);
    if (miss?.status !== "close") continue;
    checked += 1;
    assert.equal(source.slice(miss.nearest.start, miss.nearest.end), miss.nearest.text);
    // These ASCII inputs already have the comparison spelling. Preserve any space at the
    // passage edge: it is part of the alignment, rather than normalizing it away again.
    assert.equal(miss.distance, editDistance(quote, miss.nearest.text),
      JSON.stringify({ quote, source, miss }));
  }
  assert.ok(checked >= 1000, `only ${checked} close passages were checked`);
  t.diagnostic(`${checked} close passages checked against independent edit distance`);
});
