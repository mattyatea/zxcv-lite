import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rulesProcedures } from "../../server/orpc/procedures/rules";
import { createMockContext } from "../helpers/mocks";

const getRuleByIdMock = vi.hoisted(() => vi.fn());
const listRulesMock = vi.hoisted(() => vi.fn());
const searchRulesMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/services", () => ({
	RuleService: class {
		constructor(_db: unknown, _r2: unknown, _env: unknown) {}
		getRuleById = getRuleByIdMock;
		listRules = listRulesMock;
		searchRules = searchRulesMock;
	},
}));

describe("rules API output", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns rule payload for get", async () => {
		getRuleByIdMock.mockResolvedValue({
			id: "rule_123",
			name: "example-rule",
			userId: "user_123",
			visibility: "public",
			description: "Example",
			tags: JSON.stringify(["api", "output"]),
			createdAt: 1700000000,
			updatedAt: 1700000100,
			publishedAt: null,
			version: "1.2.3",
			latestVersionId: "version_9",
			views: 12,
			stars: 3,
			user: {
				id: "user_123",
				username: "demo",
				email: "demo@example.com",
				displayName: "Demo",
				avatarUrl: null,
			},
		});

		const result = await call(
			rulesProcedures.get,
			{ id: "rule_123" },
			{ context: createMockContext({ db: {} as any }) },
		);

		expect(result).toEqual({
			id: "rule_123",
			name: "example-rule",
			userId: "user_123",
			visibility: "public",
			description: "Example",
			tags: ["api", "output"],
			createdAt: 1700000000,
			updatedAt: 1700000100,
			publishedAt: null,
			version: "1.2.3",
			latestVersionId: "version_9",
			views: 12,
			stars: 3,
			user: {
				id: "user_123",
				username: "demo",
				email: "demo@example.com",
				displayName: "Demo",
				avatarUrl: null,
			},
			author: {
				id: "user_123",
				username: "demo",
				email: "demo@example.com",
				displayName: "Demo",
				avatarUrl: null,
			},
			created_at: 1700000000,
			updated_at: 1700000100,
		});
	});

	it("maps list input for list", async () => {
		listRulesMock.mockResolvedValue({
			rules: [{ id: "rule_1" }],
			total: 1,
		});

		const result = await call(
			rulesProcedures.list,
			{ visibility: "public", tags: ["tag"], author: "demo", limit: 10, offset: 0 },
			{ context: createMockContext({ db: {} as any, user: { id: "user_123" } }) },
		);

		expect(listRulesMock).toHaveBeenCalledWith({
			visibility: "public",
			tags: ["tag"],
			author: "demo",
			limit: 10,
			offset: 0,
			userId: "user_123",
		});
		expect(result).toEqual({ rules: [{ id: "rule_1" }], total: 1 });
	});

	it("maps search input for search", async () => {
		searchRulesMock.mockResolvedValue({ rules: [], total: 0 });

		const result = await call(
			rulesProcedures.search,
			{
				query: "example",
				tags: ["tag"],
				author: "demo",
				type: "rule",
				visibility: "public",
				sortBy: "updated",
				page: 1,
				limit: 20,
			},
			{ context: createMockContext({ db: {} as any, user: { id: "user_123" } }) },
		);

		expect(searchRulesMock).toHaveBeenCalledWith({
			query: "example",
			tags: ["tag"],
			author: "demo",
			type: "rule",
			visibility: "public",
			sortBy: "updated",
			page: 1,
			limit: 20,
			userId: "user_123",
		});
		expect(result).toEqual({ rules: [], total: 0 });
	});

	it("requires auth for like", async () => {
		await expect(
			call(
				rulesProcedures.like,
				{ ruleId: "rule_1" },
				{ context: createMockContext({ db: {} as any }) },
			),
		).rejects.toThrow(ORPCError);
	});
});
