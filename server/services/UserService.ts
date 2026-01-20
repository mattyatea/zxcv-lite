import type { UserStats } from "./packing/UserPackingService";

// biome-ignore lint/performance/noDelete: PrismaClient type requires any for runtime compatibility
type PrismaClient = any;
type User = {
	id: string;
	email: string;
	username: string;
	role: string;
	emailVerified: boolean;
	displayName: string | null;
	bio: string | null;
	location: string | null;
	website: string | null;
	avatarUrl: string | null;
	createdAt: number;
	updatedAt: number;
};

/**
 * ユーザー統計情報取得オプション
 */
export interface UserStatsOptions {
	/** 公開ルールのみカウントするか */
	publicOnly?: boolean;
	/** 合計スター数を含めるか */
	includeTotalStars?: boolean;
}

/**
 * ユーザー関連のデータ取得サービス
 * データベースアクセスを伴う操作を提供
 */
export class UserService {
	constructor(private db: PrismaClient) {}

	/**
	 * ユーザーの統計情報を取得
	 */
	async getUserStats(userId: string, options: UserStatsOptions = {}): Promise<UserStats> {
		try {
			const { publicOnly = false, includeTotalStars = false } = options;

			const [rulesCount, totalStars] = await Promise.all([
				this.db.rule.count({
					where: {
						userId,
						...(publicOnly && { visibility: "public" }),
					},
				}),
				includeTotalStars
					? this.db.ruleStar.count({
							where: {
								rule: {
									userId,
									...(publicOnly && { visibility: "public" }),
								},
							},
						})
					: Promise.resolve(0),
			]);

			const stats: UserStats = {
				rulesCount: typeof rulesCount === "number" ? rulesCount : 0,
			};

			if (includeTotalStars) {
				stats.totalStars = typeof totalStars === "number" ? totalStars : 0;
			}

			return stats;
		} catch (error) {
			// エラーが発生した場合はデフォルト値を返す
			console.error("Error getting user stats:", error);
			return {
				rulesCount: 0,
				...(options.includeTotalStars && { totalStars: 0 }),
			};
		}
	}

	/**
	 * ユーザーをIDで取得
	 */
	async getUserById(userId: string): Promise<User | null> {
		return await this.db.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				email: true,
				username: true,
				emailVerified: true,
				role: true,
				displayName: true,
				avatarUrl: true,
				bio: true,
				website: true,
				location: true,
				company: true,
				twitterUsername: true,
				githubUsername: true,
			},
		});
	}

	/**
	 * ユーザーをユーザー名で取得
	 */
	async getUserByUsername(username: string): Promise<User | null> {
		return await this.db.user.findUnique({
			where: { username: username.toLowerCase() },
		});
	}

	/**
	 * ユーザー名で検索
	 */
	async searchUsersByUsername(username: string, limit = 10): Promise<User[]> {
		return await this.db.user.findMany({
			where: {
				username: {
					contains: username.toLowerCase(),
				},
			},
			take: limit,
			orderBy: {
				username: "asc",
			},
		});
	}
}
