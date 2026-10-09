# Design

## Context

Consulta `proposal.md` para la motivación y los archivos en `specs/` para los contratos observables. Conduit cuenta con CLI, adaptadores de proveedores oficiales, servidor MCP dual-era y pools de suscripciones persistidos con permisos `0600` e inferencia directa. Este cambio implementa el entorno de ejecución autónomo para subagentes (*Subagent Runtime*) con aislamiento en Git Worktrees temporales, bucle de herramientas acotado y retorno de diff estructurado.

## Goals / Non-Goals

**Goals:**
- Implementar `GitWorktreeManager` para aprovisionar y limpiar worktrees temporales en `.conduit/worktrees/<task-id>`.
- Implementar `SubagentToolLoop` con límite de 15 pasos por defecto, confinamiento estricto de rutas y auto-failover en caliente.
- Proveer herramientas locales (`read_file`, `write_file`, `edit_file`, `run_command`) confinadas al worktree.
- Permitir lectura de contexto externo y skills (`.agents/skills/`, etc.) en modo de solo lectura.
- Registrar la herramienta MCP `dispatch_subagent_task` y el comando CLI `conduit dispatch`.

**Non-Goals:**
- No fusionar automáticamente los cambios en la rama del supervisor; la decisión de merge es humana o del supervisor.
- No permitir escrituras fuera del worktree temporal.
- No crear interfaces gráficas en esta fase.

## Decisions

### 1. Gestión de Aislamiento con Git Worktrees (`GitWorktreeManager`)
- Cada tarea recibe un identificador único (ej. `task-abc12345`).
- Se crea una rama efímera y worktree:
  ```bash
  git worktree add -b conduit/task-<id> .conduit/worktrees/<id> HEAD
  ```
- Al finalizar el bucle:
  - Se ejecuta `git add -N .` (para incluir archivos nuevos) y se extrae el diff: `git diff HEAD`.
  - Se lista qué archivos fueron modificados: `git diff --name-only HEAD`.
  - Se remueve el worktree forzadamente: `git worktree remove --force .conduit/worktrees/<id>`.
  - Se elimina la rama temporal: `git branch -D conduit/task-<id>`.
  - Se limpian referencias huérfanas: `git worktree prune`.

### 2. Bucle Agéntico Acotado (`SubagentToolLoop`)
- Límite de pasos configurable (por defecto `maxSteps = 15`).
- El subagente recibe un System Prompt con su rol:
  - Analizar el problema.
  - Usar herramientas para leer código, editar archivos en su worktree y ejecutar tests/comandos.
  - Declarar finalización cuando las pruebas pasen.
- Confinamiento de seguridad:
  - Toda ruta enviada a `write_file` o `edit_file` se resuelve con `path.resolve(worktreePath, relativePath)`. Si la ruta resultante no comienza por `worktreePath`, se lanza `ConduitError("invalid_input", "Violación de confinamiento: no se puede escribir fuera del worktree")`.
  - `run_command` ejecuta subprocesos fijando `cwd: worktreePath` y con timeout estricto de 60 segundos por comando.

### 3. Auto-Failover en Caliente Durante el Bucle
- Cada llamada de razonamiento del subagente delega en `PoolInferenceUseCase`.
- Si el modelo responde con error HTTP 429 en el paso 5 del bucle, Conduit rota la cuenta activa en el pool de suscripciones, conserva todo el historial de herramientas acumulado y reintenta la llamada sin perder el progreso del subagente.

### 4. Herramienta MCP `dispatch_subagent_task`
- Registrada en `src/adapters/inbound/mcp/server.ts`.
- Entrada estricta:
  ```typescript
  {
    model: string;
    task: string;
    maxSteps?: number;
    confirmExternalSend?: boolean;
  }
  ```
- Devuelve un JSON estructurado con:
  - `diff`: El parche de git unificado listo para ser revisado o aplicado.
  - `summary`: Resumen de las acciones completadas por el subagente.
  - `modifiedFiles`: Array con las rutas de archivos alterados.
  - `stepsCompleted`: Número de iteraciones ejecutadas en el bucle.
  - `accountUsed`: Cuenta del pool que completó la última llamada.

## Risks / Trade-offs

- **[Repositorio con cambios sin commitear]** → `git worktree add` crea la nueva rama a partir de `HEAD` sin interferir con los cambios en el árbol de trabajo actual del usuario.
- **[Comandos colgados en el subagente]** → `run_command` tiene un timeout estricto de 60 segundos por ejecución para evitar procesos zombies.
- **[Agotamiento de pasos sin terminar]** → Si se alcanza el paso 15, el subagente se detiene y devuelve el diff acumulado con un aviso de que se alcanzó el límite de pasos.

## Migration Plan

Totalmente aditivo y retrocompatible. No altera ningún comando existente ni el almacenamiento de cuentas.
