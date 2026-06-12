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
