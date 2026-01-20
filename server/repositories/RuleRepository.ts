import { BaseRepository } from "./BaseRepository";

type Rule = Record<string, unknown> & {
	id: string;
	name: string;
	userId?: string;
	visibility?: string;
	description?: string | null;
	tags?: string | null;
	latestVersionId?: string | null;
};

type RuleVersion = Record<string, unknown> & {
	id: string;
	versionNumber: string;
};

interface RuleCreateInput {
	id: string;
	name: string;
	userId: string;
	type: "rule";
	visibility: string;
	description: string | null;
	tags: string | null;
	publishedAt: number | null;
	version: string;
	latestVersionId: string | null;
	views: number;
	stars: number;
}

interface RuleVersionCreateInput {
	id: string;
	ruleId: string;
	versionNumber: string;
	changelog: string | null;
	contentHash: string;
	r2ObjectKey: string;
	createdBy: string;
}

type RuleUncheckedCreateInput = Record<string, unknown>;
type RuleWhereInput = Record<string, unknown>;
type RuleUpdateInput = Record<string, unknown>;
type RuleVersionUncheckedCreateInput = Record<string, unknown>;

export type RuleWithRelations = Rule & {
	user?: {
		id: string;
		username: string;
		email: string;
		displayName: string | null;
		avatarUrl: string | null;
	} | null;
	versions?: RuleVersion[] | null;
	creator?: { id: string; username: string } | null;
};

type RuleVersionWithCreator = RuleVersion & {
	creator?: { id: string; username: string } | null;
};

export class RuleRepository extends BaseRepository {
	/**
	 * ルールを作成
	 */
	async create(data: RuleUncheckedCreateInput): Promise<Rule> {
		try {
			return await this.db.rule.create({
				data: data as unknown as never,
			}) as unknown as Rule;
		} catch (error) {
			this.handleError(error, "ルールの作成に失敗しました");
		}
	}

	/**
	 * ルールをIDで取得
	 */
	async findById(id: string, includeRelations = false): Promise<RuleWithRelations | null> {
		try {
			return await this.db.rule.findUnique({
				where: { id },
				include: includeRelations
					? {
							user: {
								select: {
									id: true,
									username: true,
									email: true,
									displayName: true,
									avatarUrl: true,
								},
							},
							/* versions: {
								orderBy: { versionNumber: "desc" },
								take: 1,
							}, */
						}
					: undefined,
			});
		} catch (error) {
			this.handleError(error, "ルールの取得に失敗しました");
		}
	}

	/**
	 * ルールを名前で検索
	 */
	async findByName(name: string): Promise<RuleWithRelations | null> {
		try {
			// @ts-ignore - Prisma type incompatibility with nullable relations
			return await this.db.rule.findFirst({
				where: {
					name,
				},
				include: {
					user: {
						select: {
							id: true,
							username: true,
							email: true,
							displayName: true,
							avatarUrl: true,
						},
					},
				},
			});
		} catch (error) {
			this.handleError(error, "ルールの検索に失敗しました");
		}
	}

	/**
	 * ルールを名前とユーザーIDで検索
	 */
	async findByNameAndUserId(name: string, userId: string): Promise<RuleWithRelations | null> {
		try {
			// @ts-ignore - Prisma type incompatibility with nullable relations
			return await this.db.rule.findFirst({
				where: {
					name,
					userId,
				},
				include: {
					user: {
						select: {
							id: true,
							username: true,
							email: true,
							displayName: true,
							avatarUrl: true,
						},
					},
				},
			});
		} catch (error) {
			this.handleError(error, "ルールの検索に失敗しました");
		}
	}

	/**
	 * 公開ルールを一覧取得
	 */
	async findPublicRules(
		page = 1,
		pageSize = 10,
		searchQuery?: string,
	): Promise<{ rules: RuleWithRelations[]; total: number }> {
		try {
			const where: RuleWhereInput = {
				publishedAt: { not: null },
				visibility: "public",
				...(searchQuery
					? {
							OR: [
								{ name: { contains: searchQuery } },
								{ description: { contains: searchQuery } },
								{ tags: { contains: searchQuery } },
							],
						}
					: {}),
			};

			const [rules, total] = await Promise.all([
				this.db.rule.findMany({
					where,
					include: {
						user: {
							select: {
								id: true,
								username: true,
								email: true,
								displayName: true,
								avatarUrl: true,
							},
						},
					},
					orderBy: { updatedAt: "desc" },
					...this.getPaginationParams(page, pageSize),
				}),
				this.db.rule.count({ where }),
			]);

			return { rules, total };
		} catch (error) {
			this.handleError(error, "公開ルールの取得に失敗しました");
		}
	}

