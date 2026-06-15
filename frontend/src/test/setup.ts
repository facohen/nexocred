import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "@/mocks/server";

// jsdom doesn't implement scrollTo; TanStack Router calls it on navigation.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

// cmdk calls scrollIntoView on highlighted items; jsdom lacks it.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom (vitest 4 bundle) no implementa matchMedia; ThemeProvider lo consulta
// para resolver el tema del sistema. Default a "light" (matches: false); los
// tests que necesiten "dark" lo sobreescriben con vi.stubGlobal.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// cmdk relies on ResizeObserver, which jsdom does not provide.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
