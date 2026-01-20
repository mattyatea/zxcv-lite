import { ORPCError } from "@orpc/server";
import type { PrismaClient, User } from "@prisma/client";
import { nanoid } from "nanoid";
import { UserRepository } from "../repositories/UserRepository";
import type { CloudflareEnv } from "../types/env";
import { createJWT, createRefreshToken, generateToken, verifyToken } from "./AuthTokenService";
import { hashPassword, verifyPassword } from "../utils/cryptoHash";
import { authErrors } from "../utils/i18nTranslate";
import type { Locale } from "../utils/i18nLocale";

export class AuthService {
	private userRepository: UserRepository;

	constructor(
		private db: PrismaClient,
		private env: CloudflareEnv,
	) {
		this.userRepository = new UserRepository(db);
	}

	/**
	 * ユーザー登録
	 */
	async register(data: { username: string; email: string; password: string; locale?: string }) {
		// 既存ユーザーチェック
		const existingUser = await this.userRepository.findByEmail(data.email);
		if (existingUser) {
			const locale = (data.locale as Locale) || "ja";
			throw new ORPCError("CONFLICT", {
				message: authErrors.emailAlreadyInUse(locale),
			});
		}

		const existingUsername = await this.userRepository.findByUsername(data.username);
		if (existingUsername) {
			const locale = (data.locale as Locale) || "ja";
			throw new ORPCError("CONFLICT", {
				message: authErrors.usernameAlreadyInUse(locale),
			});
		}

		// パスワードのハッシュ化
		const hashedPassword = await hashPassword(data.password);
		const userId = nanoid();

		// ユーザー作成（メール確認はスキップ）
		const user = await this.userRepository.create({
			id: userId,
			username: data.username,
			email: data.email,
			passwordHash: hashedPassword,
			emailVerified: true,
		});

		return {
			success: true,
			message: "Registration successful.",
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
			},
		};
	}

	/**
	 * ログイン
	 */
	async login(email: string, password: string, locale: Locale = "ja") {
		const user = await this.userRepository.findByEmail(email);
		if (!user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: authErrors.invalidCredentials(locale),
			});
		}

		if (!user.passwordHash) {
			throw new ORPCError("UNAUTHORIZED", {
				message: authErrors.invalidCredentials(locale),
			});
		}

		const isValid = await verifyPassword(password, user.passwordHash);
		if (!isValid) {
			throw new ORPCError("UNAUTHORIZED", {
				message: authErrors.invalidCredentials(locale),
			});
		}

		// 最終ログイン時刻を更新
		await this.userRepository.updateLastLogin(user.id);

		// アクセストークン生成
		const accessToken = await createJWT(
			{
				sub: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
				emailVerified: user.emailVerified,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
			},
			this.env,
		);

		// リフレッシュトークン生成
		const refreshToken = await createRefreshToken(user.id, this.env);

		return {
			accessToken,
			refreshToken,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				role: user.role,
				emailVerified: user.emailVerified,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
			},
		};
	}

	/**
	 * IDでユーザーを取得
	 */
	async getUserById(userId: string): Promise<User | null> {
		return await this.userRepository.findById(userId);
	}

	/**
	 * トークンを生成
	 */
	async generateTokens(user: User) {
		const accessToken = await generateToken(
			{
				sub: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
				emailVerified: user.emailVerified,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
			},
			this.env.JWT_SECRET,
			"1h",
		);

		const refreshToken = await generateToken(
			{
				sub: user.id,
				type: "refresh",
			},
			this.env.JWT_SECRET,
			"7d",
		);

		return {
			accessToken,
			refreshToken,
		};
	}

	/**
	 * OAuthログインを処理
	 */
	async handleOAuthLogin(
		provider: "github",
		userInfo: {
			id: string;
			email: string;
			username?: string;
		},
		action = "login",
	): Promise<
		| {
				accessToken: string;
				refreshToken: string;
				user: {
					id: string;
					username: string;
					email: string;
					role: string;
					emailVerified: boolean;
					displayName: string | null;
					avatarUrl: string | null;
				};
		  }
		| {
				tempToken: string;
				provider: string;
				requiresUsername: true;
		  }
	> {
		// OAuthアカウントが既に存在するかチェック
		const existingOAuth = await this.db.oAuthAccount.findUnique({
			where: {
				provider_providerId: {
					provider,
					providerId: userInfo.id,
				},
			},
			include: { user: true },
		});

		let user: User | null = null;
		if (existingOAuth) {
			// 既存のOAuthアカウント
			user = existingOAuth.user;
		} else {
			// メールアドレスで既存ユーザーをチェック
			const existingUser = await this.userRepository.findByEmail(userInfo.email);

			if (existingUser) {
				// 既存ユーザーにOAuthアカウントをリンク
				await this.db.oAuthAccount.create({
					data: {
						id: nanoid(),
						userId: existingUser.id,
						provider,
						providerId: userInfo.id,
						email: userInfo.email,
						username: userInfo.username,
						createdAt: Math.floor(Date.now() / 1000),
					},
				});
				user = existingUser;
			}
		}

		// 新規ユーザーの場合
		if (!user) {
			// ログインアクションの場合はエラー
			if (action === "login") {
				throw new ORPCError("NOT_FOUND", {
					message: "このアカウントは登録されていません。新規登録画面から登録してください。",
				});
			}

			// 新規登録の場合は一時トークンを作成
			// 一時登録レコードを作成
			const tempToken = nanoid();
			const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1時間後に期限切れ

			await this.db.oAuthTempRegistration.create({
				data: {
					id: nanoid(),
					token: tempToken,
					provider,
					providerId: userInfo.id,
					email: userInfo.email.toLowerCase(),
					providerUsername: userInfo.username,
					expiresAt,
					createdAt: Math.floor(Date.now() / 1000),
				},
			});

			return {
				tempToken,
				provider,
				requiresUsername: true as const,
			};
		}

		// 最終ログイン時刻を更新
		await this.userRepository.updateLastLogin(user.id);

		// トークン生成
		const accessToken = await createJWT(
			{
				sub: user.id,
				email: user.email,
				username: user.username,
				role: user.role,
				emailVerified: user.emailVerified,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
			},
			this.env,
		);
		const refreshToken = await createRefreshToken(user.id, this.env);

		return {
			accessToken,
			refreshToken,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				role: user.role,
				emailVerified: user.emailVerified,
				displayName: user.displayName,
				avatarUrl: user.avatarUrl,
			},
		};
	}
}
