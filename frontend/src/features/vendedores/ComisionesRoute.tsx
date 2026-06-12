import { ComisionesPage } from "./ComisionesPage";

/**
 * Route entry for comisiones. In the POC the vendor is resolved from the
 * session context server-side; here we target the demo vendor.
 */
export function ComisionesRoute() {
  return <ComisionesPage vendedorId="user-vendedor" />;
}
