const { test, expect, _electron } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
for (const role of ["leader", "member"]) test(`local server helper (${role})`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-local-overlay-"));
  let application;
  try {
    const env = { ...process.env, PLAYBOUND_SMOKE_ROOT: root, PLAYBOUND_SMOKE_LOCAL_ROLE: role };
    delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({ args: [path.join(__dirname, "local-overlay-entry.js")], env });
    const page = await application.firstWindow();
    if (role === "leader") {
      await expect(page.getByText("Local server diagnostics", { exact: true })).toBeVisible();
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Restart local server", exact: true }).click();
      await expect(page.getByText(/Restart queued for the host launcher/)).toBeVisible();
      await page.getByText("Local server diagnostics", { exact: true }).click();
      await page.getByRole("button", { name: "Refresh diagnostics" }).click();
      await expect(page.locator("pre")).toContainText("<script>do not execute</script>");
      await expect(page.locator("pre script")).toHaveCount(0);
      await page.getByLabel("Bot fill").fill("2");
      await page.getByLabel("Bot fill").dispatchEvent("change");
      await expect(page.getByText(/Applying this restarts the server/)).toBeVisible();
      await page.getByRole("button", { name: "Apply changes" }).click();
      await expect(page.getByText(/Queued for the host launcher/)).toBeVisible();
    } else {
      await expect(page.getByText("Only the party leader can change these.")).toBeVisible();
      await expect(page.getByText("Local server diagnostics", { exact: true })).toHaveCount(0);
    }
  } finally {
    if (application) await application.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
