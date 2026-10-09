# Spec Delta

## Purpose

Proveer un entorno de ejecución autónomo para subagentes con aislamiento estricto en Git Worktrees temporales, bucle de herramientas de desarrollo acotado y retorno de diff estructurado al agente supervisor.

## ADDED Requirements

### Requirement: Aislamiento físico de ejecución en Git Worktrees

The system SHALL crear un Git Worktree temporal en `.conduit/worktrees/<task-id>` sobre una rama dedicada `conduit/task-<task-id>` para la ejecución de cada tarea de subagente, garantizando aislamiento total del árbol de trabajo principal.

#### Scenario: Creación de worktree temporal en rama dedicada
- **WHEN** se inicia una tarea de subagente
- **THEN** Conduit crea la rama temporal y añade el worktree aislado en `.conduit/worktrees/<task-id>` a partir de la rama base del repositorio

#### Scenario: Extracción de git diff y limpieza automática
- **WHEN** el subagente completa la tarea o agota sus pasos
- **THEN** Conduit genera el `git diff` de los cambios realizados contra la rama base y elimina el directorio del worktree y su registro de git

#### Scenario: Preservación del repositorio principal sin colisiones
- **WHEN** un subagente edita archivos o ejecuta comandos dentro de su worktree
- **THEN** los archivos del directorio de trabajo principal del supervisor permanecen intactos y sin modificaciones concurrentes

### Requirement: Bucle agéntico acotado con herramientas de desarrollo

The system SHALL ejecutar un bucle iterativo de herramientas (*Agentic Tool Loop*) para el subagente acotado a un límite configurable de pasos (15 por defecto).

#### Scenario: Ejecución de herramientas locales confinadas al worktree
- **WHEN** el subagente invoca herramientas de lectura, edición o comandos de consola
- **THEN** las operaciones de escritura y la ejecución de comandos se realizan con el directorio de trabajo (`cwd`) fijado al worktree asignado

#### Scenario: Acceso de solo lectura a skills y documentación
- **WHEN** el subagente consulta skills o archivos de contexto del proyecto
- **THEN** Conduit permite la lectura de las instrucciones sin otorgar permisos de modificación sobre dichos archivos

#### Scenario: Guardarraíl de pasos máximos (15 por defecto)
- **WHEN** el subagente alcanza el número máximo de pasos permitidos (15 por defecto o el valor especificado por el supervisor)
- **THEN** Conduit finaliza el bucle agéntico de forma ordenada, genera el diff acumulado hasta ese punto y lo devuelve al supervisor

#### Scenario: Bloqueo de escrituras fuera del worktree
- **WHEN** un subagente intenta escribir o editar una ruta fuera del directorio `.conduit/worktrees/<task-id>`
- **THEN** Conduit bloquea la operación y devuelve un error de violación de confinamiento sin tocar el archivo

### Requirement: Auto-failover continuo durante el bucle de herramientas

The system SHALL mantener y propagar el historial de conversación y herramientas acumulado durante el bucle si una cuenta del pool devuelve error HTTP 429, rotando a la siguiente cuenta disponible sin reiniciar la tarea.

#### Scenario: Rotación de cuenta en caliente ante 429 durante el bucle
- **WHEN** la llamada al modelo en el paso N del bucle devuelve error 429 y existen otras cuentas disponibles en el pool
- **THEN** Conduit rota la cuenta activa, reenvía el historial de mensajes acumulado hasta el paso N y continúa el bucle con la nueva cuenta

#### Scenario: Preservación del historial de herramientas al rotar
- **WHEN** se produce una rotación de cuenta durante el bucle agéntico
- **THEN** la nueva cuenta recibe todos los resultados de herramientas y turnos previos generados en los pasos anteriores
