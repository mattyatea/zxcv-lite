// Use the global Env type from worker-configuration.d.ts
import type { ExtendedEnv } from "./env";

export type CloudflareBindings = ExtendedEnv;

export interface H3EventContext {
	cloudflare: {
		env: CloudflareBindings;
		context: ExecutionContext;
		request: Request;
	};
}
