# Tasks

## 1. Gestor de Worktrees

- [x] 1.1 Implementar `GitWorktreeManager` en `src/adapters/outbound/git/git-worktree-manager.ts` con creación de ramas, aislamiento en `.conduit/worktrees/<id>`, extracción de diff y limpieza; hecho cuando tests en `tests/git/worktree-manager.test.ts` verifican ciclo de vida completo en un repositorio temporal.

## 2. Bucle Agéntico y Sandbox de Herramientas

- [x] 2.1 Implementar herramientas de sandbox (`read_file`, `write_file`, `edit_file`, `run_command`) con verificación estricta de confinamiento de rutas dentro del worktree; hecho cuando tests en `tests/application/subagent-sandbox.test.ts` verifican operaciones válidas y bloquean escapes de ruta.
- [x] 2.2 Implementar `SubagentToolLoop` en `src/application/use-cases/subagent-tool-loop.ts` con límite de pasos (15 por defecto), ejecución iterativa y propagación de auto-failover en caliente; hecho cuando tests en `tests/application/subagent-tool-loop.test.ts` cubren tareas simuladas de varios pasos y tolerancia a 429.

## 3. Integración MCP y Comando CLI

- [x] 3.1 Registrar la herramienta `dispatch_subagent_task` en `src/adapters/inbound/mcp/server.ts` con esquema Zod estricto y anotaciones de red; hecho cuando tests en `tests/mcp/server.protocol.test.ts` verifican su invocación y estructura de salida.
- [x] 3.2 Implementar el comando CLI `conduit dispatch <model> <task...>` en `src/adapters/inbound/cli/program.ts`; hecho cuando tests en `tests/cli/dispatch.test.ts` verifican ejecución directa y salida de diff en terminal.

## 4. Validación final y verificación OpenSpec

- [x] 4.1 Ejecutar `openspec validate --strict`, typecheck, suite completa de tests y build; hecho cuando todas las suites pasan al 100%.
