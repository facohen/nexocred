import { defineConfig, devices } from "@playwright/test";

/**
 * E2E acotado a los flujos donde un bug = pérdida de plata o de cobro:
 * (1) login → originación → desembolso → pago, (2) Ruta de Cobranza offline
 * (incl. test de doble-cobro). Corre contra el dev server con MSW activado
 * (VITE_MSW=true) para datos deterministas sin backend.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5180",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "VITE_MSW=true vite --port 5180 --host 127.0.0.1",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
