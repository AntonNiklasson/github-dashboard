import { describe, it, expect } from "vitest";
import { truncateMiddle } from "./truncate";

describe("truncateMiddle", () => {
  it("returns unchanged for short values (≤ max)", () => {
    expect(truncateMiddle("main")).toBe("main");
    expect(truncateMiddle("feature-login")).toBe("feature-login");
    expect(truncateMiddle("abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(truncateMiddle("very-long-branch")).toBe("very-long-branch");
  });

  it("truncates long values with ... in middle", () => {
    expect(truncateMiddle("feature/new-login")).toBe("featur...-login");
    expect(truncateMiddle("abcdefghijklmnopq")).toBe("abcdef...lmnopq");
  });

  it("respects a custom max", () => {
    expect(truncateMiddle("abcdefghij", 7)).toBe("ab...ij");
    expect(truncateMiddle("short", 10)).toBe("short");
  });

  it("handles very long values", () => {
    expect(truncateMiddle("123456789012345678901")).toBe("123456...678901");
    expect(truncateMiddle("feature/abcdefghijklmnopqrstuvwxyz")).toBe(
      "featur...uvwxyz",
    );
  });
});
