import { ORPCError } from "@orpc/server";
import { AuthService } from "../../services/AuthService";
import { createJWT, createRefreshToken, verifyRefreshToken } from "../../services/AuthTokenService";
import { cleanupExpiredDeviceCodes, cleanupExpiredOAuthStates } from "../../services/OAuthCleanupService";
import {
	createDeviceOAuthProviders,
	createOAuthProviders,
	generateState,
} from "../../services/OAuthService";
import {
	OAUTH_CONFIG,
	generateNonce,
	performOAuthSecurityChecks,
	validateOAuthResponse,
} from "../../services/OAuthSecurityService";
import type { AuthUser } from "../../services/AuthContextService";
import type { CloudflareEnv } from "../../types/env";
import { generateId } from "../../utils/cryptoHash";
import { authErrors } from "../../utils/i18nTranslate";
import type { Locale } from "../../utils/i18nLocale";
import { getLocaleFromRequest } from "../../utils/i18nLocale";
import { os } from "../index";
import { dbProvider } from "../middleware/db";
import { authRateLimit } from "../middleware/rateLimit";

const ensureGitHubOAuthConfigured = (env: CloudflareEnv, locale: Locale) => {
	if (!env.GH_OAUTH_CLIENT_ID || !env.GH_OAUTH_CLIENT_SECRET) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: authErrors.oauthClientNotConfigured(locale),
		});
	}
};

const packAuthUser = (user: {
	id: string;
	email: string;
	username: string;
	role: string;
	emailVerified: boolean;
	displayName: string | null;
	avatarUrl: string | null;
	bio?: string | null;
	location?: string | null;
	website?: string | null;
}): AuthUser => ({
	id: user.id,
	email: user.email,
	username: user.username,
	role: user.role,
	emailVerified: user.emailVerified,
	displayName: user.displayName,
	avatarUrl: user.avatarUrl,
	bio: user.bio ?? null,
	location: user.location ?? null,
	website: user.website ?? null,
});

