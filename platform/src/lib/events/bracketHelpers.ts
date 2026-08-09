export function nextPowerOfTwoForTest(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
