// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function reportedTests(output) {
  const plain = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const matches = [...plain.matchAll(/^[\t ]*(?:#|ℹ)[\t ]+tests[\t ]+(\d+)[\t ]*\r?$/gm)];
  if (matches.length !== 1) throw new Error("Test runner must report exactly one unambiguous test count.");
  return Number(matches[0][1]);
}

export function readOmissions(root) {
  const manifest = path.join(root, [".", "publicignore"].join(""));
  return existsSync(manifest)
    ? readFileSync(manifest, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : null;
}

export async function loadExportMetadata(root) {
  const omissions = readOmissions(root);
  if (omissions === null) return null;
  for (const entry of omissions.filter((entry) => entry.endsWith("/"))) {
    for (const file of readdirSync(path.join(root, entry))) {
      if (!/\.m?js$/.test(file)) continue;
      const module = await import(pathToFileURL(path.join(root, entry, file)).href);
      if (typeof module.auditExportMetadata === "function") return module;
    }
  }
  throw new Error("The workspace manifest must identify its export metadata checks.");
}
