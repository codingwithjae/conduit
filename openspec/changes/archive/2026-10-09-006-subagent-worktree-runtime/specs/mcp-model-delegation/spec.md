# Spec Delta

## ADDED Requirements

### Requirement: Despacho de subagentes en worktrees aislados vía MCP

The system SHALL registrar la herramienta `dispatch_subagent_task` en `conduit mcp serve` para que cualquier cliente supervisor despache tareas complejas a un subagente que trabaja en un Git Worktree aislado.

#### Scenario: Despacho de subagente con retorno de diff
- **WHEN** un cliente supervisor invoca `dispatch_subagent_task` con modelo, tarea y `confirmExternalSend: true`
- **THEN** Conduit ejecuta la tarea en un worktree temporal y devuelve al supervisor el `diff` de git, un resumen estructurado y la lista de archivos modificados

#### Scenario: Confirmación explícita para despacho de subagente
- **WHEN** se invoca `dispatch_subagent_task` con `confirmExternalSend` ausente o falso
- **THEN** Conduit devuelve `consent_required` y no inicializa el worktree ni contacta al modelo secundario

#### Scenario: Error controlado en el bucle del subagente
- **WHEN** el subagente no puede completar la tarea o agota sus pasos
- **THEN** devuelve el diff acumulado hasta el momento junto con el informe del estado de ejecución para que el supervisor decida los pasos a seguir
