# Proposal

## Why

Conduit necesita una base ejecutable pequeña y verificable antes de incorporar autenticación, proveedores o MCP. Sin un contrato de CLI, compilación reproducible y pruebas iniciales, las siguientes decisiones de arquitectura quedarían mezcladas con detalles de infraestructura y serían difíciles de validar.

## What Changes

- Crear un paquete Node.js ESM con TypeScript estricto y un binario local llamado `conduit`.
- Usar pnpm como gestor canónico del proyecto, manteniendo `package.json` y scripts estándar compatibles con npm, Yarn y Bun.
- Implementar únicamente `--help`, `--version` y el manejo de comandos desconocidos.
- Añadir Vitest y verificaciones de compilación/tipos.
- Establecer una estructura inicial hexagonal con capas CLI, aplicación, dominio y puertos/adaptadores, sin añadir todavía proveedores reales.

## Capabilities

### New Capabilities

- `cli-foundation`: contrato de ejecución, ayuda, versión, errores básicos y verificaciones del proyecto Conduit.

### Modified Capabilities

Ninguna.

## Impact

- Añade `package.json`, configuración TypeScript y Vitest, `bin/`, `src/` y `tests/`.
- Añade las dependencias de desarrollo y ejecución necesarias para el scaffold.
- No modifica los adaptadores generados por OpenSpec ni implementa OAuth, almacenamiento de credenciales, cuotas, TUI o MCP.
