import { ORPCError } from "@orpc/server";
import { AuthService } from "../../services/AuthService";
import { UserPackingService } from "../../services/packing/UserPackingService";
import type { AuthUser } from "../../services/AuthContextService";
import { createLogger } from "../../services/LoggerService";
import { generateId } from "../../utils/cryptoHash";
import { authErrors } from "../../utils/i18nTranslate";
import type { Locale } from "../../utils/i18nLocale";
import { getLocaleFromRequest } from "../../utils/i18nLocale";
import { os } from "../index";
import { dbProvider } from "../middleware/db";
import { authRateLimit } from "../middleware/rateLimit";

export const authProcedures = {
	/**
	 * ログアウト
	 */
	logout: os.auth.logout.use(dbProvider).handler(async ({ input, context }) => {
		const { refreshToken } = input as { refreshToken: string };
		const { env, locale } = context;

		try {
			// Verify refresh token
			const { verifyRefreshToken } = await import("../../services/AuthTokenService");
			const userId = await verifyRefreshToken(refreshToken, env);
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", { message: "Invalid token" });
			}

			// In a JWT-based system, logout is typically handled client-side
			// by removing the token. For simplicity, we'll just return success
			return {
				success: true,
				message: "Logged out successfully",
			};
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Logout failed",
			});
		}
	}),

	/**
	 * リフレッシュトークン
	 */
	refresh: os.auth.refresh.use(dbProvider).handler(async ({ input, context }) => {
		const { refreshToken } = input as { refreshToken: string };
		const { db, env, locale } = context;
		const userPackingService = new UserPackingService();

		// Verify refresh token
		const { verifyRefreshToken, createRefreshToken, createJWT } = await import(
			"../../services/AuthTokenService",
		);
		const userId = await verifyRefreshToken(refreshToken, env);

		if (!userId) {
			throw new ORPCError("UNAUTHORIZED", { message: "Invalid token" });
		}

		const user = await db.user.findUnique({
			where: { id: userId },
		});

		if (!user) {
			throw new ORPCError("UNAUTHORIZED", { message: "User not found" });
		}

		const authUser = userPackingService.packAuthUser(user);

		const accessToken = await createJWT(
			{
				sub: authUser.id,
				email: authUser.email,
				username: authUser.username,
				role: authUser.role,
				emailVerified: authUser.emailVerified,
				displayName: authUser.displayName,
				avatarUrl: authUser.avatarUrl,
			},
			env,
		);
		const newRefreshToken = await createRefreshToken(authUser.id, env);

		return { accessToken, refreshToken: newRefreshToken, user: authUser };
	}),

	/**
	 * OAuth初期化
	 */
	oauthInitialize: os.auth.oauthInitialize
		.use(authRateLimit)
		.handler(async ({ input, context }) => {
			const { provider, redirectUrl, action } = input as {
				provider: "github";
				redirectUrl?: string;
				action?: "login" | "register";
			};
			const { db, env, cloudflare } = context;
			const locale = getLocaleFromRequest(cloudflare?.request) as Locale;

			const { createOAuthProviders, generateState, generateCodeVerifier } = await import(
				"../../services/OAuthService",
			);
			const providers = createOAuthProviders(env, cloudflare?.request);

			// Import security utilities
			const { validateRedirectUrl, performOAuthSecurityChecks, generateNonce, OAUTH_CONFIG } =
				await import("../../services/OAuthSecurityService");

			// Get client IP for security tracking
			const clientIp =
				cloudflare?.request?.headers?.get("CF-Connecting-IP") ||
				cloudflare?.request?.headers?.get("X-Forwarded-For") ||
				"unknown";

			// Perform security checks
			await performOAuthSecurityChecks(db, clientIp, locale);

			// Generate state for CSRF protection with action encoded
			const stateData = {
				random: generateState(),
				action,
				nonce: generateNonce(), // Additional entropy
			};
			const state = Buffer.from(JSON.stringify(stateData)).toString("base64url");

			// Clean up expired states before creating new one
			const { cleanupExpiredOAuthStates } = await import("../../services/OAuthCleanupService");
			await cleanupExpiredOAuthStates(db);

			// Store state in database
			const { generateId } = await import("../../utils/cryptoHash");
			const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes

			await db.oAuthState.create({
				data: {
					id: generateId(),
					state: stateData.random, // Store the random part, not the encoded state
					provider,
					redirectUrl: redirectUrl || "/",
					expiresAt,
					clientIp, // Store the client IP for verification
				},
			});

			// Generate authorization URL
			const url = providers.github.createAuthorizationURL(state, ["user:email"]);
			const authorizationUrl = url.toString();

			return {
				authorizationUrl,
			};
		}),

	/**
	 * OAuthコールバック
	 */
	oauthCallback: os.auth.oauthCallback.use(dbProvider).handler(async ({ input, context }) => {
		const { provider, code, state } = input as {
			provider: "github";
			code: string;
			state: string;
		};
		const { db, env, cloudflare } = context;
		const authService = new AuthService(db, env);
		const locale = getLocaleFromRequest(cloudflare?.request) as Locale;

		const logger = createLogger(env);
		logger.debug("OAuth callback started", {
			provider,
			code: `${code?.substring(0, 10)}...`,
			state,
		});

		const { createOAuthProviders } = await import("../../services/OAuthService");
		const providers = createOAuthProviders(env, cloudflare?.request);

		// Import security utilities
		const { validateOAuthResponse } = await import("../../services/OAuthSecurityService");

		// Validate OAuth response parameters
		validateOAuthResponse({ code, state }, locale);

		// Decode state to extract action
		let stateData: { random: string; action: string };
		try {
			stateData = JSON.parse(Buffer.from(state, "base64url").toString());
		} catch (e) {
			logger.error("Failed to decode state", e as Error);
			throw new ORPCError("BAD_REQUEST", {
				message: "無効または期限切れの状態です",
			});
		}

		// Verify state
		const stateRecord = await db.oAuthState.findUnique({
			where: { state: stateData.random },
		});

		logger.debug("State record found", { stateRecord });
		logger.debug("Action from state", { action: stateData.action });

		if (
			!stateRecord ||
			stateRecord.provider !== provider ||
			stateRecord.expiresAt < Math.floor(Date.now() / 1000)
		) {
			logger.error("State validation failed", undefined, {
				stateRecord,
				provider,
				currentTime: Math.floor(Date.now() / 1000),
			});
			throw new ORPCError("BAD_REQUEST", {
				message: "無効または期限切れの状態です",
			});
		}

		// Verify client IP matches (if stored)
		if (stateRecord.clientIp && stateRecord.clientIp !== "unknown") {
			const currentClientIp =
				cloudflare?.request?.headers?.get("CF-Connecting-IP") ||
				cloudflare?.request?.headers?.get("X-Forwarded-For") ||
				"unknown";

			if (stateRecord.clientIp !== currentClientIp) {
				logger.warn("OAuth callback IP mismatch", {
					stored: stateRecord.clientIp,
					current: currentClientIp,
				});
				// For now, just log the mismatch but don't block the request
				// In a high-security environment, you might want to throw an error here
			}
		}

		// Clean up state
		await db.oAuthState.delete({ where: { id: stateRecord.id } });

		try {
			let tokens: { accessToken: () => string };
			let userInfo: { id: string; email: string; username?: string };

			logger.debug("Validating GitHub authorization code");
			tokens = await providers.github.validateAuthorizationCode(code);
			logger.debug("GitHub token obtained");

			// Fetch user info from GitHub
			const [userResponse, emailResponse] = await Promise.all([
				fetch("https://api.github.com/user", {
					headers: {
						Authorization: `Bearer ${tokens.accessToken()}`,
						"User-Agent": "zxcv-app",
					},
				}),
				fetch("https://api.github.com/user/emails", {
					headers: {
						Authorization: `Bearer ${tokens.accessToken()}`,
						"User-Agent": "zxcv-app",
					},
				}),
			]);

			logger.debug("GitHub API responses", {
				userStatus: userResponse.status,
				emailStatus: emailResponse.status,
			});

			if (!userResponse.ok || !emailResponse.ok) {
				logger.error("GitHub API error", undefined, {
					userStatus: userResponse.status,
					userText: await userResponse.text(),
					emailStatus: emailResponse.status,
					emailText: await emailResponse.text(),
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "GitHub認証に失敗しました",
				});
			}

			const githubUser = (await userResponse.json()) as {
				id: number;
				login: string;
				name?: string;
			};
			const emails = (await emailResponse.json()) as Array<{
				email: string;
				primary: boolean;
				verified: boolean;
			}>;
			const primaryEmail = emails.find((e) => e.primary)?.email || emails[0]?.email;

			if (!primaryEmail) {
				throw new ORPCError("BAD_REQUEST", {
					message: authErrors.oauthNoEmail(locale, "GitHub"),
				});
			}

			userInfo = {
				id: githubUser.id.toString(),
				email: primaryEmail,
				username: githubUser.login,
			};

			// Use AuthService to handle OAuth login
			const result = await authService.handleOAuthLogin(provider, userInfo, stateData.action);

			// Check if username is required
			if ("requiresUsername" in result && result.requiresUsername) {
				return {
					tempToken: result.tempToken,
					provider: result.provider,
					requiresUsername: true as const,
				};
			}

			return {
				accessToken: (
					result as {
						accessToken: string;
						refreshToken: string;
						user: AuthUser;
					}
				).accessToken,
				refreshToken: (
					result as {
						accessToken: string;
						refreshToken: string;
						user: AuthUser;
					}
				).refreshToken,
				user: (
					result as {
						accessToken: string;
						refreshToken: string;
						user: AuthUser;
					}
				).user,
				redirectUrl: stateRecord.redirectUrl || "/",
			};
		} catch (error) {
			logger.error("OAuth callback error", error as Error);
			if (error instanceof ORPCError) {
				throw error;
			}

			// Provide more detailed error information for debugging
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			logger.error("Detailed error", undefined, {
				message: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
				error: error,
			});

			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: `OAuth認証に失敗しました: ${errorMessage}`,
			});
		}
	}),

	checkUsername: os.auth.checkUsername.use(dbProvider).handler(async ({ input, context }) => {
		const { username } = input as { username: string };
		const db = context.db;

		// Check if username is already taken
		const existingUser = await db.user.findUnique({
			where: { username: username.toLowerCase() },
		});

		return {
			available: !existingUser,
		};
	}),

	completeOAuthRegistration: os.auth.completeOAuthRegistration
		.use(dbProvider)
		.handler(async ({ input, context }) => {
			const { tempToken, username } = input as { tempToken: string; username: string };
			const { db, env, cloudflare } = context;
			const locale = getLocaleFromRequest(cloudflare?.request) as Locale;
			const logger = createLogger(env);
			const userPackingService = new UserPackingService();

			try {
				// Get temp registration
				const tempReg = await db.oAuthTempRegistration.findUnique({
					where: { token: tempToken },
				});

				if (!tempReg) {
					throw new ORPCError("BAD_REQUEST", {
						message: authErrors.invalidToken(locale),
					});
				}

				// Check if expired
				if (tempReg.expiresAt < Math.floor(Date.now() / 1000)) {
					// Clean up expired registration
					await db.oAuthTempRegistration.delete({
						where: { id: tempReg.id },
					});
					throw new ORPCError("BAD_REQUEST", {
						message: authErrors.tokenExpired(locale),
					});
				}

				// Check if username is available
				const existingUser = await db.user.findUnique({
					where: { username: username.toLowerCase() },
				});

				if (existingUser) {
					throw new ORPCError("CONFLICT", {
						message: "このユーザー名は既に使用されています",
					});
				}

				// Create user and OAuth account
				const userId = generateId();
				const oauthAccountId = generateId();
				const now = Math.floor(Date.now() / 1000);

				const user = await db.user.create({
					data: {
						id: userId,
						email: tempReg.email.toLowerCase(),
						username: username.toLowerCase(),
						passwordHash: null, // OAuth users don't have passwords
						emailVerified: true, // OAuth providers verify email
						createdAt: now,
						updatedAt: now,
						oauthAccounts: {
							create: {
								id: oauthAccountId,
								provider: tempReg.provider,
								providerId: tempReg.providerId,
								email: tempReg.email,
								username: tempReg.providerUsername,
								createdAt: now,
								updatedAt: now,
							},
						},
					},
				});

				// Clean up temp registration
				await db.oAuthTempRegistration.delete({
					where: { id: tempReg.id },
				});

				// Generate tokens
				const authService = new AuthService(db, context.env);
				const tokens = await authService.generateTokens(user);

				logger.info("OAuth registration completed", { userId: user.id });

				return {
					accessToken: tokens.accessToken,
					refreshToken: tokens.refreshToken,
					user: userPackingService.packAuthUser(user),
				};
			} catch (error) {
				logger.error("Complete OAuth registration error", error as Error);
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "登録の完了に失敗しました",
				});
			}
		}),

	me: os.auth.me.use(dbProvider).handler(async ({ context }) => {
		const { db, user } = context;

		if (!user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		// Get full user data from database
		const fullUser = await db.user.findUnique({
			where: { id: user.id },
		});

		if (!fullUser) {
			throw new ORPCError("NOT_FOUND", {
				message: "User not found",
			});
		}

		const userPackingService = new UserPackingService();
		const authUser = userPackingService.packAuthUser(fullUser);

		return authUser;
	}),
};
