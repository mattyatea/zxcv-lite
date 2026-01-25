export default defineNuxtRouteMiddleware((to) => {
	if (to.path === "/login" || to.path === "/register") {
		const tab = to.path === "/register" ? "register" : "login";
		return navigateTo(
			{
				path: "/auth",
				query: {
					...to.query,
					tab,
				},
			},
			{ replace: true },
		);
	}
});
