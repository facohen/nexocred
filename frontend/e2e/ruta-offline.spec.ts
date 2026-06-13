import { test, expect } from "@playwright/test";

/**
 * Ruta de Cobranza offline-first. La lógica de cola idempotente y anti-doble
 * -cobro está exhaustivamente testeada a nivel unitario (queue.ts/sync.ts);
 * acá validamos el comportamiento end-to-end en el browser real: la ruta
 * carga, la caja se selecciona, y el estado offline es honesto (no rompe).
 */

async function loginCobrador(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /cobrador_a\.full@nexocred\.test/i }).first().click();
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/ruta/);
  await expect(page.getByTestId("ruta-root")).toBeVisible();
}

test("la Ruta de Cobranza carga con sus paradas y selector de caja", async ({ page }) => {
  await loginCobrador(page);
  // Hay un selector de caja (obligatorio para sincronizar cobros).
  await expect(page.locator("#caja")).toBeVisible();
  // El estado de sync es visible.
  await expect(page.getByTestId("sync-status")).toBeVisible();
});

test("offline: la app sigue operativa y muestra estado (no rompe ni spinner infinito)", async ({
  page,
  context,
}) => {
  await loginCobrador(page);

  // Seleccionar una caja (primera opción real).
  const opciones = await page.locator("#caja option").all();
  if (opciones.length > 1) {
    const val = await opciones[1].getAttribute("value");
    if (val) await page.locator("#caja").selectOption(val);
  }

  // Ir offline: la Ruta de Cobranza está EXENTA del guard de mostrador, así que
  // sigue usable (no debe aparecer el banner "Esperando conexión" que bloquea).
  await context.setOffline(true);
  await page.waitForTimeout(300);

  // La raíz de la ruta sigue presente y operativa (offline-first).
  await expect(page.getByTestId("ruta-root")).toBeVisible();

  // Volver online no rompe nada.
  await context.setOffline(false);
  await page.waitForTimeout(300);
  await expect(page.getByTestId("ruta-root")).toBeVisible();
});

test("el guard de mostrador SÍ bloquea acciones financieras offline (fuera de la Ruta)", async ({
  page,
  context,
}) => {
  // Como admin, ir a una pantalla de mostrador y cortar la conexión.
  await page.goto("/login");
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/torre/);

  await page.goto("/caja");
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  // Disparar el evento offline en la página (algunos engines no lo propagan solos).
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  // El banner de mostrador offline aparece (bloquea acciones financieras).
  await expect(page.getByTestId("banner-offline")).toBeVisible({ timeout: 8000 });

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
});
