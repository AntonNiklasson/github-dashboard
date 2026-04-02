import { describe, it, expect } from "vitest";
import { truncateBranchName } from "./branch";

describe("truncateBranchName", () => {
	it("returns unchanged for short names (≤16 chars)", () => {
		expect(truncateBranchName("main")).toBe("main");
		expect(truncateBranchName("feature-login")).toBe("feature-login");
		expect(truncateBranchName("abcdefghijklmnop")).toBe("abcdefghijklmnop");
		expect(truncateBranchName("very-long-branch")).toBe("very-long-branch"); // exactly 16 chars
	});

	it("truncates long names with ... in middle", () => {
		// 17 chars: floor((17-3)/2) = 7 → 7 + 3 + 7 = 17
		expect(truncateBranchName("feature/new-login")).toBe("feature...w-login");
		// 17 chars: floor((17-3)/2) = 7 → 7 + 3 + 7 = 17
		expect(truncateBranchName("abcdefghijklmnopq")).toBe("abcdefg...klmnopq");
	});

	it("handles very long branch names", () => {
		// 21 chars: floor((21-3)/2) = 9 → 9 + 3 + 9 = 21
		expect(truncateBranchName("123456789012345678901")).toBe("123456789...345678901");
		// 34 chars: floor((34-3)/2) = 15 → 15 + 3 + 15 = 33
		expect(truncateBranchName("feature/abcdefghijklmnopqrstuvwxyz")).toBe("feature/abcdefg...lmnopqrstuvwxyz");
	});
});