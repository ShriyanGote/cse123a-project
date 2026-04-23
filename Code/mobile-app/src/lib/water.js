const DEFAULT_EMPTY_G = 0;
const DEFAULT_FULL_G = 2500;

export function getLevelPercent(weightG, emptyG, fullG) {
  if (weightG == null) return 0;

  const empty = emptyG ?? DEFAULT_EMPTY_G;
  const full = fullG ?? DEFAULT_FULL_G;
  if (full <= empty || weightG <= empty) return 0;

  const ratio = ((weightG - empty) / (full - empty)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

export function hasWater(weightG, emptyG) {
  const empty = emptyG ?? DEFAULT_EMPTY_G;
  return weightG != null && weightG > empty;
}
