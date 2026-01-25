import { RPCHandler } from "@orpc/server/fetch";
import type { H3EventContext as BaseH3EventContext, H3Event } from "h3";
import { defineEventHandler, setResponseStatus } from "h3";
import { router } from "../../orpc/router";
import type { H3EventContext } from "../../types/bindings";
import { getLocaleFromRequest } from "../../utils/i18nLocale";
import {
	createEventLogger,
	createRequestFromEvent,
	describeErrorForLog,
	ensureCloudflareContext,
	getAuthUser,
	handleError,
	sendResponse,
} from "../../services/OrpcHandlerService";

const handler = new RPCHandler(router);

export default defineEventHandler(async (event: H3Event) => {
	// In test environment, ensure context is properly set
	const context = event.context as BaseH3EventContext & H3EventContext;
	ensureCloudflareContext(event);
	const baseLogger = createEventLogger(event);
	const startTime = Date.now();
	let logger = baseLogger;
	let status = 200;
	let matched = true;
	let outcome: "success" | "error" = "success";
	let errorInfo: Record<string, unknown> | undefined;
	const sharedLogContext: Record<string, unknown> = {};

	try {
		const request = await createRequestFromEvent(event);

		const user = await getAuthUser(event);
		if (user) {
			logger = baseLogger.child({ userId: user.id, username: user.username });
		}
		const locale = getLocaleFromRequest(request);

		let response: Awaited<ReturnType<typeof handler.handle>>;
		try {
			response = await handler.handle(request, {
				prefix: "/rpc",
				context: {
					user,
					env: context.cloudflare.env,
					cloudflare: context.cloudflare,
					locale,
					logContext: sharedLogContext,
				},
			});
		} catch (handlerError) {
			throw handlerError;
		}

		if (!response.matched) {
			status = 404;
			matched = false;
			outcome = "error";
			errorInfo = {
				type: "route_not_found",
			};
			setResponseStatus(event, 404, "Not Found");
			return { error: "Not found" };
		}

		status = response.response.status;
		if (status >= 400) {
			outcome = "error";
		}

		return await sendResponse(event, response.response);
	} catch (error) {
		const details = describeErrorForLog(error);
		status = details.status;
		outcome = "error";
		errorInfo = details.error;
		return await handleError(event, error);
	} finally {
		const logContext: Record<string, unknown> = {
			path: event.path,
			status,
			outcome,
			matched,
			durationMs: Date.now() - startTime,
			environment: context.cloudflare.env?.ENVIRONMENT,
			...sharedLogContext,
		};

		if (errorInfo) {
			logContext.error = errorInfo;
		}

		logger.info("RPC request", logContext);
	}
});
