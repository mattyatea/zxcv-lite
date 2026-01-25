import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authProcedures } from "../../server/orpc/procedures/auth";
import { createMockContext } from "../helpers/mocks";

const createJwtMock = vi.hoisted(() => vi.fn());
const createRefreshTokenMock = vi.hoisted(() => vi.fn());
const verifyRefreshTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/services/AuthTokenService", () => ({
	createJWT: createJwtMock,
	createRefreshToken: createRefreshTokenMock,
	verifyRefreshToken: verifyRefreshTokenMock,
}));

describe("auth API output", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns refresh payload", async () => {
		const mockPrisma = (globalThis as any).__mockPrismaClient;
		const mockUser = {
			id: "user_123",
			email: "test@example.com",
			username: "demo",
			role: "user",
			emailVerified: true,
			displayName: "Demo User",
			avatarUrl: null,
			bio: null,
			location: null,
			website: null,
			createdAt: 1700000000,
			updatedAt: 1700000100,
		};

		verifyRefreshTokenMock.mockResolvedValue("user_123");
		createJwtMock.mockResolvedValue("access_123");
		createRefreshTokenMock.mockResolvedValue("refresh_456");
		mockPrisma.user.findUnique.mockResolvedValue(mockUser);

		const result = await call(
			authProcedures.refresh,
			{ refreshToken: "refresh_123" },
			{ context: createMockContext({ db: mockPrisma }) },
		);

		expect(result).toEqual({
			accessToken: "access_123",
			refreshToken: "refresh_456",
			user: {
				id: "user_123",
				email: "test@example.com",
				username: "demo",
				role: "user",
				emailVerified: true,
				displayName: "Demo User",
				avatarUrl: null,
				bio: null,
				location: null,
				website: null,
			},
		});
	});

	it("returns UNAUTHORIZED for invalid refresh token", async () => {
		verifyRefreshTokenMock.mockResolvedValue(null);

		await expect(
			call(
				authProcedures.refresh,
				{ refreshToken: "invalid" },
				{ context: createMockContext() },
			),
		).rejects.toThrow(ORPCError);
	});
});
