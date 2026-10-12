// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ninon
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

test("an offline tarball install supports ES module imports and the installed CLI", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "verbatim-install-"));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  function run(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  }
  try {
    const [pack] = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], root));
    const install = path.join(temp, "consumer");
    mkdirSync(install);
    run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", path.join(temp, pack.filename)], install);
    const pkg = path.join(install, "node_modules", "verbatim-quote");
    const url = pathToFileURL(path.join(pkg, "index.js")).href;
    const output = run(process.execPath, ["--input-type=module", "-e",
      `import assert from 'node:assert/strict'; import {findQuote, explainMiss} from ${JSON.stringify(url)};
       assert.equal(findQuote('at least 18 years old', 'Entrants must be at least 18 years old.').start, 17);
       assert.equal(findQuote('18.', '18.5'), null);
       const miss = explainMiss('at least 18', 'at least 180 days');
       assert.equal(miss.status, 'close');
       assert.equal(miss.nearest.text, 'at least 180');
       assert.equal(miss.differences[0].source, '180');
       console.log('installed ESM: passed');`,
    ], install);
    assert.equal(output.trim(), "installed ESM: passed");
    assert.equal(readFileSync(path.join(pkg, "index.js"), "utf8"), readFileSync(path.join(root, "index.js"), "utf8"));
    writeFileSync(path.join(install, "rules.txt"), "Entrants must be at least 18 years old.");
    const cli = run("npx", ["--offline", "--no-install", "verbatim-quote", "rules.txt", "at least 18 years old"], install);
    assert.equal(cli, "found at 17-38: at least 18 years old\nsentence: Entrants must be at least 18 years old.\n");
    console.log("offline tarball, installed ESM and npx CLI: passed");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
