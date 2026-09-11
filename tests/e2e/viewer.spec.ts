import { test, expect } from "@playwright/test";
for (const url of ["http://127.0.0.1:3191/", "http://127.0.0.1:3192/camera/"]) {
  test(`selection, live, camera change, stop and context: ${url}`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const requests: string[] = [];
    page.on("request", (req) => requests.push(new URL(req.url()).pathname));
    await page.goto(url);
    await expect(page.getByRole("button", { name: "▶ Avvia" })).toBeDisabled();
    await page.getByRole("button", { name: /Camera uno/ }).click();
    await page.getByRole("button", { name: "▶ Avvia" }).click();
    await expect(page.locator(".live-badge")).toHaveText("Live");
    await expect(page.locator(".image-stage img")).toBeVisible();
    expect(
      await page
        .locator(".image-stage img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
    await page.getByRole("button", { name: /Camera due/ }).click();
    await expect(page.locator(".image-stage img")).toHaveAttribute(
      "alt",
      "Immagini in diretta da Camera due",
    );
    await expect(page.locator(".live-badge")).toHaveText("Live");
    await page.getByRole("button", { name: "■ Ferma" }).click();
    await expect(page.locator(".image-stage img")).toHaveCount(0);
    await page.screenshot({
      path: `test-results/${url.includes("/camera/") ? "context" : "root"}-viewer.png`,
      fullPage: true,
    });
    if (url.includes("/camera/"))
      expect(
        requests.filter(
          (path) => path.startsWith("/api/") || path.startsWith("/assets/"),
        ),
      ).toEqual([]);
    expect(failures).toEqual([]);
  });
  test(`error and bounded retry: ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.getByRole("button", { name: /Camera occupata/ }).click();
    await page.getByRole("button", { name: "▶ Avvia" }).click();
    await expect(page.getByRole("alert")).toContainText("occupata");
    await expect(page.getByRole("button", { name: "▶ Riprova" })).toBeVisible({
      timeout: 15000,
    });
  });
}
