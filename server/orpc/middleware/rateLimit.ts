import { CloudflareRatelimiter } from "@orpc/experimental-ratelimit/cloudflare-ratelimit";
import { ORPCError } from "@orpc/server";
import { createLogger } from "../../services/LoggerService";
import { createPrismaClient } from "../../services/PrismaService";
import type { CloudflareEnv } from "../../types/env";
import { authErrors } from "../../utils/i18nTranslate";
import { getLocaleFromRequest } from "../../utils/i18nLocale";
import { os } from "../index";

export type RateLimitBinding =
	| "AUTH_RATE_LIMITER"
	| "REGISTER_RATE_LIMITER"
	| "PASSWORD_RESET_RATE_LIMITER"
	| "API_RATE_LIMITER"
	| "AVATAR_UPLOAD_RATE_LIMITER"
	| "REPORT_RATE_LIMITER";

export interface RateLimitConfig {
	keyPrefix: string; // Prefix for the rate limit key
	binding: RateLimitBinding;
}

/**
 * Creates a rate limit middleware that also provides database access
 * This is a combined middleware that handles both DB and rate limiting
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
	return os.middleware(async ({ context, next }) => {
		// Use existing db from context if available (for testing), otherwise create new one
		const db = context.db || createPrismaClient(context.env.DB);
		const { env } = context;
		const { keyPrefix, binding } = config;
		const request = context.cloudflare?.request;
		const locale = getLocaleFromRequest(request);

		try {
			const limiterBinding = (env as CloudflareEnv)[binding];
			if (limiterBinding) {
				const limiter = new CloudflareRatelimiter(limiterBinding);
				const clientId = getClientIdentifier(context);
				const key = `${keyPrefix}:${clientId}`;
				const result = await limiter.limit(key);
				if (!result.success) {
					throw new ORPCError("TOO_MANY_REQUESTS", {
						message: authErrors.rateLimit(locale),
						data: { code: "RATE_LIMIT_EXCEEDED" },
					});
				}
			}

			// Continue to next middleware with db and locale in context
			return next({
				context: {
					...context,
					db,
					locale,
				},
			});
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			const logger = createLogger(env);
			logger.error("Rate limit middleware error", error as Error);

			// On error, allow the request to proceed
			return next({
				context: {
					...context,
					db,
					locale,
				},
			});
		}
	});
}

/**
 * Get client identifier from context
 * Extracts IP address from Cloudflare headers or falls back to user ID
 */
function getClientIdentifier(context: {
	user?: { id: string };
	cloudflare?: { request?: Request };
}): string {
	// Check if user is authenticated
	if ("user" in context && context.user?.id) {
		return `user:${context.user.id}`;
	}

	// In Cloudflare Workers, extract IP from CF headers
	const request = context.cloudflare?.request;
	if (request?.headers) {
		// CF-Connecting-IP is provided by Cloudflare and contains the real client IP
		const cfConnectingIp = request.headers.get("CF-Connecting-IP");
		if (cfConnectingIp) {
			return `anonymous:${cfConnectingIp}`;
		}

		// Fallback to X-Forwarded-For if CF-Connecting-IP is not available
		const xForwardedFor = request.headers.get("X-Forwarded-For");
		if (xForwardedFor) {
			// X-Forwarded-For can contain multiple IPs, get the first one
			const firstIp = xForwardedFor.split(",")[0]?.trim() || "unknown";
			return `anonymous:${firstIp}`;
		}
	}

	// Final fallback
	return "anonymous:default";
}

// Pre-configured rate limiters for common use cases
export const authRateLimit = createRateLimitMiddleware({
	keyPrefix: "auth",
	binding: "AUTH_RATE_LIMITER",
});

// Stricter rate limit for registration to prevent spam
export const registerRateLimit = createRateLimitMiddleware({
	keyPrefix: "auth:register",
	binding: "REGISTER_RATE_LIMITER",
});

// Rate limit for password reset to prevent abuse
export const passwordResetRateLimit = createRateLimitMiddleware({
	keyPrefix: "auth:reset",
	binding: "PASSWORD_RESET_RATE_LIMITER",
});

export const apiRateLimit = createRateLimitMiddleware({
	keyPrefix: "api",
	binding: "API_RATE_LIMITER",
});

// Rate limit for avatar upload to prevent abuse
export const avatarUploadRateLimit = createRateLimitMiddleware({
	keyPrefix: "avatar:upload",
	binding: "AVATAR_UPLOAD_RATE_LIMITER",
});

// Rate limit for reports to prevent abuse (especially for anonymous reports)
export const reportRateLimit = createRateLimitMiddleware({
	keyPrefix: "report",
	binding: "REPORT_RATE_LIMITER",
});
