# Tasks

## 1. Dependencias y entidades de dominio

- [x] 1.1 Añadir `ink` y `react` a `package.json`, actualizar `pnpm-lock.yaml` y verificar compilación limpia con `pnpm run typecheck`.
- [x] 1.2 Definir entidades `Account`, `AccountPool`, `QuotaWindow` y el puerto `AccountStorePort`; hecho cuando tests unitarios en `tests/domain/pool.test.ts` verifican validaciones y estados de cuentas.

## 2. Almacén seguro FileAccountStore

- [x] 2.1 Implementar `FileAccountStore` en `src/adapters/outbound/storage/file-account-store.ts` con escritura atómica y permisos estrictos `0600`; hecho cuando tests en `tests/storage/file-account-store.test.ts` verifican creación, lectura, actualización y permisos de archivo.

## 3. Importador universal no destructivo

- [x] 3.1 Implementar adaptadores `AntigravityImporter`, `CodexImporter` y `ClaudeCodeImporter` en `src/adapters/outbound/importers/`; hecho cuando tests en `tests/importers/account-importer.test.ts` verifican descubrimiento, lectura no destructiva y deduplicación.

## 4. TUI reactiva y comandos CLI

- [x] 4.1 Implementar componente reactivo Ink `QuotaDashboard` en `src/adapters/inbound/cli/tui/QuotaDashboard.tsx` y comando `conduit quota`; hecho cuando tests verifican formato de cuotas y manejo de entornos no-TTY.
- [x] 4.2 Implementar comandos CLI `conduit account [list|switch|alias|import]`; hecho cuando tests en `tests/cli/account.test.ts` verifican cada subcomando y validan que no se impriman secretos.

## 5. Herramientas MCP y validación final

- [x] 5.1 Registrar herramientas `get_quota_status`, `switch_account` y `set_account_alias` en `conduit mcp serve`; hecho cuando tests en `tests/mcp/server.protocol.test.ts` verifican las llamadas y esquemas sin exponer tokens.
- [x] 5.2 Ejecutar `openspec validate --strict`, typecheck, suite completa de tests y build; hecho cuando todas las suites pasan al 100%.
