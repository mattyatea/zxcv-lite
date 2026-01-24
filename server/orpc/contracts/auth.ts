import { oc } from "@orpc/contract";
import * as z from "zod";
import { AuthUserSchema, SuccessResponseSchema, TokensSchema, UsernameSchema } from "../schemas/common";

export const authContract = {

	refresh: oc
		.route({
			method: "POST",
			path: "/auth/refresh",
			description: "Refresh access token",
		})
		.input(
			z.object({
				refreshToken: z.string(),
			}),
		)
		.output(
			TokensSchema.extend({
				user: AuthUserSchema,
			}),
		),

	logout: oc
		.route({
			method: "POST",
			path: "/auth/logout",
			description: "Logout user",
		})
		.input(
			z.object({
				refreshToken: z.string(),
			}),
		)
		.output(SuccessResponseSchema),

	oauthDeviceInitialize: oc
		.route({
			method: "POST",
			path: "/auth/oauthDeviceInitialize",
			description: "Initialize OAuth Device Flow",
		})
		.input(
			z.object({
				provider: z.enum(["github"]),
				scopes: z.array(z.string()).optional().default(["user:email"]),
			}),
		)
		.output(
			z.object({
				device_code: z.string(),
				user_code: z.string(),
				verification_uri: z.string(),
				expires_in: z.number(),
				interval: z.number(),
			}),
		),

	oauthDeviceCallback: oc
		.route({
			method: "POST",
			path: "/auth/oauthDeviceCallback",
			description: "Handle OAuth Device Flow callback",
		})
		.input(
			z.object({
				deviceCode: z.string(),
			}),
		)
		.output(
			z.union([
				TokensSchema.extend({
					user: AuthUserSchema,
				}),
				z.object({
					tempToken: z.string(),
					provider: z.string(),
					requiresUsername: z.literal(true),
				}),
				z.object({
					error: z.string(),
					error_description: z.string().optional(),
				}),
			]),
		),

	oauthCallback: oc
		.route({
			method: "POST",
			path: "/auth/oauthCallback",
			description: "Handle OAuth callback",
		})
		.input(
			z.object({
				provider: z.enum(["github"]),
				code: z.string(),
				state: z.string(),
			}),
		)
		.output(
			z.union([
				TokensSchema.extend({
					user: AuthUserSchema,
					redirectUrl: z.string(),
				}),
				z.object({
					tempToken: z.string(),
					provider: z.string(),
					requiresUsername: z.literal(true),
				}),
			]),
		),

	checkUsername: oc
		.route({
			method: "POST",
			path: "/auth/checkUsername",
			description: "Check if username is available",
		})
		.input(
			z.object({
				username: UsernameSchema,
			}),
		)
		.output(
			z.object({
				available: z.boolean(),
			}),
		),

	completeOAuthRegistration: oc
		.route({
			method: "POST",
			path: "/auth/completeOAuthRegistration",
			description: "Complete OAuth registration with username",
		})
		.input(
			z.object({
				tempToken: z.string(),
				username: UsernameSchema,
			}),
		)
		.output(
			TokensSchema.extend({
				user: AuthUserSchema,
			}),
		),

	me: oc
		.route({
			method: "GET",
			path: "/auth/me",
			description: "Get current user information",
		})
		.output(AuthUserSchema),
};
