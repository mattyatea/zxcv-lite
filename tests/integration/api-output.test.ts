import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "../../server/orpc/procedures/health";
import { rulesProcedures } from "../../server/orpc/procedures/rules";
import { createMockContext } from "../helpers/mocks";

const getRuleMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/services", () => ({
	RuleService: class {
		constructor(_db: unknown, _r2: unknown, _env: unknown) {}
		getRule = getRuleMock;
	},
}));

describe("API output", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns health check payload", async () => {
		const result = await call(check, undefined, {
			context: createMockContext(),
		});

		expect(result.status).toBe("healthy");
		expect(result.timestamp).toBeTypeOf("number");
		expect(result.timestamp).toBeLessThanOrEqual(Date.now());
	});

	it("returns rule payload for getByPath", async () => {
		getRuleMock.mockResolvedValue({
			rule: {
				id: "rule_123",
				name: "my-rule",
				userId: "user_123",
				visibility: "public",
				description: "Test rule",
				tags: JSON.stringify(["api", "test"]),
				createdAt: 1700000000,
				updatedAt: 1700000100,
				publishedAt: 1700000200,
				latestVersionId: "version_2",
				views: 10,
				stars: 2,
				user: {
					id: "user_123",
					username: "demo",
					email: "demo@example.com",
					displayName: "Demo User",
					avatarUrl: null,
				},
			},
			version: {
				id: "version_2",
				versionNumber: "2.0.0",
				createdAt: 1700000100,
				createdBy: "user_123",
			},
		});

		const result = await call(
			rulesProcedures.getByPath,
			{ path: "@demo/my-rule" },
			{ context: createMockContext({ db: {} as any }) },
		);

		expect(result).toEqual({
			id: "rule_123",
			name: "my-rule",
			userId: "user_123",
			visibility: "public",
			description: "Test rule",
			tags: ["api", "test"],
            type: "rule",
			createdAt: 1700000000,
			updatedAt: 1700000100,
			publishedAt: 1700000200,
			version: "2.0.0",
			latestVersionId: "version_2",
			views: 10,
			stars: 2,
			user: {
				id: "user_123",
				username: "demo",
				email: "demo@example.com",
				displayName: "Demo User",
				avatarUrl: null,
			},
			author: {
				id: "user_123",
				username: "demo",
				email: "demo@example.com",
				displayName: "Demo User",
				avatarUrl: null,
			},
		});
	});

	it("returns BAD_REQUEST on invalid rule path", async () => {
		await expect(
			call(
				rulesProcedures.getByPath,
				{ path: "owner/too/many/parts" },
				{ context: createMockContext({ db: {} as any }) },
			),
		).rejects.toThrow(ORPCError);
	});
});
