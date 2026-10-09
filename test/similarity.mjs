// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Ninon
// The similarity used by the README's comparison table and the hero images:
// 1 - levenshtein / length of the longer string, counted in code points.
export function levenshtein(a, b) {
  const A = [...a];
  const B = [...b];
  let previous = Array.from({ length: B.length + 1 }, (_, j) => j);
  let current = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= B.length; j += 1) {
      current[j] = Math.min(
        previous[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1),
        previous[j] + 1,
        current[j - 1] + 1,
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[B.length];
}

export function similarity(a, b) {
  return 1 - levenshtein(a, b) / Math.max([...a].length, [...b].length);
}