export const authProcedures = {
	/**
	 * ログアウト
	 */
	logout: os.auth.logout.use(dbProvider).handler(async ({ input, context }) => {
		const { refreshToken } = input as { refreshToken: string };
		const { env, locale } = context;

		try {
			// Verify refresh token
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

		// Verify refresh token
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

		const authUser = packAuthUser(user);

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
					action: "login" | "register";
				};
			const { db, env, cloudflare } = context;
			const locale = getLocaleFromRequest(cloudflare?.request) as Locale;
			if (context.logContext) {
				context.logContext.oauth = {
					provider,
					action,
					redirectUrl: redirectUrl || "/",
					configPresent: {
						clientId: Boolean(env.GH_OAUTH_CLIENT_ID),
						clientSecret: Boolean(env.GH_OAUTH_CLIENT_SECRET),
					},
				};
			}
			ensureGitHubOAuthConfigured(env, locale);

			const providers = createOAuthProviders(env, cloudflare?.request);

			const clientIp =
				cloudflare?.request?.headers?.get("CF-Connecting-IP") ||
				cloudflare?.request?.headers?.get("X-Forwarded-For") ||
				"unknown";

			await performOAuthSecurityChecks(db, clientIp, locale);

				const stateData = {
					random: generateState(),
					action,
					nonce: generateNonce(),
				};
				const state = Buffer.from(JSON.stringify(stateData)).toString("base64url");

				if (context.logContext?.oauth && typeof context.logContext.oauth === "object") {
					context.logContext.oauth = {
						...context.logContext.oauth,
						stateId: stateData.random,
					};
				}

			await cleanupExpiredOAuthStates(db);

			const expiresAt = Math.floor(Date.now() / 1000) + OAUTH_CONFIG.STATE_EXPIRATION;
			await db.oAuthState.create({
				data: {
					id: generateId(),
					state: stateData.random,
					provider,
					redirectUrl: redirectUrl || "/",
					expiresAt,
					clientIp,
				},
			});

			const url = providers.github.createAuthorizationURL(state, ["user:email"]);
			return {
				authorizationUrl: url.toString(),
			};
		}),

	/**
	 * OAuth Device Flow 初期化
	 */
		oauthDeviceInitialize: os.auth.oauthDeviceInitialize
			.use(authRateLimit)
			.handler(async ({ input, context }) => {
				const { provider, scopes } = input as {
					provider: "github";
					scopes: string[];
				};
			const { db, env, cloudflare } = context;
			const locale = getLocaleFromRequest(cloudflare?.request) as Locale;
			ensureGitHubOAuthConfigured(env, locale);
			if (context.logContext) {
				context.logContext.oauth = {
					flow: "device_initialize",
					provider,
					scopesCount: scopes.length,
					configPresent: {
						clientId: Boolean(env.GH_OAUTH_CLIENT_ID),
						clientSecret: Boolean(env.GH_OAUTH_CLIENT_SECRET),
					},
				};
			}

			// Import device OAuth providers
			const providers = createDeviceOAuthProviders(env);

			// Get client information for security tracking
			const clientIp =
				cloudflare?.request?.headers?.get("CF-Connecting-IP") ||
				cloudflare?.request?.headers?.get("X-Forwarded-For") ||
				"unknown";
			const userAgent = cloudflare?.request?.headers?.get("User-Agent") || "unknown";

			// Clean up expired device codes before creating new one
			await cleanupExpiredDeviceCodes(db);

			try {
				// Generate device code by calling GitHub's device flow endpoint directly
				const deviceAuthResponse = await fetch("https://github.com/login/device/code", {
					method: "POST",
					headers: {
						"Accept": "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
						"User-Agent": "zxcv-cli",
					},
					body: new URLSearchParams({
						client_id: env.GH_OAUTH_CLIENT_ID,
						scope: scopes.join(" "),
					}),
				});

				if (!deviceAuthResponse.ok) {
					if (context.logContext) {
						const oauthContext =
							context.logContext.oauth && typeof context.logContext.oauth === "object"
								? (context.logContext.oauth as Record<string, unknown>)
								: {};
						context.logContext.oauth = {
							...oauthContext,
							error: {
								step: "device_authorization",
								status: deviceAuthResponse.status,
							},
						};
					}
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Failed to initiate device authorization",
					});
				}

				const deviceData = (await deviceAuthResponse.json()) as {
					device_code: string;
					user_code: string;
					verification_uri: string;
					expires_in: number;
					interval: number;
				};

			// Store device code in database for tracking
			const expiresAt = Math.floor(Date.now() / 1000) + deviceData.expires_in;

				await db.oAuthDeviceCode.create({
					data: {
						id: generateId(),
						deviceCode: deviceData.device_code,
						userCode: deviceData.user_code,
						provider,
						clientId: env.GH_OAUTH_CLIENT_ID,
						clientIp,
						userAgent,
						scopes: JSON.stringify(scopes),
						expiresAt,
						interval: deviceData.interval || 5,
					},
				});

				return {
					device_code: deviceData.device_code,
					user_code: deviceData.user_code,
					verification_uri: deviceData.verification_uri,
					expires_in: deviceData.expires_in,
					interval: deviceData.interval || 5,
				};
			} catch (error) {
				if (context.logContext) {
					const oauthContext =
						context.logContext.oauth && typeof context.logContext.oauth === "object"
							? (context.logContext.oauth as Record<string, unknown>)
							: {};
					context.logContext.oauth = {
						...oauthContext,
						error: {
							step: "device_initialize",
							reason: error instanceof Error ? error.name : "unknown",
						},
					};
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to initialize device authorization",
				});
			}
		}),

	/**
	 * OAuth Device Flow コールバック
	 */
	oauthDeviceCallback: os.auth.oauthDeviceCallback.use(dbProvider).handler(async ({ input, context }) => {
			const { deviceCode } = input as { deviceCode: string };
			const { db, env, cloudflare } = context;
			const authService = new AuthService(db, env);
			const locale = getLocaleFromRequest(cloudflare?.request) as Locale;
			ensureGitHubOAuthConfigured(env, locale);
			if (context.logContext) {
				context.logContext.oauth = {
					flow: "device_callback",
					deviceCodePrefix: deviceCode?.substring(0, 10),
				};
			}

			// Get client IP for security tracking
			const clientIp =
				cloudflare?.request?.headers?.get("CF-Connecting-IP") ||
				cloudflare?.request?.headers?.get("X-Forwarded-For") ||
				"unknown";

			// Find device code in database
			const deviceRecord = await db.oAuthDeviceCode.findUnique({
				where: { deviceCode },
			});

			if (!deviceRecord) {
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						error: {
							step: "device_code_lookup",
						},
					};
				}
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid device code",
				});
			}

			if (context.logContext) {
				context.logContext.oauth = {
					...(context.logContext.oauth as Record<string, unknown>),
					provider: deviceRecord.provider,
				};
			}

			// Check if expired
			if (deviceRecord.expiresAt < Math.floor(Date.now() / 1000)) {
				// Clean up expired device code
				await db.oAuthDeviceCode.delete({ where: { id: deviceRecord.id } });
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						error: {
							step: "device_code_expired",
						},
					};
				}
				throw new ORPCError("BAD_REQUEST", {
					message: "Device code has expired",
				});
			}

			// Rate limiting check
			if (deviceRecord.attemptCount >= 50) {
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						error: {
							step: "poll_rate_limit",
							reason: "attempt_limit",
						},
					};
				}
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many polling attempts. Please restart the authentication process.",
				});
			}

			// Update attempt count and last poll time
			await db.oAuthDeviceCode.update({
				where: { id: deviceRecord.id },
				data: {
					attemptCount: deviceRecord.attemptCount + 1,
					lastPollAt: Math.floor(Date.now() / 1000),
				},
			});

			// Check if enough time has passed since last poll
			const minInterval = deviceRecord.interval || 5;
			if (deviceRecord.lastPollAt) {
				const timeSinceLastPoll = Math.floor(Date.now() / 1000) - deviceRecord.lastPollAt;
				if (timeSinceLastPoll < minInterval) {
					if (context.logContext) {
						context.logContext.oauth = {
							...(context.logContext.oauth as Record<string, unknown>),
							error: {
								step: "poll_rate_limit",
								reason: "poll_too_fast",
							},
						};
					}
					throw new ORPCError("TOO_MANY_REQUESTS", {
						message: "Please slow down polling requests",
					});
				}
			}

			try {
			// Import device OAuth providers
			const providers = createDeviceOAuthProviders(env);

				// Poll GitHub for token
				const tokenUrl = "https://github.com/login/oauth/access_token";
				const tokenResponse = await fetch(tokenUrl, {
					method: "POST",
					headers: {
						"Accept": "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
						"User-Agent": "zxcv-cli",
					},
					body: new URLSearchParams({
						client_id: env.GH_OAUTH_CLIENT_ID,
						device_code: deviceCode,
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					}),
				});

				if (!tokenResponse.ok) {
					const errorData =
						tokenResponse.status === 400 ? ((await tokenResponse.json()) as any) : null;

					if (errorData?.error) {
						// Handle OAuth device flow errors
						switch (errorData.error) {
							case "authorization_pending":
								if (context.logContext) {
									context.logContext.oauth = {
										...(context.logContext.oauth as Record<string, unknown>),
										deviceStatus: "authorization_pending",
									};
								}
								return {
									error: "authorization_pending",
									error_description: "Authorization pending - please complete authentication in your browser",
								};
							case "slow_down":
								if (context.logContext) {
									context.logContext.oauth = {
										...(context.logContext.oauth as Record<string, unknown>),
										deviceStatus: "slow_down",
									};
								}
								return {
									error: "slow_down",
									error_description: "Please slow down polling - authentication still pending",
								};
							case "access_denied":
								await db.oAuthDeviceCode.delete({ where: { id: deviceRecord.id } });
								if (context.logContext) {
									context.logContext.oauth = {
										...(context.logContext.oauth as Record<string, unknown>),
										deviceStatus: "access_denied",
									};
								}
								return {
									error: "access_denied",
									error_description: "Access denied - user declined the authorization request",
								};
							case "expired_token":
								await db.oAuthDeviceCode.delete({ where: { id: deviceRecord.id } });
								if (context.logContext) {
									context.logContext.oauth = {
										...(context.logContext.oauth as Record<string, unknown>),
										deviceStatus: "expired_token",
									};
								}
								return {
									error: "expired_token",
									error_description: "Device code has expired - please start a new authentication",
								};
							default:
								if (context.logContext) {
									context.logContext.oauth = {
										...(context.logContext.oauth as Record<string, unknown>),
										deviceStatus: errorData.error,
									};
								}
								return {
									error: errorData.error,
									error_description: errorData.error_description || "Unknown error occurred",
								};
						}
					}
					if (context.logContext) {
						context.logContext.oauth = {
							...(context.logContext.oauth as Record<string, unknown>),
							error: {
								step: "token_request",
								status: tokenResponse.status,
							},
						};
					}
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Failed to obtain access token",
					});
				}

				const tokenData = (await tokenResponse.json()) as {
					access_token: string;
					token_type: string;
					scope: string;
				};

				// Fetch user info from GitHub using the access token
				const [userResponse, emailResponse] = await Promise.all([
					fetch("https://api.github.com/user", {
						headers: {
							Authorization: `Bearer ${tokenData.access_token}`,
							"User-Agent": "zxcv-app",
						},
					}),
					fetch("https://api.github.com/user/emails", {
						headers: {
							Authorization: `Bearer ${tokenData.access_token}`,
							"User-Agent": "zxcv-app",
						},
					}),
				]);

				if (!userResponse.ok || !emailResponse.ok) {
					if (context.logContext) {
						context.logContext.oauth = {
							...(context.logContext.oauth as Record<string, unknown>),
							error: {
								step: "github_user_fetch",
								userStatus: userResponse.status,
								emailStatus: emailResponse.status,
							},
						};
					}
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "GitHub authentication failed",
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

				const userInfo = {
					id: githubUser.id.toString(),
					email: primaryEmail,
					username: githubUser.login,
				};

				// Use AuthService to handle OAuth login
				const result = await authService.handleOAuthLogin("github", userInfo, "login");

				// Clean up device code
				await db.oAuthDeviceCode.delete({ where: { id: deviceRecord.id } });

				// Check if username is required
				if (result && "requiresUsername" in result) {
					return {
						tempToken: (result as any).tempToken,
						provider: (result as any).provider,
						requiresUsername: true as const,
					};
				}

				return {
					accessToken: (result as any).accessToken,
					refreshToken: (result as any).refreshToken,
					user: (result as any).user,
				};
			} catch (error) {
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						error: {
							step: "device_callback",
							reason: error instanceof Error ? error.name : "unknown",
						},
					};
				}
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Device authentication failed",
				});
			}
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
		ensureGitHubOAuthConfigured(env, locale);
		if (context.logContext) {
			context.logContext.oauth = {
				flow: "callback",
				provider,
				configPresent: {
					clientId: Boolean(env.GH_OAUTH_CLIENT_ID),
					clientSecret: Boolean(env.GH_OAUTH_CLIENT_SECRET),
				},
			};
		}

		const providers = createOAuthProviders(env, cloudflare?.request);

		// Validate OAuth response parameters
		validateOAuthResponse({ code, state }, locale);

		// Decode state to extract action
		let stateData: { random: string; action: string };
		try {
			stateData = JSON.parse(Buffer.from(state, "base64url").toString());
		} catch (e) {
			if (context.logContext) {
				context.logContext.oauth = {
					...(context.logContext.oauth as Record<string, unknown>),
					error: {
						step: "state_decode",
					},
				};
			}
			throw new ORPCError("BAD_REQUEST", {
				message: "無効または期限切れの状態です",
			});
		}
		if (context.logContext) {
			context.logContext.oauth = {
				...(context.logContext.oauth as Record<string, unknown>),
				action: stateData.action,
				stateId: stateData.random,
			};
		}

		// Verify state
		const stateRecord = await db.oAuthState.findUnique({
			where: { state: stateData.random },
		});

		if (
			!stateRecord ||
			stateRecord.provider !== provider ||
			stateRecord.expiresAt < Math.floor(Date.now() / 1000)
		) {
			if (context.logContext) {
				context.logContext.oauth = {
					...(context.logContext.oauth as Record<string, unknown>),
					error: {
						step: "state_validation",
						provider,
					},
				};
			}
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
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						ipMismatch: true,
					};
				}
				// For now, just log the mismatch but don't block the request
				// In a high-security environment, you might want to throw an error here
			}
		}

		// Clean up state
		await db.oAuthState.delete({ where: { id: stateRecord.id } });

		try {
			let tokens: { accessToken: () => string };
			let userInfo: { id: string; email: string; username?: string };

			tokens = await providers.github.validateAuthorizationCode(code);

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

			if (!userResponse.ok || !emailResponse.ok) {
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						error: {
							step: "github_user_fetch",
							userStatus: userResponse.status,
							emailStatus: emailResponse.status,
						},
					};
				}
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
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						result: "requires_username",
					};
				}
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
			if (context.logContext) {
				context.logContext.oauth = {
					...(context.logContext.oauth as Record<string, unknown>),
					error: {
						step: "oauth_callback",
						reason: error instanceof Error ? error.name : "unknown",
					},
				};
			}
			if (error instanceof ORPCError) {
				throw error;
			}

			const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
			if (context.logContext) {
				context.logContext.oauth = {
					flow: "complete_registration",
				};
			}

			try {
				// Get temp registration
				const tempReg = await db.oAuthTempRegistration.findUnique({
					where: { token: tempToken },
				});

				if (!tempReg) {
					if (context.logContext) {
						context.logContext.oauth = {
							...(context.logContext.oauth as Record<string, unknown>),
							error: {
								step: "temp_registration_lookup",
							},
						};
					}
					throw new ORPCError("BAD_REQUEST", {
						message: authErrors.invalidToken(locale),
					});
				}

				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						provider: tempReg.provider,
					};
				}

				// Check if expired
				if (tempReg.expiresAt < Math.floor(Date.now() / 1000)) {
					// Clean up expired registration
					await db.oAuthTempRegistration.delete({
						where: { id: tempReg.id },
					});
					if (context.logContext) {
						context.logContext.oauth = {
							...(context.logContext.oauth as Record<string, unknown>),
							error: {
								step: "temp_registration_expired",
							},
						};
					}
					throw new ORPCError("BAD_REQUEST", {
						message: authErrors.tokenExpired(locale),
					});
				}

				// Check if username is available
				const existingUser = await db.user.findUnique({
					where: { username: username.toLowerCase() },
				});

				if (existingUser) {
					if (context.logContext) {
						context.logContext.oauth = {
							...(context.logContext.oauth as Record<string, unknown>),
							error: {
								step: "username_conflict",
							},
						};
					}
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

				return {
					accessToken: tokens.accessToken,
					refreshToken: tokens.refreshToken,
					user: packAuthUser(user),
				};
			} catch (error) {
				if (context.logContext) {
					context.logContext.oauth = {
						...(context.logContext.oauth as Record<string, unknown>),
						error: {
							step: "complete_registration",
							reason: error instanceof Error ? error.name : "unknown",
						},
					};
				}
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

		const authUser = packAuthUser(fullUser);

		return authUser;
	}),
};
