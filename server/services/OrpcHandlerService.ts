import type { ORPCErrorCode } from "@orpc/client";
import { ORPCError } from "@orpc/server";
import type { H3EventContext as BaseH3EventContext, H3Event } from "h3";
import { getHeader, readRawBody, setHeader, setResponseStatus } from "h3";
import type { H3EventContext } from "../types/bindings";
import type { Env } from "../types/env";
import type { AuthUser } from "./AuthContextService";
import { verifyJWT } from "./AuthTokenService";
import { createLogger } from "./LoggerService";

// Extend globalThis for test environment
declare global {
	var DB: D1Database | undefined;
	var R2: R2Bucket | undefined;
	var EMAIL_SENDER: SendEmail | undefined;
	var KV_CACHE: KVNamespace | undefined;
	var JWT_SECRET: string | undefined;
}

export async function getAuthUser(event: H3Event): Promise<AuthUser | undefined> {
	const authorization = getHeader(event, "authorization");
	if (!authorization?.startsWith("Bearer ")) {
		return undefined;
	}

	const token = authorization.substring(7);
	const context = event.context as BaseH3EventContext & H3EventContext;
	const env = context.cloudflare?.env;

	if (!env) {
		return undefined;
	}

	// Standard JWT token
	try {
		const payload = await verifyJWT(token, env);
		if (!payload) {
			return undefined;
		}
		return {
			id: payload.sub,
			email: payload.email,
			username: payload.username,
			role: payload.role ?? "user",
			emailVerified: payload.emailVerified || false,
			displayName: payload.displayName || null,
			avatarUrl: payload.avatarUrl || null,
		};
	} catch {
		return undefined;
	}
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

export function createEventLogger(event: H3Event) {
	const context = event.context as BaseH3EventContext & Partial<H3EventContext>;
	const logger = createLogger(context.cloudflare?.env);
	const headers = event.node.req.headers;
	const requestIdHeader = normalizeHeaderValue(headers["x-request-id"]);
	const userAgent = normalizeHeaderValue(headers["user-agent"]);
	const cfConnectingIp = normalizeHeaderValue(headers["cf-connecting-ip"]);
	const xForwardedFor = normalizeHeaderValue(headers["x-forwarded-for"]);
	const requestId =
		requestIdHeader ??
		(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined);

	return logger.child({
		requestId,
		method: event.node.req.method,
		url: event.node.req.url,
		userAgent,
		ip: cfConnectingIp ?? xForwardedFor,
	});
}

const ORPC_STATUS_MAP: Record<string, number> = {
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	CONFLICT: 409,
	INTERNAL_SERVER_ERROR: 500,
};

export function describeErrorForLog(error: unknown): {
	status: number;
	error?: Record<string, unknown>;
} {
	if (
		error instanceof ORPCError ||
		(error && typeof error === "object" && "code" in error && "__isORPCError" in error)
	) {
		const orpcError = error as ORPCError<ORPCErrorCode, unknown>;
		return {
			status: ORPC_STATUS_MAP[orpcError.code] || 500,
			error: {
				type: "orpc",
				code: orpcError.code,
				message: orpcError.message,
			},
		};
	}

	if (
		error &&
		typeof error === "object" &&
		"response" in error &&
		(error as { response?: unknown }).response instanceof Response
	) {
		const errorResponse = (error as { response: Response }).response;
		return {
			status: errorResponse.status,
			error: {
				type: "response",
				status: errorResponse.status,
			},
		};
	}

	if (error instanceof Error) {
		return {
			status: 500,
			error: {
				type: error.name,
				message: error.message,
			},
		};
	}

	return {
		status: 500,
		error: {
			type: "unknown",
		},
	};
}

export async function extractResponseErrorInfo(
	response: Response,
): Promise<Record<string, unknown> | undefined> {
	if (response.status < 400) {
		return undefined;
	}

	const contentType = response.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return {
			type: "response",
			status: response.status,
		};
	}

	try {
		const payload = (await response.clone().json()) as Record<string, unknown>;
		const code = typeof payload.code === "string" ? payload.code : undefined;
		const message = typeof payload.message === "string" ? payload.message : undefined;
		return {
			type: "response",
			status: response.status,
			...(code ? { code } : {}),
			...(message ? { message } : {}),
		};
	} catch {
		return {
			type: "response",
			status: response.status,
		};
	}
}

