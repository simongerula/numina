import { describe, expect, it } from "vitest";
import { centsFromInput, formatMoney, formatSignedMoney } from "./format";

describe("formatMoney", () => {
  it("formats cents as dollars with grouping", () => {
    expect(formatMoney(123456)).toMatch(/\$1,234\.56/);
    expect(formatMoney(5)).toMatch(/\$0\.05/);
  });

  it("signs negatives with a leading dash", () => {
    expect(formatMoney(-123456)).toMatch(/-\$1,234\.56/);
  });

  it("blanks when balances are hidden", () => {
    expect(formatMoney(123456, true)).toBe("••••");
  });
});

describe("formatSignedMoney", () => {
  it("prefixes + and − explicitly", () => {
    expect(formatSignedMoney(1000)).toMatch(/^\+\$10\.00$/);
    expect(formatSignedMoney(-1000)).toMatch(/^-\$10\.00$/);
  });
});

describe("centsFromInput", () => {
  it("converts typed dollars to cents, tolerating $ and ,", () => {
    expect(centsFromInput("12.5")).toBe(1250);
    expect(centsFromInput("$1,000")).toBe(100000);
    expect(centsFromInput("0.01")).toBe(1);
    expect(centsFromInput(" 42 ")).toBe(4200);
  });

  it("rejects non-numbers, zero, and more than 2 decimals", () => {
    expect(centsFromInput("abc")).toBeNull();
    expect(centsFromInput("0")).toBeNull();
    expect(centsFromInput("")).toBeNull();
    expect(centsFromInput("1.999")).toBeNull();
    expect(centsFromInput("NaN")).toBeNull();
  });
});
