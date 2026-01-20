// https://nuxt.com/docs/api/configuration/nuxt-config
// biome-ignore lint/correctness/noUndeclaredVariables: defineNuxtConfig is global
export default defineNuxtConfig({
	compatibilityDate: "2025-08-01",
	devtools: { enabled: true },
	modules: [
		"nitro-cloudflare-dev",
		[
			"@nuxtjs/tailwindcss",
			{
				exposeConfig: false,
				viewports: false,
				editorSupport: false,
				cssPath: "~/assets/css/main.css",
				configPath: "~/tailwind.config.js",
			},
		],
		"@pinia/nuxt",
	],
	future: {
		compatibilityVersion: 4,
	},

	srcDir: "app/",

	nitro: {
		preset: "cloudflare_module",

		rollupConfig: {
			external: ["@prisma/client", "@zxcv/opencode"],
		},

		cloudflare: {
			deployConfig: false, // GitHub Actionsで独自のwrangler.tomlを使用するため
			nodeCompat: true,
		},
	},

	css: ["~/assets/css/main.css", "~/assets/css/animations.css", "~/assets/css/transitions.css"],

	app: {
		pageTransition: { name: "page", mode: "out-in" },
		layoutTransition: { name: "layout", mode: "out-in" },
		head: {
			title: "zxcv - Coding Rules Platform",
			meta: [
				{ charset: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ name: "description", content: "Share and manage coding rules with collaborators" },
			],
			link: [
				{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
				{ rel: "preconnect", href: "https://fonts.googleapis.com" },
				{ rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
				{
					rel: "stylesheet",
					href: "https://fonts.googleapis.com/css2?family=M+PLUS+1:wght@400;500;600;700&display=swap",
				},
			],
		},
	},

	vite: {
		build: {
			cssCodeSplit: true,
			rollupOptions: {
				external: ["@zxcv/opencode"],
				output: {
					manualChunks(id) {
						if (id.includes("node_modules")) {
							if (id.includes("vue") && !id.includes("pinia")) {
								return "vue-vendor";
							}
							if (id.includes("pinia")) {
								return "pinia";
							}
							if (id.includes("marked")) {
								return "marked";
							}
							return "vendor";
						}
					},
				},
			},
		},
	},
});
