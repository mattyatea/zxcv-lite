import { describe, expect, it } from "vitest";
import { parseRulePath } from "../../../../server/utils/rulesNamespace";

describe("rules namespace utilities", () => {
	describe("parseRulePath", () => {
		it("should parse valid rule path with @", () => {
			const result = parseRulePath("@owner/rule-name");
			expect(result).toEqual({
				owner: "owner",
				ruleName: "rule-name",
			});
		});

		it("should parse valid rule path without @", () => {
			const result = parseRulePath("owner/rule-name");
			expect(result).toEqual({
				owner: "owner",
				ruleName: "rule-name",
			});
		});

		it("should parse rule path with no owner", () => {
			const result = parseRulePath("rule-name");
			expect(result).toEqual({
				ruleName: "rule-name",
			});
		});

		it("should handle paths with hyphens and underscores", () => {
			const result = parseRulePath("@test-owner_123/my-cool_rule");
			expect(result).toEqual({
				owner: "test-owner_123",
				ruleName: "my-cool_rule",
			});
		});

		it("should return null for invalid paths", () => {
			expect(parseRulePath("")).toBeNull();
			expect(parseRulePath("owner/rule/extra")).toBeNull();
			expect(parseRulePath("/rule")).toBeNull();
			expect(parseRulePath("owner/")).toBeNull();
		});
	});
});
