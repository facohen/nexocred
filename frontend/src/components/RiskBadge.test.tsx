import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskBadge, MoraDot, bucketFromDias } from "./RiskBadge";

describe("bucketFromDias — escala ordinal de mora", () => {
  it("mapea cada tramo al bucket correcto", () => {
    expect(bucketFromDias(0)).toBe("al_dia");
    expect(bucketFromDias(-5)).toBe("al_dia");
    expect(bucketFromDias(1)).toBe("par30");
    expect(bucketFromDias(30)).toBe("par30");
    expect(bucketFromDias(31)).toBe("par60");
    expect(bucketFromDias(60)).toBe("par60");
    expect(bucketFromDias(61)).toBe("par90");
    expect(bucketFromDias(90)).toBe("par90");
    expect(bucketFromDias(91)).toBe("castigo");
    expect(bucketFromDias(200)).toBe("castigo");
  });
});

describe("RiskBadge", () => {
  it("muestra el texto del tramo (no solo color — WCAG)", () => {
    render(<RiskBadge dias={45} />);
    expect(screen.getByText("PAR60")).toBeInTheDocument();
  });

  it("acepta bucket explícito", () => {
    render(<RiskBadge bucket="castigo" />);
    expect(screen.getByText("Castigo")).toBeInTheDocument();
  });
});

describe("MoraDot", () => {
  it("expone el label accesible por aria-label", () => {
    render(<MoraDot dias={75} />);
    expect(screen.getByLabelText("PAR90")).toBeInTheDocument();
  });
});