export function ensureCloudflareContext(event: H3Event): void {
	const context = event.context as BaseH3EventContext & Partial<H3EventContext>;

	// Ensure cloudflare context exists
	if (!context.cloudflare) {
		// In test environment, set up minimal cloudflare context
		const testEnv = {
			DB: globalThis.DB || undefined,
			R2: globalThis.R2 || undefined,
			KV_CACHE: globalThis.KV_CACHE || undefined,
			JWT_SECRET: globalThis.JWT_SECRET || "test-secret",
			JWT_ALGORITHM: "HS256",
			JWT_EXPIRES_IN: "1h",
			RATE_LIMIT_ANONYMOUS: "100",
			RATE_LIMIT_AUTHENTICATED: "1000",
			RATE_LIMIT_API_KEY: "5000",
		} as Env;

		context.cloudflare = {
			env: testEnv,
			context: {
				waitUntil: () => {
					// No-op for test environment
				},
				passThroughOnException: () => {
					// No-op for test environment
				},
				props: {},
			} as ExecutionContext,
			// biome-ignore lint/suspicious/noExplicitAny: Type mismatch between Node's Request and Cloudflare's Request
			request: new Request("http://localhost") as any,
		};
	}
}

export async function createRequestFromEvent(event: H3Event): Promise<Request> {
	// Convert H3 event to a standard Request object for the fetch adapter
	const url = new URL(
		event.node.req.url || "",
		`http://${event.node.req.headers.host || "localhost"}`,
	);
	const headers = new Headers();

	// Copy headers from the H3 event
	for (const [key, value] of Object.entries(event.node.req.headers)) {
		if (value) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
		}
	}

	// Create a Request object
	const rawBody =
		event.node.req.method !== "GET" && event.node.req.method !== "HEAD"
			? await readRawBody(event)
			: undefined;

	return new Request(url, {
		method: event.node.req.method,
		headers,
		body: rawBody,
	});
}

// biome-ignore lint/suspicious/noExplicitAny: Return type varies based on response content type
export async function sendResponse(event: H3Event, response: Response): Promise<any> {
	// Send the fetch Response back through H3
	setResponseStatus(event, response.status);

	// Set response headers
	response.headers.forEach((value, key) => {
		setHeader(event, key, value);
	});

	// Return the response body
	const contentType = response.headers.get("content-type");
	if (contentType?.includes("application/json")) {
		return await response.json();
	}
	return await response.text();
}

// biome-ignore lint/suspicious/noExplicitAny: Error response format varies and needs to be flexible
export async function handleError(event: H3Event, error: unknown): Promise<any> {
	// Check if the error has already been processed by Handler
	if (
		error &&
		typeof error === "object" &&
		"response" in error &&
		(error as { response?: unknown }).response instanceof Response
	) {
		const errorResponse = (error as { response: Response }).response;
		// レスポンスログは削除
		return sendResponse(event, errorResponse);
	}

	// Handle ORPCError specifically to preserve status codes
	if (
		error instanceof ORPCError ||
		(error && typeof error === "object" && "code" in error && "__isORPCError" in error)
	) {
		const orpcError = error as ORPCError<ORPCErrorCode, unknown>;
		const status = ORPC_STATUS_MAP[orpcError.code] || 500;
		setResponseStatus(event, status);

		return {
			defined: false,
			code: orpcError.code,
			status,
			message: orpcError.message || "An error occurred",
			data: orpcError.data,
		};
	}

	// For other errors, return 500
	setResponseStatus(event, 500);
	return {
		defined: false,
		code: "INTERNAL_SERVER_ERROR",
		status: 500,
		message: "Internal server error",
	};
}
