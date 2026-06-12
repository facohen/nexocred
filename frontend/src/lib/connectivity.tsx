import { createContext, useContext } from "react";

/**
 * Guard de conectividad de mostrador (Decisión de negocio #3).
 *
 * Cuando la app está OFFLINE en una pantalla de MOSTRADOR (es decir, cualquier
 * ruta que NO sea La Ruta de campo), las acciones financieras deben quedar
 * DESHABILITADAS y mostrarse un banner "Esperando conexión": encolar a ciegas un
 * pago/desembolso de mostrador genera ambigüedad sobre si se confirmó.
 *
 * La Ruta (`features/ruta`: /ruta y /rendicion) queda EXENTA — su flujo offline
 * con cola idempotente es intencional y el caso de uso central del cobrador.
 *
 * `bloqueado === true` significa "offline en contexto de mostrador": los
 * `TransactionButton` consumen este contexto y se auto-deshabilitan.
 */
export interface ConnectivityState {
  bloqueado: boolean;
}

const ConnectivityContext = createContext<ConnectivityState>({ bloqueado: false });

export const ConnectivityProvider = ConnectivityContext.Provider;

export function useConnectivity(): ConnectivityState {
  return useContext(ConnectivityContext);
}
