import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { VisitaCaptureForm } from "./VisitaCaptureForm";
import type { components } from "@/lib/api/schema";

type Parada = components["schemas"]["ParadaConSaldoOut"];

const paradaBase: Parada = {
  id: "parada-1",
  ruta_id: "ruta-1",
  prestamo_id: "prestamo-1",
  orden: 1,
  saldo_exigible: "100.00",
  resultado: null,
  monto_cobrado: null,
  foto_url: null,
  lat: null,
  lng: null,
  notas: null,
  visitada_en: null,
};

describe("VisitaCaptureForm", () => {
  it("test_guardar_dos_veces_misma_instancia_produce_mismo_id", async () => {
    const user = userEvent.setup();
    const onGuardar = vi.fn();

    render(
      <VisitaCaptureForm
        parada={paradaBase}
        rutaId="ruta-1"
        onGuardar={onGuardar}
        onCancelar={() => {}}
      />,
    );

    const btnGuardar = screen.getByRole("button", { name: /guardar visita/i });

    await user.click(btnGuardar);
    // Re-enable for second call if needed — but after the fix the button should
    // stay stable with same IDs regardless.
    // For the RED phase (before fix), the button is not disabled so two clicks work.
    await user.click(btnGuardar);

    expect(onGuardar).toHaveBeenCalledTimes(2);

    const firstCall = onGuardar.mock.calls[0][0];
    const secondCall = onGuardar.mock.calls[1][0];

    expect(firstCall.id).toBe(secondCall.id);
    expect(firstCall.pagoId).toBe(secondCall.pagoId);
  });

  it("test_boton_deshabilitado_durante_envio", async () => {
    const user = userEvent.setup();

    // onGuardar returns a promise that we control
    let resolveGuardar!: () => void;
    const onGuardar = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveGuardar = resolve;
        }),
    );

    render(
      <VisitaCaptureForm
        parada={paradaBase}
        rutaId="ruta-1"
        onGuardar={onGuardar}
        onCancelar={() => {}}
      />,
    );

    const btnGuardar = screen.getByRole("button", { name: /guardar visita/i });

    // Click to start submission (don't await — let it hang)
    await user.click(btnGuardar);

    // While onGuardar is pending, button should be disabled
    expect(btnGuardar).toBeDisabled();

    // Resolve the promise to clean up — wrap in act to flush state updates
    await act(async () => {
      resolveGuardar();
    });
  });
});
