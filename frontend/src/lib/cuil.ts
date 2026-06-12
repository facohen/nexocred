/**
 * Validación de CUIL/CUIT por dígito verificador (módulo 11).
 * Espeja el algoritmo del backend (app/m01_personas/cuil.py): pesos
 * 5,4,3,2,7,6,5,4,3,2; dv = 11 - (suma % 11); 11 -> 0 y 10 -> 9.
 */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export function calcularDigitoVerificador(cuil10: string): number {
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(cuil10[i]) * PESOS[i];
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return 9;
  return resto;
}

export function validarCuil(cuil: string): boolean {
  const limpio = cuil.replace(/-/g, "");
  if (limpio.length !== 11 || !/^\d{11}$/.test(limpio)) return false;
  return calcularDigitoVerificador(limpio.slice(0, 10)) === Number(limpio[10]);
}
