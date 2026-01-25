import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProfile, me } from "../../server/orpc/procedures/users";
import { createMockContext } from "../helpers/mocks";

describe("users API output", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns profile payload with stats and recent rules", async () => {
		const mockPrisma = (globalThis as any).__mockPrismaClient;
		const viewer = {
			id: "viewer_1",
			email: "viewer@example.com",
			username: "viewer",
			emailVerified: true,
			role: "user",
		};
		const targetUser = {
			id: "user_123",
			email: "target@example.com",
			username: "target",
			emailVerified: true,
			role: "user",
			displayName: "Target User",
			bio: "Hello",
			location: "Tokyo",
			website: null,
			avatarUrl: null,
			createdAt: 1700000000,
			updatedAt: 1700000100,
		};
		const recentRules = [
			{
				id: "rule_1",
				name: "rule-one",
				description: null,
				visibility: "public",
				createdAt: 1700000000,
				updatedAt: 1700000200,
			},
		];

		mockPrisma.user.findUnique.mockResolvedValueOnce(targetUser);
		mockPrisma.rule.findMany.mockResolvedValueOnce(recentRules);
		mockPrisma.rule.count.mockResolvedValueOnce(3);

		const result = await call(
			getProfile,
			{ username: "target" },
			{ context: createMockContext({ db: mockPrisma, user: viewer }) },
		);

		expect(result).toEqual({
			user: {
				id: "user_123",
				username: "target",
				emailVerified: true,
				displayName: "Target User",
				bio: "Hello",
				location: "Tokyo",
				website: null,
				avatarUrl: null,
				createdAt: 1700000000,
				updatedAt: 1700000100,
			},
			stats: {
				rulesCount: 3,
			},
			recentRules: [
				{
					id: "rule_1",
					name: "rule-one",
					description: "",
					visibility: "public",
					createdAt: 1700000000,
					updatedAt: 1700000200,
				},
			],
		});
	});

	it("returns current user payload with stats", async () => {
		const mockPrisma = (globalThis as any).__mockPrismaClient;
		const viewer = {
			id: "viewer_1",
			email: "viewer@example.com",
			username: "viewer",
			emailVerified: true,
			role: "user",
		};
		const userProfile = {
			id: "viewer_1",
			email: "viewer@example.com",
			username: "viewer",
			emailVerified: true,
			role: "user",
			displayName: "Viewer",
			bio: "Hello",
			location: "Tokyo",
			website: "https://example.com",
			avatarUrl: null,
			createdAt: 1700000000,
			updatedAt: 1700000100,
		};

		mockPrisma.user.findUnique.mockResolvedValueOnce(userProfile);
		mockPrisma.rule.count.mockResolvedValueOnce(2);
		mockPrisma.ruleStar.count.mockResolvedValueOnce(5);

		const result = await call(me, undefined, {
			context: createMockContext({ db: mockPrisma, user: viewer }),
		});

		expect(result).toEqual({
			id: "viewer_1",
			email: "viewer@example.com",
			username: "viewer",
			role: "user",
			emailVerified: true,
			displayName: "Viewer",
			bio: "Hello",
			location: "Tokyo",
			website: "https://example.com",
			avatarUrl: null,
			createdAt: 1700000000,
			updatedAt: 1700000100,
			stats: {
				rulesCount: 2,
				totalStars: 5,
			},
		});
	});
});
