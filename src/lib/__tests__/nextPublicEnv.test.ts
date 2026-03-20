import { afterEach, describe, expect, it, vi } from "vitest";
import { isNextPublicEnvEmptyOrWhitespace, readNextPublicEnvKey } from "@/lib/nextPublicEnv";

describe("readNextPublicEnvKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns default when unset", () => {
    expect(readNextPublicEnvKey("___UNSET_TEST_KEY_XYZ___", "def")).toBe("def");
  });

  it("treats empty string as absent", () => {
    vi.stubEnv("NEXT_PUBLIC_TEST_EMPTY", "");
    expect(readNextPublicEnvKey("NEXT_PUBLIC_TEST_EMPTY", "def")).toBe("def");
  });

  it("trims whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_TEST_TRIM", "  webgl  ");
    expect(readNextPublicEnvKey("NEXT_PUBLIC_TEST_TRIM", "svg")).toBe("webgl");
  });
});

describe("isNextPublicEnvEmptyOrWhitespace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true for empty string", () => {
    vi.stubEnv("NEXT_PUBLIC_TEST_EMPTY2", "");
    expect(isNextPublicEnvEmptyOrWhitespace("NEXT_PUBLIC_TEST_EMPTY2")).toBe(true);
  });

  it("is false when unset", () => {
    expect(isNextPublicEnvEmptyOrWhitespace("___UNSET_TEST_KEY_XYZ2___")).toBe(false);
  });
});
