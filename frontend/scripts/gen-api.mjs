// Genera src/lib/api/schema.ts desde openapi.json (contrato commiteado).
//
// El openapi.json se exporta del backend vivo con:
//   cd backend && conda run -n nexocred python -m scripts.exportar_openapi
//
// Este script solo transforma ese contrato en tipos TypeScript. Mantenerlos
// separados permite regenerar tipos sin levantar el backend, y que el CI
// valide drift (schema.ts debe quedar limpio tras regenerar).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const spec = resolve(root, "openapi.json");
const out = resolve(root, "src/lib/api/schema.ts");

if (!existsSync(spec)) {
  console.error(
    `No existe ${spec}.\nExportalo del backend:\n  cd backend && conda run -n nexocred python -m scripts.exportar_openapi`,
  );
  process.exit(1);
}

execFileSync(
  "npx",
  ["openapi-typescript", spec, "-o", out],
  { stdio: "inherit", cwd: root },
);

console.log(`schema.ts generado desde ${spec}`);
