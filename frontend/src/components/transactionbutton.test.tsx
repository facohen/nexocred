import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TransactionButton } from "./TransactionButton";

describe("TransactionButton", () => {
  it("se deshabilita y muestra spinner mientras pending", () => {
    render(
      <TransactionButton pending onClick={() => {}}>
        Registrar pago
      </TransactionButton>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    // spinner accesible presente
    expect(screen.getByTestId("transaction-spinner")).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("habilitado y sin spinner cuando NO esta pending", () => {
    render(<TransactionButton onClick={() => {}}>Desembolsar</TransactionButton>);
    const btn = screen.getByRole("button");
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTestId("transaction-spinner")).not.toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-busy", "false");
  });

  it("no dispara onClick en el segundo click cuando ya quedo pending (previene doble submit)", async () => {
    const onClick = vi.fn();
    // Simula el patron real: el primer click pone pending=true y re-renderiza.
    function Harness() {
      const [pending, setPending] = useState(false);
      return (
        <TransactionButton
          pending={pending}
          onClick={() => {
            setPending(true);
            onClick();
          }}
        >
          Liquidar
        </TransactionButton>
      );
    }
    render(<Harness />);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);
    await userEvent.click(btn); // ya deshabilitado: este click no debe contar
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respeta disabled explicito aunque no este pending", () => {
    render(
      <TransactionButton disabled onClick={() => {}}>
        Pagar
      </TransactionButton>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
