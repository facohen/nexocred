import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./app";

describe("App", () => {
  it("muestra la marca", () => {
    render(<App />);
    expect(screen.getByText(/NexoCred/i)).toBeInTheDocument();
  });
});
