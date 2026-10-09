# Proposal

## Why

Cuando un agente supervisor (Claude Code, Codex CLI, Antigravity CLI, OpenCode, Kilo) ejecuta tareas complejas de refactorización o corrección de código, se enfrenta a dos problemas graves: saturación rápida de su ventana de contexto y riesgo de colisiones destructivas si otro modelo modifica los archivos del repositorio en paralelo. Conduit necesita proporcionar un entorno de ejecución autónomo para subagentes (*Subagent Runtime*) que aísle el trabajo en un Git Worktree temporal, ejecute un bucle agéntico con herramientas de desarrollo (lectura, edición y comandos de test en su carpeta) y devuelva un `git diff` limpio para que el supervisor o el usuario decidan si fusionarlo.

## What Changes

- Implementar `GitWorktreeManager` para aprovisionar ramas temporales (`conduit/task-<id>`) y directorios aislados en `.conduit/worktrees/<id>`, extraer el diff final y limpiar directorios de trabajo al finalizar.
- Implementar `SubagentToolLoop`: un motor agéntico que ejecuta iteraciones de razonamiento y herramientas (por defecto máximo 15 pasos) para modelos secundarios (OpenAI, Google, DeepSeek, etc.).
- Proveer herramientas de sandbox al subagente estrictamente acotadas a su worktree:
  - Lectura de archivos e inspección de repositorio y skills (solo lectura).
  - Escritura y edición de archivos confinadas exclusivamente dentro de la ruta del worktree.
  - Ejecución de comandos de consola (`run_command`) ejecutados con directorio de trabajo (`cwd`) fijado al worktree.
- Auto-failover en bucle: si durante cualquiera de los pasos del bucle una cuenta de suscripción devuelve HTTP 429, el runtime rota a la siguiente cuenta del pool sin perder el historial de herramientas acumulado.
- Extender el servidor MCP (`conduit mcp serve`) con la herramienta `dispatch_subagent_task` y añadir el comando CLI `conduit dispatch <model> <task>`.

## Goals and Non-Goals

### Goals
- Aislamiento físico de código mediante Git Worktrees para garantizar cero colisiones con el espacio de trabajo del supervisor.
- Bucle de herramientas autónomo (lectura, edición y tests) con guardarraíl estricto de pasos (máximo 15 por defecto).
- Soporte para cualquier agente supervisor mediante la herramienta MCP `dispatch_subagent_task`.
- Retorno transparente de `git diff`, resumen y lista de archivos modificados.

### Non-Goals
- No fusionar (*merge*) automáticamente los cambios en la rama principal del usuario; la decisión de aplicar o descartar el diff pertenece exclusivamente al supervisor o al usuario.
- No permitir que el subagente escriba fuera del directorio asignado a su worktree.
- No añadir interfaces web ni requerir extensiones de IDE.

### Policy and Security Risks
- Ejecución de comandos: `run_command` se ejecuta dentro del directorio del worktree y con timeout estricto.
- Aislamiento de rutas: Las herramientas de escritura y edición validan que las rutas resueltas residan dentro de `.conduit/worktrees/<task-id>` antes de tocar el disco.

## Capabilities

### New Capabilities
- `subagent-runtime`: Aprovisionamiento de Git Worktrees aislados, bucle agéntico acotado con herramientas de desarrollo, auto-failover en caliente durante el bucle y generación de diffs estructurados.

### Modified Capabilities
- `mcp-model-delegation`: Registra la herramienta `dispatch_subagent_task` en `conduit mcp serve`.

## Impact

- `src/domain/worktree/`: Entidades de dominio para Worktrees y tareas agénticas.
- `src/application/use-cases/`: Nuevos casos de uso `SubagentRuntimeUseCase` y `GitWorktreeManager`.
- `src/adapters/outbound/git/`: Adaptador de comandos git para gestión de ramas y worktrees.
- `src/adapters/inbound/mcp/server.ts`: Registro de `dispatch_subagent_task`.
- `src/adapters/inbound/cli/program.ts`: Nuevo comando `conduit dispatch`.
- `tests/`: Suites de pruebas para worktrees, bucle agéntico, confinamiento de rutas y herramienta MCP.
