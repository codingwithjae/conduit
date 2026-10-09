# Proposal

## Why

Los desarrolladores utilizan múltiples cuentas y planes de suscripción fija ($20/mes en ChatGPT Plus, Google Antigravity y Claude Pro) que se rigen por cuotas deslizantes de 5 horas y semanales. Conduit necesita un sistema propio y desacoplado para gestionar pools multi-cuenta, visualizar cuotas de forma interactiva en la terminal y exponer el estado y rotación de cuentas a clientes MCP como Claude Code, garantizando un almacenamiento local seguro (`chmod 0600`) e importación universal no destructiva desde herramientas existentes (Antigravity, Codex y Claude Code).

## What Changes

- Crear la entidad y almacén seguro `~/.conduit/pools.json` con permisos de sistema de archivos `0600` de forma atómica.
- Implementar el sistema de importación universal (`AccountImporter`) con detección pasiva y lectura no destructiva para:
  - Antigravity (`~/.config/opencode/antigravity-accounts.json`).
  - Codex / Kilo OpenAI (`~/.config/kilo/openai-accounts.json` y `~/.local/share/kilo/auth.json`).
  - Claude Code (`~/.config/opencode/anthropic-auth.json` y `auth.json`).
- Añadir comando CLI interactivo `conduit account import` con escaneo de fuentes y selección interactiva.
- Añadir comandos CLI `conduit account list`, `conduit account switch <provider> <target>`, y `conduit account alias <provider> <target> <alias>`.
- Implementar el dashboard TUI interactivo en Ink / React para `conduit quota` con navegación por teclado, temporizadores de reset en vivo y selección inmediata.
- Extender el servidor MCP (`conduit mcp serve`) con las herramientas `get_quota_status`, `switch_account` y `set_account_alias`.

## Goals and Non-Goals

### Goals
- Almacenamiento seguro e independiente en `~/.conduit/pools.json` con permisos `0600`.
- Importación no destructiva desde Antigravity, Codex y Claude Code sin modificar sus archivos de origen.
- Dashboard reactivo con Ink / React en `conduit quota`.
- Herramientas MCP para consulta de cuotas y rotación de cuenta activa para clientes como Claude Code.

### Non-Goals
- No alterar la configuración original de Kilo, OpenCode ni Claude Code durante la importación.
- No implementar interfaces web ni aplicaciones de escritorio en esta fase.
- No exponer credenciales, tokens ni secretos en herramientas MCP ni salidas de terminal.

### Policy and Security Risks
- Almacenamiento de tokens en disco: Se mitiga aplicando `chmod 0600` atómico en cada escritura, restringiendo el acceso exclusivamente al usuario propietario.
- Seguridad de MCP: Las herramientas `get_quota_status`, `switch_account` y `set_account_alias` manipulan únicamente metadatos (nombres, alias, cuotas y estados activos); los refresh y access tokens nunca se exponen al cliente MCP.

## Capabilities

### New Capabilities
- `subscription-pools`: Gestión de pools de cuentas por proveedor, importador universal no destructivo, almacenamiento seguro local `0600`, cálculo de cuotas deslizantes y dashboard interactivo reactivo en terminal.

### Modified Capabilities
- `mcp-model-delegation`: Expande las herramientas expuestas por `conduit mcp serve` para incluir `get_quota_status`, `switch_account` y `set_account_alias`.

## Impact

- `package.json`: Incorporación de `ink`, `react`, y `@types/react` para componentes de terminal interactivos.
- `src/domain/pool/`: Nuevas entidades de dominio para cuentas, pools y cuotas.
- `src/adapters/outbound/storage/`: Implementación de `FileAccountStore`.
- `src/adapters/outbound/importers/`: Implementación de `AntigravityImporter`, `CodexImporter` y `ClaudeCodeImporter`.
- `src/adapters/inbound/cli/tui/`: Componente reactivo `QuotaDashboard.tsx` con Ink.
- `src/adapters/inbound/mcp/server.ts`: Registro de herramientas MCP para cuotas y cambio de cuenta.
