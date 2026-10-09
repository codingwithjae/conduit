# Tasks

## 1. Motor de inferencia de pool y auto-failover

- [x] 1.1 Implementar `PoolInferenceUseCase` en `src/application/use-cases/pool-inference.ts` con selección de cuenta activa, llamada con tokens OAuth y rotación ante 429; hecho cuando tests en `tests/application/pool-inference.test.ts` verifican inferencia exitosa y rotación automática.
- [x] 1.2 Implementar control de bucles y reporte de agotamiento total cuando todas las cuentas del pool devuelven 429; hecho cuando tests unitarios cubren el fallo controlado tras agotar el pool.

## 2. Comando CLI conduit use

- [x] 2.1 Conectar el comando `conduit use <model> <prompt>` en `src/adapters/inbound/cli/program.ts` con soporte de `--api-key`; hecho cuando tests en `tests/cli/use.test.ts` verifican invocación con pool, opción de forzar API key y validaciones de entrada.

## 3. Componente TUI interactivo AccountManager

- [x] 3.1 Implementar el componente reactivo `AccountManager.tsx` en `src/adapters/inbound/cli/tui/AccountManager.tsx` con navegación por teclado (flechas, 's' para activar, 'e' para alias, 'd' para eliminar, 'q' para salir); hecho cuando tests verifican la estructura y opciones del componente.
- [x] 3.2 Conectar `conduit account` para abrir `AccountManager` en TTY interactivo y fallback a `account list` en texto plano en entornos no-TTY; hecho cuando tests verifican ambos modos.

## 4. Validación final y verificación OpenSpec

- [x] 4.1 Ejecutar `openspec validate --strict`, typecheck, suite completa de tests y build; hecho cuando todas las suites pasan al 100%.
