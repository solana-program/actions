import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_MASK_PATTERN,
  MASK_PLACEHOLDER,
  maskValue,
  parseMaskPatterns,
  shouldMask,
} from "./mask.ts";

describe("parseMaskPatterns", () => {
  it("returns an empty array for undefined input", () => {
    expect(parseMaskPatterns(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseMaskPatterns("")).toEqual([]);
  });

  it("parses a single pattern", () => {
    const patterns = parseMaskPatterns("foo");
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.source).toBe("foo");
  });

  it("splits on commas and trims whitespace", () => {
    const patterns = parseMaskPatterns("foo, bar ,baz");
    expect(patterns.map((p) => p.source)).toEqual(["foo", "bar", "baz"]);
  });

  it("drops empty entries", () => {
    const patterns = parseMaskPatterns("foo,,bar");
    expect(patterns).toHaveLength(2);
  });

  it("honors a (?i) prefix as a case-insensitive flag", () => {
    const patterns = parseMaskPatterns("(?i)secret");
    expect(patterns[0]?.flags).toContain("i");
    expect(patterns[0]?.source).toBe("secret");
  });

  it("throws a descriptive error for invalid patterns", () => {
    expect(() => parseMaskPatterns("[unclosed")).toThrow(/Invalid mask pattern/);
  });
});

describe("shouldMask", () => {
  it("returns false when no patterns match", () => {
    const patterns = parseMaskPatterns("secret");
    expect(shouldMask("environment", patterns)).toBe(false);
  });

  it("returns true when any pattern matches", () => {
    const patterns = parseMaskPatterns("(?i)secret,(?i)token");
    expect(shouldMask("GH_TOKEN", patterns)).toBe(true);
  });

  it("returns false when patterns list is empty", () => {
    expect(shouldMask("secret", [])).toBe(false);
  });
});

describe("maskValue", () => {
  const patterns = parseMaskPatterns(DEFAULT_MASK_PATTERN);

  it("redacts values whose key matches a pattern", () => {
    expect(maskValue("api_key", "abcd1234", patterns)).toBe(MASK_PLACEHOLDER);
    expect(maskValue("apiKey", "abcd1234", patterns)).toBe(MASK_PLACEHOLDER);
    expect(maskValue("PASSWORD", "hunter2", patterns)).toBe(MASK_PLACEHOLDER);
  });

  it("returns the value untouched when the key does not match", () => {
    expect(maskValue("environment", "production", patterns)).toBe("production");
    expect(maskValue("dryRun", "false", patterns)).toBe("false");
  });

  it("handles the empty value gracefully", () => {
    expect(maskValue("token", "", patterns)).toBe(MASK_PLACEHOLDER);
  });
});

describe("DEFAULT_MASK_PATTERN", () => {
  const patterns = parseMaskPatterns(DEFAULT_MASK_PATTERN);

  it("matches typical secret-bearing keys", () => {
    for (const key of [
      "token",
      "github_token",
      "GH_TOKEN",
      "secret",
      "mySecret",
      "password",
      "PASSWORD",
      "api_key",
      "api-key",
      "apikey",
      "API_KEY",
    ]) {
      expect(shouldMask(key, patterns)).toBe(true);
    }
  });

  it("does not match common non-secret keys", () => {
    for (const key of ["environment", "dryRun", "version", "branch", "name"]) {
      expect(shouldMask(key, patterns)).toBe(false);
    }
  });
});
