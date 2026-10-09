// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

test("test file names describe behaviour without review process labels", () => {
  const files = readdirSync(new URL("./", import.meta.url)).filter((file) => file.endsWith(".test.js"));
  assert.ok(files.length > 0);
  assert.deepEqual(files.filter((file) => file.startsWith("audit-")), []);
});
