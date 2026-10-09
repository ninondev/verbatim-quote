// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportedTests } from "./export-support.mjs";

for (const [name, output] of [
  ["TAP", "# tests 4\n# pass 4\n# fail 0\n"],
  ["spec", "ℹ tests 4\nℹ pass 4\nℹ fail 0\n"],
  ["decorated spec", "  \u001b[32mℹ\u001b[39m tests \u001b[33m4\u001b[39m\r\n"],
]) {
  test(`${name} summaries retain the actual reported test count`, () => {
    assert.equal(reportedTests(output), 4);
  });
}

test("an absent or malformed runner summary cannot count as completed tests", () => {
  for (const output of ["", "ordinary text: tests 4", "# tests 4x\n", "# tests 4\n# tests 5\n"])
    assert.throws(() => reportedTests(output));
});
