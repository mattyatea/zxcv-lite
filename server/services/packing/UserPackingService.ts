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
 * ユーザー情報のパッキングオプション
 */
export interface UserPackingOptions {
	/** 現在のユーザーID（自分のプロフィールかどうかの判定に使用） */
	currentUserId?: string;
	/** メールアドレスを含めるか */
	includeEmail?: boolean;
	/** 公開プロフィール向けの最小情報を返すか */
	publicOnly?: boolean;
}

/**
 * 検索・一覧向けユーザー情報
 */
export interface UserPack {
	id: string;
	username: string;
	email: string | null;
}

/**
 * ユーザープロフィールの基本情報（共通部分）
 */
interface BaseUserProfile {
	id: string;
	username: string;
	emailVerified: boolean;
	displayName: string | null;
	bio: string | null;
	location: string | null;
	website: string | null;
	avatarUrl: string | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * 完全なユーザープロフィール情報
 */
export interface FullUserProfile extends BaseUserProfile {
	email: string;
	role: string;
}

/**
 * 他人のユーザープロフィール情報（メール・roleなし）
 */
export interface OtherUserProfile extends BaseUserProfile {
	// センシティブな情報は含まない（省略）
}

/**
 * プロフィールの詳細情報（メール・roleは条件付き）
 */
export type UserDetailProfile = FullUserProfile | OtherUserProfile;

/**
 * 公開プロフィール情報
 */
export interface PublicUserProfile {
	id: string;
	username: string;
	displayName: string | null;
	bio: string | null;
	location: string | null;
	website: string | null;
	avatarUrl: string | null;
	createdAt: number;
}

/**
 * プロフィールの詳細情報（統合型）
 */
export type UserDetailPack = UserDetailProfile | PublicUserProfile;

/**
 * ユーザー統計情報
 */
export interface UserStats {
	rulesCount: number;
	totalStars?: number;
}

/**
 * 統計情報付きユーザー情報（自分用）
 */
export interface UserMePack extends BaseUserProfile {
	email: string;
	role: string;
	stats: UserStats;
}

/**
 * ユーザー情報を統一的にパッキングするユーティリティ
 * データベースアクセスは行わず、与えられた値のみをフォーマットする
 */
export class UserPackingService {
	/**
	 * 一覧・検索向けユーザー情報を作成
	 */
	pack(user: User, currentUserId?: string): UserPack;
	pack(users: User[], currentUserId?: string): UserPack[];
	pack(userOrUsers: User | User[], currentUserId?: string): UserPack | UserPack[] {
		if (Array.isArray(userOrUsers)) {
			return userOrUsers.map((user) => this.pack(user, currentUserId));
		}
		return {
			id: userOrUsers.id,
			username: userOrUsers.username,
			email: userOrUsers.id === currentUserId ? userOrUsers.email : null,
		};
	}

	/**
	 * プロフィール詳細情報を作成
	 */
	detailPack(user: User, options: UserPackingOptions & { publicOnly: true }): PublicUserProfile;
	detailPack(user: User, options: UserPackingOptions & { includeEmail: true }): FullUserProfile;
	detailPack(user: User, options?: UserPackingOptions): UserDetailProfile;
	detailPack(user: User, options: UserPackingOptions = {}): UserDetailPack {
		if (options.publicOnly) {
			return {
				id: user.id,
				username: user.username,
				displayName: user.displayName,
				bio: user.bio,
				location: user.location,
				website: user.website,
				avatarUrl: user.avatarUrl,
				createdAt: user.createdAt,
			};
		}

		const isOwnProfile = options.currentUserId === user.id;
		const baseProfile: OtherUserProfile = {
			id: user.id,
			username: user.username,
			emailVerified: user.emailVerified,
			displayName: user.displayName,
			bio: user.bio,
			location: user.location,
			website: user.website,
			avatarUrl: user.avatarUrl,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		};

		if (isOwnProfile || options.includeEmail) {
			return {
				...baseProfile,
				email: user.email,
				role: user.role,
			};
		}

		return baseProfile;
	}

	/**
	 * 複数ユーザーの一覧・検索情報を作成
	 */
	packMany(users: User[], currentUserId?: string): UserPack[] {
		return users.map((user) => this.pack(user, currentUserId));
	}

	/**
	 * 自分向けのユーザー情報を作成
	 */
	mePack(user: User, stats: UserStats): UserMePack {
		return {
			id: user.id,
			email: user.email,
			username: user.username,
			role: user.role,
			emailVerified: user.emailVerified,
			displayName: user.displayName,
			bio: user.bio,
			location: user.location,
			website: user.website,
			avatarUrl: user.avatarUrl,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			stats,
		};
	}
}
