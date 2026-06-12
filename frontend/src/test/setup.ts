import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "@/mocks/server";

// jsdom doesn't implement scrollTo; TanStack Router calls it on navigation.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
