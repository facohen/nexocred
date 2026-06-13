import { test, expect } from "@playwright/test";

/**
 * Flujo financiero base: login con cada rol → aterriza en su HOME DE TRABAJO
 * (no /personas), ve su nav por trabajo. Valida la arquitectura inbox-driven
 * end-to-end en el browser real con MSW.
 */

test("admin loguea y aterriza en el Tablero Ejecutivo (no /personas)", async ({ page }) => {
  await page.goto("/login");
  // El form viene pre-rellenado con admin; ingresar.
  await page.getByRole("button", { name: /ingresar/i }).click();

  // Aterriza en el Tablero Ejecutivo (home del admin), NO en una tabla de personas.
  await expect(page).toHaveURL(/\/torre/);
  await expect(page.getByRole("heading", { name: /Tablero Ejecutivo/i })).toBeVisible();
});

test("el sidebar muestra áreas de trabajo (verbos), no tablas de DB", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/torre/);

  // Nav por trabajo: 'Mi bandeja' y secciones de áreas, no 'Personas' como item 1.
  const nav = page.getByRole("navigation", { name: /navegación principal/i });
  await expect(nav.getByRole("link", { name: /Mi bandeja/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Tablero Ejecutivo/i })).toBeVisible();
});

test("login como cobrador aterriza en Ruta de Cobranza", async ({ page }) => {
  await page.goto("/login");
  // Seleccionar el usuario cobrador del panel de demo.
  await page.getByRole("button", { name: /cobrador_a\.full@nexocred\.test/i }).first().click();
  await page.getByRole("button", { name: /ingresar/i }).click();

  await expect(page).toHaveURL(/\/ruta/);
});

test("dark mode: el toggle persiste y cambia el tema", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/\/torre/);

  const html = page.locator("html");
  const before = await html.getAttribute("class");

  await page.getByRole("button", { name: /modo (oscuro|claro)/i }).click();
  const after = await html.getAttribute("class");
  expect(after).not.toBe(before);

  // Persiste tras recargar.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("class", after ?? "");
});
