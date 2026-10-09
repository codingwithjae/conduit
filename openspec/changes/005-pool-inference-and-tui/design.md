# Design

## Context

Consulta `proposal.md` para la motivación y los archivos en `specs/` para los contratos observables. Conduit cuenta con la base CLI, adaptadores de proveedores oficiales, servidor MCP dual-era y pools de suscripciones persistidos con permisos `0600`. Este cambio implementa el motor de inferencia respaldado por suscripciones (`conduit use`), la resiliencia mediante auto-failover transparente ante errores 429 y el panel TUI interactivo `AccountManager` en Ink para `conduit account`.

## Goals / Non-Goals

**Goals:**
- Implementar el caso de uso `PoolInferenceUseCase` que ejecute prompts usando la cuenta activa del pool.
- Implementar el mecanismo de auto-failover transparente ante error 429, rotando a la siguiente cuenta y reintentando sin interrupción.
- Permitir forzar el uso de API key oficial con el flag `--api-key`.
- Implementar el componente reactivo `AccountManager.tsx` en Ink para administrar cuentas interactivamente en la terminal.

**Non-Goals:**
- No implementar streaming de respuestas ni interfaces gráficas.
- No rotar cuentas de forma preventiva; la rotación automática solo se activa ante respuesta HTTP 429 real.
- No exponer tokens ni secretos en logs o salidas de terminal.

## Decisions

### 1. Algoritmo de Auto-Failover Transparente ante 429
En `PoolInferenceUseCase`:
- Se inicia la llamada con la cuenta activa del pool (`pool.accounts[pool.activeIndex]`).
- Se mantiene un conjunto `attemptedAccountIds` con las cuentas probadas en la solicitud para evitar bucles infinitos.
- Si el proveedor devuelve un error HTTP 429 (`rate_limited`):
  1. Se añade la cuenta actual a `attemptedAccountIds`.
  2. Se busca la siguiente cuenta en el pool que no esté en `attemptedAccountIds`.
  3. Si existe una cuenta alternativa disponible, se actualiza `pool.activeIndex` en disco (persistencia `0600`) y se reintenta inmediatamente.
  4. Si todas las cuentas del pool han sido intentadas y fallan con 429, se lanza `ConduitError("rate_limited", "Todas las cuentas disponibles en el pool de <proveedor> han alcanzado su límite de cuota.")`.

### 2. Prioridad de Inferencia en `conduit use`
- Por defecto, `conduit use <model> <prompt>` verifica si el pool del proveedor tiene cuentas registradas:
  - Si existen cuentas en el pool, utiliza la cuenta activa mediante sesión OAuth (ChatGPT Plus para OpenAI, Google Antigravity para Google).
  - Si no existen cuentas en el pool, recurre automáticamente a la API key oficial configurada en el entorno.
  - Si se pasa el flag explícito `--api-key`, omite el pool y utiliza la API key oficial directamente.

### 3. Componente TUI Interactivo `AccountManager.tsx` en Ink
Al invocar `conduit account` en una terminal TTY:
- Renderiza el árbol de cuentas agrupado por proveedor.
- Muestra cursor visual de navegación con flechas `↑`/`↓`.
- Tecla `s`: Activa inmediatamente la cuenta seleccionada y actualiza `activeIndex` en el almacén.
- Tecla `e`: Abre un campo de edición en línea para modificar el alias de la cuenta.
- Tecla `d`: Elimina la cuenta seleccionada tras confirmación con `y/n`.
- Tecla `q`: Cierra limpiamente la interfaz.
- Si `process.stdout.isTTY` es falso, ejecuta el listado en texto plano (`conduit account list`).

## Risks / Trade-offs

- **[Bucles en auto-failover]** → Se limita el reintento mediante `attemptedAccountIds.size <= pool.accounts.length`, garantizando que cada cuenta se intente como máximo una vez por petición.
- **[Entornos sin terminal interactiva]** → Detección automática con `process.stdout.isTTY` que redirige a `conduit account list` plano en tuberías de bash y CI.
- **[Expiración de tokens durante la llamada]** → `PoolInferenceUseCase` verifica `expiresAt` antes de realizar la llamada y renueva el token mediante `refresh_token` si quedan menos de 60 segundos.

## Migration Plan

100% retrocompatible. No se alteran las estructuras existentes de `~/.conduit/pools.json`. Los comandos previos (`account list`, `account switch`, `account alias`, `account import`, `quota`) siguen funcionando sin cambios.