	/**
	 * ユーザーのルールを取得
	 */
	async findByCreatorId(
		creatorId: string,
		page = 1,
		pageSize = 10,
	): Promise<{ rules: RuleWithRelations[]; total: number }> {
		try {
			const where: RuleWhereInput = { userId: creatorId };

			const [rules, total] = await Promise.all([
				this.db.rule.findMany({
					where,
					include: {
						/* versions: {
							orderBy: { versionNumber: "desc" },
							take: 1,
						}, */
					},
					orderBy: { updatedAt: "desc" },
					...this.getPaginationParams(page, pageSize),
				}),
				this.db.rule.count({ where }),
			]);

			return { rules, total };
		} catch (error) {
			this.handleError(error, "ユーザーのルール取得に失敗しました");
		}
	}

	/**
	 * ルールを更新
	 */
	async update(id: string, data: RuleUpdateInput): Promise<Rule> {
		try {
			return await this.db.rule.update({
				where: { id },
				data: {
					...data,
					updatedAt: this.getCurrentTimestamp(),
				},
			});
		} catch (error) {
			this.handleError(error, "ルールの更新に失敗しました");
		}
	}

	/**
	 * ルールを削除
	 */
	async delete(id: string): Promise<void> {
		try {
			// 関連するバージョンも削除
			await this.db.ruleVersion.deleteMany({
				where: { ruleId: id },
			});

			await this.db.rule.delete({
				where: { id },
			});
		} catch (error) {
			this.handleError(error, "ルールの削除に失敗しました");
		}
	}

	/**
	 * ルールのビュー数をインクリメント
	 */
	async incrementViewCount(id: string): Promise<void> {
		try {
			await this.db.rule.update({
				where: { id },
				data: {
					views: { increment: 1 },
					updatedAt: this.getCurrentTimestamp(),
				},
			});
		} catch (error) {
			// ビュー数の更新失敗はクリティカルではないのでログのみ
			console.error("Failed to increment view count:", error);
		}
	}

	/**
	 * バージョンを作成
	 */
	async createVersion(data: RuleVersionUncheckedCreateInput): Promise<RuleVersion> {
		try {
			return await this.db.ruleVersion.create({
				data: data as unknown as never,
			}) as unknown as RuleVersion;
		} catch (error) {
			this.handleError(error, "バージョンの作成に失敗しました");
		}
	}

	/**
	 * 最新バージョンを取得
	 */
	async getLatestVersion(ruleId: string): Promise<RuleVersion | null> {
		try {
			return await this.db.ruleVersion.findFirst({
				where: { ruleId },
				orderBy: { versionNumber: "desc" },
			});
		} catch (error) {
			this.handleError(error, "最新バージョンの取得に失敗しました");
		}
	}

	/**
	 * Get rule versions
	 */
	async getVersions(ruleId: string): Promise<RuleVersionWithCreator[]> {
		try {
			return await this.db.ruleVersion.findMany({
				where: { ruleId },
				orderBy: { createdAt: "desc" },
				include: {
					creator: {
						select: { id: true, username: true },
					},
				},
			});
		} catch (error) {
			this.handleError(error, "Failed to get rule versions");
		}
	}

	/**
	 * Get specific rule version
	 */
	async getVersion(ruleId: string, versionNumber: string) {
		try {
			return await this.db.ruleVersion.findFirst({
				where: {
					ruleId,
					versionNumber,
				},
				include: {
					creator: {
						select: { id: true, username: true },
					},
				},
			});
		} catch (error) {
			this.handleError(error, "Failed to get rule version");
		}
	}

	/**
	 * バージョンを削除
	 */
	async deleteVersion(id: string): Promise<void> {
		try {
			await this.db.ruleVersion.delete({
				where: { id },
			});
		} catch (error) {
			this.handleError(error, "バージョンの削除に失敗しました");
		}
	}
}
