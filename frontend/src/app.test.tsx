import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./app";

describe("App", () => {
  it("muestra la marca", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getAllByText(/NexoCred/i).length).toBeGreaterThan(0),
    );
  });
});
