import { expect, test } from "@playwright/test";

test("home page shows primary CTAs", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByRole("link", { name: "ルールを見る" })).toHaveAttribute(
		"href",
		"/rules",
	);
	await expect(page.getByRole("link", { name: "無料で始める" })).toHaveAttribute(
		"href",
		"/auth?tab=register",
	);
});
