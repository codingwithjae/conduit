# Proposal

## Why

Actualmente los usuarios de Conduit pueden gestionar pools de cuentas y consultar cuotas en la terminal, pero para ejecutar inferencia están limitados a API keys de pago por uso o al servidor MCP. Para aprovechar las suscripciones de tarifa plana directamente desde la CLI y evitar interrupciones de trabajo cuando una cuenta alcanza el límite de tasa (429), Conduit necesita un motor de inferencia respaldado por las cuentas del pool con auto-failover transparente y una interfaz interactiva en Ink para la gestión de cuentas.

## What Changes

- Añadir el comando CLI `conduit use <model> <prompt>` para ejecutar inferencia utilizando por defecto la cuenta activa del pool de suscripciones, con opción de forzar API key oficial mediante `--api-key`.
- Implementar el motor de **Auto-Failover transparente ante error 429**: si la cuenta activa del pool devuelve un límite de tasa (HTTP 429), Conduit rota automáticamente a la siguiente cuenta disponible del pool y reintenta la solicitud sin interrumpir al usuario.
- Extender `conduit account` para renderizar un panel TUI interactivo completo en Ink / React cuando se invoque sin subcomandos en una terminal TTY:
  - Navegación con flechas del teclado (`↑` y `↓`).
  - Atajo `s` para activar inmediatamente la cuenta seleccionada.
  - Atajo `e` para editar interactivamente el alias.
  - Atajo `d` para eliminar una cuenta del pool con confirmación.
  - Atajo `q` para salir limpiamente.

## Goals and Non-Goals

### Goals
- Inferencia directa por CLI mediante `conduit use` con prioridad de cuentas del pool ($20/mes).
- Resiliencia y continuidad: auto-failover transparente cuando una cuenta del pool agota su cuota (429).
- Experiencia interactiva TUI moderna con Ink en `conduit account`.

### Non-Goals
- No implementar streaming de tokens ni interfaces gráficas web/desktop.
- No rotar cuentas de forma abusiva o masiva; la rotación solo actúa como mecanismo de respaldo ante 429 legítimo.
- No exponer credenciales de sesión en salidas de terminal ni herramientas MCP.

### Policy and Security Risks
- Uso de cuentas del pool: El auto-failover solo rota entre las cuentas previamente autorizadas y pertenecientes al usuario local; no realiza llamadas a orígenes no configurados.
- Preservación de secretos: Las solicitudes de inferencia se realizan mediante HTTPS directo con tokens en cabeceras de autorización y rechazo estricto de redirecciones.

## Capabilities

### New Capabilities
- `pool-inference`: Ejecución de prompts por CLI respaldada por las cuentas del pool, prioridad configurable (pool vs API key) y auto-failover transparente ante errores 429.

### Modified Capabilities
- `subscription-pools`: Extiende el comando `conduit account` con una interfaz interactiva TUI en Ink / React para navegación, activación rápida, edición de alias y eliminación de cuentas.

## Impact

- `src/domain/pool/`: Métodos de selección y rotación en `AccountPool`.
- `src/application/use-cases/`: Nuevos casos de uso `PoolInferenceUseCase` y `ManageAccountTuiUseCase`.
- `src/adapters/inbound/cli/tui/`: Nuevo componente interactivo `AccountManager.tsx` en Ink.
- `src/adapters/inbound/cli/program.ts`: Registro del comando `use` y actualización del comando base `account`.
- `tests/`: Nuevas suites de pruebas unitarias e integración para inferencia de pool, auto-failover en 429 y TUI de cuentas.
