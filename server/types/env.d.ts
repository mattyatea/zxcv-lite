import type { PrismaClient } from "@prisma/client";

// Re-export Cloudflare's generated Env type for compatibility
export type { Env } from "../../worker-configuration.d.ts";

// Use Cloudflare's generated types from worker-configuration.d.ts
export type CloudflareEnv = ExtendedEnv;

// Extend the Cloudflare Env with optional runtime additions
export interface ExtendedEnv extends Env {
	// Cloudflare Rate Limiting bindings
	AUTH_RATE_LIMITER?: RateLimit;
	REGISTER_RATE_LIMITER?: RateLimit;
	PASSWORD_RESET_RATE_LIMITER?: RateLimit;
	API_RATE_LIMITER?: RateLimit;
	AVATAR_UPLOAD_RATE_LIMITER?: RateLimit;
	REPORT_RATE_LIMITER?: RateLimit;

	// KV Cache (if needed for your application)
	KV_CACHE?: KVNamespace;

	// Prisma Client (optional, created on demand)
	prisma?: PrismaClient;

	// GitHub OAuth secrets
	GH_OAUTH_CLIENT_ID: string;
	GH_OAUTH_CLIENT_SECRET: string;
}
