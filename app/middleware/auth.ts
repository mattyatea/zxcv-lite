import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth";

export default defineNuxtRouteMiddleware(async (to) => {
	// サーバーサイドでは認証チェックをスキップ
	if (!import.meta.client) {
		return;
	}

	const authStore = useAuthStore();
	const { isAuthenticated, isReady } = storeToRefs(authStore);

	if (!isReady.value) {
		await authStore.initializeAuth();
	}

	// 初期化完了後に認証チェック
	if (!isAuthenticated.value) {
		// Save the attempted route for redirect after login
		const redirectPath = to.fullPath;
		return navigateTo(`/auth?redirect=${encodeURIComponent(redirectPath)}`);
	}
});
