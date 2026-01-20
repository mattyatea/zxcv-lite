import { ORPCError } from "@orpc/server";
import { RuleService } from "../../services";
import { createLogger } from "../../services/LoggerService";
import { parseRulePath } from "../../utils/rulesNamespace";
import { os } from "../index";
import { authRequiredMiddleware } from "../middleware/auth";
import { dbProvider } from "../middleware/db";

type RuleVersionWithCreator = {
	versionNumber: string;
	changelog?: string | null;
	createdAt: number;
	createdBy: string;
	creator?: { id: string; username: string } | null;
};

export const rulesProcedures = {
	/**
	 * パスによるルール取得
	 * Public rules can be accessed without authentication
	 */
	getByPath: os.rules.getByPath.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { path: string };

		// パスをパース
		const parsed = parseRulePath(inputData.path);

		if (!parsed) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Invalid rule path format. Expected @owner/rulename or rulename",
			});
		}

		const { owner, ruleName } = parsed;

		const result = await ruleService.getRule(ruleName, owner, user?.id);
		const { rule, version } = result;

		// Ensure we have the proper author object
		const author = rule.user || {
			id: rule.userId || "",
			username: "Unknown",
			email: "",
			displayName: null,
			avatarUrl: null,
		};

		return {
			id: rule.id,
			name: rule.name,
			userId: rule.userId || null,
			visibility: rule.visibility as "public" | "private",
			description: rule.description ?? null,
			tags: rule.tags ? (typeof rule.tags === "string" ? JSON.parse(rule.tags) : rule.tags) : [],
			createdAt: rule.createdAt as number,
			updatedAt: rule.updatedAt as number,
			publishedAt: rule.publishedAt as number | null,
			version: (version.versionNumber || rule.version || "1.0.0") as string,
			latestVersionId: rule.latestVersionId || version.id,
			views: rule.views as number,
			stars: rule.stars as number,
			user: rule.user || author,
			author,
		};
	}),

	/**
	 * ルール作成
	 */
	create: os.rules.create
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as {
				name: string;
				type?: "rule" | "ccsubagents";
				description?: string;
				content: string;
				visibility: "public" | "private";
				tags: string[];
			};

			const logger = createLogger(env);
			logger.debug("Create rule handler - user", { user });
			const result = await ruleService.createRule(user.id, inputData);
			return { id: result.rule.id };
		}),

	/**
	 * ルール更新
	 */
	update: os.rules.update
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as {
				id: string;
				name?: string;
				description?: string;
				visibility?: "public" | "private";
				tags?: string[];
				content?: string;
				changelog?: string;
				isMajorVersionUp?: boolean;
			};

			const { id, ...updateData } = inputData;
			await ruleService.updateRule(id, user.id, updateData);
			return { success: true, message: "Rule updated successfully" };
		}),

	/**
	 * ルール一覧
	 */
	list: os.rules.list.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as {
			visibility?: string;
			tags?: string[];
			author?: string;
			limit: number;
			offset: number;
		};

		// Map contract inputs to service method
		return await ruleService.listRules({
			visibility: inputData.visibility,
			tags: inputData.tags,
			author: inputData.author,
			limit: inputData.limit,
			offset: inputData.offset,
			userId: user?.id,
		});
	}),

	/**
	 * ルール検索
	 */
	search: os.rules.search.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as {
			query?: string;
			tags?: string[];
			author?: string;
			type?: "rule" | "ccsubagents";
			visibility?: string;
			sortBy?: string;
			page: number;
			limit: number;
		};

		// Map contract inputs to service method
		return await ruleService.searchRules({
			query: inputData.query,
			tags: inputData.tags,
			author: inputData.author,
			type: inputData.type,
			visibility: inputData.visibility,
			sortBy: inputData.sortBy,
			page: inputData.page,
			limit: inputData.limit,
			userId: user?.id,
		});
	}),

	/**
	 * ルールをLike
	 */
	like: os.rules.like
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as { ruleId: string };

			return await ruleService.starRule(inputData.ruleId, user.id);
		}),

	/**
	 * ルールのLikeを解除
	 */
	unlike: os.rules.unlike
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as { ruleId: string };

			return await ruleService.unstarRule(inputData.ruleId, user.id);
		}),

	/**
	 * ルールをIDで取得
	 */
	get: os.rules.get.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { id: string };

		const rule = await ruleService.getRuleById(inputData.id, user?.id);

		// Ensure we have the proper author object
		const author = rule.user || {
			id: rule.userId || "",
			username: "Unknown",
			email: "",
			displayName: null,
			avatarUrl: null,
		};

		return {
			id: rule.id,
			name: rule.name,
			userId: rule.userId || null,
			visibility: rule.visibility as "public" | "private",
			description: rule.description ?? null,
			tags: rule.tags ? (typeof rule.tags === "string" ? JSON.parse(rule.tags) : rule.tags) : [],
			createdAt: rule.createdAt as number,
			updatedAt: rule.updatedAt as number,
			publishedAt: rule.publishedAt as number | null,
			version: (rule.version || "1.0.0") as string,
			latestVersionId: rule.latestVersionId ?? null,
			views: rule.views as number,
			stars: rule.stars as number,
			user: rule.user || author,
			author,
			created_at: rule.createdAt as number,
			updated_at: rule.updatedAt as number,
		};
	}),

	/**
	 * ルールのコンテンツを取得
	 */
	getContent: os.rules.getContent.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { id: string; version?: string };

		return await ruleService.getRuleContent(inputData.id, inputData.version, user?.id);
	}),

	/**
	 * ルールのバージョン一覧を取得
	 */
	versions: os.rules.versions.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { id: string };

		const versions = (await ruleService.getRuleVersions(
			inputData.id,
			user?.id,
		)) as unknown as RuleVersionWithCreator[];

		// Creator information is already included from the repository
		return versions.map((v) => ({
			version: v.versionNumber,
			changelog: v.changelog || "",
			created_at: v.createdAt,
			createdBy: v.creator || { id: v.createdBy, username: "Unknown" },
		}));
	}),

	/**
	 * ルールの特定バージョンを取得
	 */
	getVersion: os.rules.getVersion.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { id: string; version: string };

		const versionData = await ruleService.getRuleVersion(inputData.id, inputData.version, user?.id);

		// Ensure proper format for author and createdBy
		const author = versionData.author
			? {
					id: versionData.author.id,
					username: versionData.author.username,
					email: versionData.author.email || "",
				}
			: { id: "", username: "Unknown", email: "" };

		const createdBy = versionData.createdBy
			? {
					id: versionData.createdBy.id,
					username: versionData.createdBy.username || "Unknown",
				}
			: { id: "", username: "Unknown" };

		return {
			...versionData,
			description: versionData.description ?? null,
			changelog: versionData.changelog || "",
			tags: Array.isArray(versionData.tags) ? versionData.tags : [],
			author,
			createdBy,
		};
	}),

	/**
	 * 関連ルールを取得
	 */
	related: os.rules.related.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { id: string; limit: number };

		return await ruleService.getRelatedRules(inputData.id, inputData.limit, user?.id);
	}),

	/**
	 * ルールの閲覧を記録
	 */
	view: os.rules.view.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { ruleId: string };

		return await ruleService.recordView(inputData.ruleId, user?.id);
	}),

	/**
	 * ルールを削除
	 */
	delete: os.rules.delete
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as { id: string };

			const result = await ruleService.deleteRule(inputData.id, user.id);
			return { success: true, message: result.message };
		}),

	/**
	 * 公開ルール一覧
	 */
	listPublic: os.rules.listPublic.use(dbProvider).handler(async ({ input, context }) => {
		const { db, user, env } = context;
		const ruleService = new RuleService(db, env.R2, env);
		const inputData = input as { tags?: string[]; author?: string; limit: number; offset: number };

		return await ruleService.listRules({
			visibility: "public",
			tags: inputData.tags,
			author: inputData.author,
			limit: inputData.limit,
			offset: inputData.offset,
			userId: user?.id,
		});
	}),

	/**
	 * ルールをスター
	 */
	star: os.rules.star
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as { ruleId: string };

			return await ruleService.starRule(inputData.ruleId, user.id);
		}),

	/**
	 * ルールのスターを解除
	 */
	unstar: os.rules.unstar
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as { ruleId: string };

			return await ruleService.unstarRule(inputData.ruleId, user.id);
		}),

	/**
	 * ルールのバージョン履歴を取得
	 */
	getVersionHistory: os.rules.getVersionHistory
		.use(dbProvider)
		.handler(async ({ input, context }) => {
			const { db, user, env } = context;
			const ruleService = new RuleService(db, env.R2, env);
			const inputData = input as { ruleId: string };

			const versions = (await ruleService.getRuleVersions(
				inputData.ruleId,
				user?.id,
			)) as unknown as RuleVersionWithCreator[];

			// Creator information is already included from the repository
			return versions.map((v) => ({
				version: v.versionNumber,
				changelog: v.changelog || "",
				created_at: v.createdAt,
				createdBy: v.creator || { id: v.createdBy, username: "Unknown" },
			}));
		}),

	// デバッグ用エンドポイント
	debug: os.rules.debug
		.use(dbProvider)
		.use(authRequiredMiddleware)
		.handler(async ({ context }) => {
			const { db, env } = context;

			// Only allow debug endpoint in non-production environments
			if (env.ENVIRONMENT === "production") {
				throw new ORPCError("FORBIDDEN", {
					message: "Debug endpoint is not available in production",
				});
			}

			// すべてのルールを取得
			const allRules = await db.rule.findMany({
				include: {
					user: {
						select: {
							username: true,
						},
					},
				},
			});

			// パブリックルールの数をカウント
			const publicRules = allRules.filter((rule) => rule.visibility === "public").length;

			return {
				totalRules: allRules.length,
				publicRules,
				rules: allRules.map((rule) => ({
					id: rule.id,
					name: rule.name,
					visibility: rule.visibility as "public" | "private",
					userId: rule.userId,
					username: rule.user?.username,
				})),
			};
		}),
};
