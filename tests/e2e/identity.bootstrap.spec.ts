import {expect, test} from "@playwright/test"

test.describe("identity bootstrap (contract)", () => {
  test("ensures identity affordances are visible", async ({page}) => {
    // Traceability: anchors derived from tests/e2e/snapshots/initial-ui.md
    await page.goto("http://localhost:1847/")

    // 1) Hero heading is visible
    await expect(page.getByRole("heading", {name: "Welcome to BudaBit!"})).toBeVisible()

    // 2) Login CTA visible + enabled (prefer data-testid; otherwise role-based)
    const loginByTestId = page.getByTestId("identity-cta-login")
    const loginLocator =
      (await loginByTestId.count()) > 0 ? loginByTestId : page.getByRole("button", {name: /^log in/i})

    await expect(loginLocator).toBeVisible()
    await expect(loginLocator).toBeEnabled()

    // 3) Create-account CTA visible (prefer data-testid; otherwise role-based)
    const createByTestId = page.getByTestId("identity-cta-create")
    const createAsLink = page.getByRole("link", {name: /^create an account/i})
    const createFallback =
      (await createAsLink.count()) > 0
        ? createAsLink
        : page.getByRole("button", {name: /^create an account/i})

    const createLocator = (await createByTestId.count()) > 0 ? createByTestId : createFallback
    await expect(createLocator).toBeVisible()

    // 4) Identity state is observable (prefer dedicated test id; otherwise login CTA serves as affordance)
    const statusByTestId = page.getByTestId("identity-status")
    if ((await statusByTestId.count()) > 0) {
      await expect(statusByTestId).toBeVisible()
    } else {
      await expect(loginLocator).toBeVisible()
    }
  })
})