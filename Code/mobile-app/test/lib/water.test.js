import { getLevelPercent, hasWater } from "../../src/lib/water";

describe("getLevelPercent", () => {
  it("returns 0 when weight is null", () => {
    expect(getLevelPercent(null)).toBe(0);
  });

  it("returns 0 when weight is at or below empty", () => {
    expect(getLevelPercent(0, 0, 100)).toBe(0);
    expect(getLevelPercent(-1, 0, 100)).toBe(0);
  });

  it("returns 0 when full is less than or equal to empty", () => {
    expect(getLevelPercent(50, 100, 100)).toBe(0);
    expect(getLevelPercent(50, 200, 100)).toBe(0);
  });

  it("returns 100 when weight is at full", () => {
    expect(getLevelPercent(100, 0, 100)).toBe(100);
  });

  it("interpolates between empty and full", () => {
    expect(getLevelPercent(50, 0, 100)).toBe(50);
  });

  it("uses defaults when empty/full omitted", () => {
    expect(getLevelPercent(1250, 0, 2500)).toBe(50);
    expect(getLevelPercent(1250)).toBe(50);
  });
});

describe("hasWater", () => {
  it("is false when weight is null", () => {
    expect(hasWater(null)).toBe(false);
  });

  it("is false when weight is at or below empty", () => {
    expect(hasWater(0, 0)).toBe(false);
    expect(hasWater(10, 10)).toBe(false);
  });

  it("is true when weight is above empty", () => {
    expect(hasWater(1, 0)).toBe(true);
  });

  it("uses default empty when emptyG omitted", () => {
    expect(hasWater(1)).toBe(true);
    expect(hasWater(0)).toBe(false);
  });
});
