import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme, resolveInitialTheme } from "./theme";

function Probe() {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme("dark")}>set-dark</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("arranca en light por defecto (sin preferencia ni sistema oscuro)", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }) as MediaQueryList);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("toggle alterna el tema y aplica la clase .dark al html", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persiste la elección en localStorage", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByText("set-dark"));
    expect(localStorage.getItem("nexocred-theme")).toBe("dark");
  });

  it("resolveInitialTheme respeta la preferencia persistida", () => {
    localStorage.setItem("nexocred-theme", "dark");
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("resolveInitialTheme cae al sistema cuando no hay preferencia", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }) as MediaQueryList);
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("useTheme fuera del provider lanza error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      act(() => {
        render(<Probe />);
      }),
    ).toThrow(/ThemeProvider/);
  });
});
