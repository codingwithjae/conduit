# Design

## Context

Consulta `proposal.md` para la motivación y los archivos en `specs/` para los contratos observables. Conduit actualmente soporta ejecución CLI y servidor MCP para 7 proveedores con API keys. Este cambio implementa la gestión de pools multi-cuenta de suscripción, importación universal y visualización TUI reactiva.

## Goals / Non-Goals

**Goals:**
- Implementar entidades de dominio en `src/domain/pool/` para `Account`, `AccountPool` y `QuotaWindow`.
- Implementar el puerto `AccountStorePort` y el adaptador `FileAccountStore` con guardado atómico y permisos `0600`.
- Implementar adaptadores de importación pasiva (`AntigravityImporter`, `CodexImporter`, `ClaudeCodeImporter`).
- Implementar el componente interactivo en terminal con Ink / React para `conduit quota`.
- Exponer `get_quota_status`, `switch_account` y `set_account_alias` en el servidor MCP.

**Non-Goals:**
- No implementar rotación automática oculta ni evasión de cuotas en este cambio.
- No modificar ni escribir en las carpetas originales de Kilo, OpenCode o Claude Code.
- No añadir interfaces web ni dependencias de navegadores pesados.

## Decisions

### 1. Almacenamiento seguro en `~/.conduit/pools.json`
El archivo se guarda en la carpeta del usuario `~/.conduit/pools.json`:
- Escritura atómica: se escribe un archivo temporal `.tmp`, se le aplica `chmod 0600`, y se renombra atómicamente con `rename`.
- Restricción estricta de permisos: únicamente el usuario actual del sistema operativo tiene permisos de lectura y escritura.

Estructura de datos:
```typescript
interface StoredPools {
  version: 1
  updatedAt: string
  pools: {
    google: { activeIndex: number; accounts: StoredAccount[] }
    openai: { activeIndex: number; accounts: StoredAccount[] }
    anthropic: { activeIndex: number; accounts: StoredAccount[] }
  }
}
```

### 2. Motor de Importación Universal No Destructivo
El adaptador `AccountImporter` sigue el patrón Estrategia:
- Cada importador (`AntigravityImporter`, `CodexImporter`, `ClaudeCodeImporter`) verifica si existen sus rutas habituales en `~/.config/` o `~/.local/`.
- Lee los archivos exclusivamente en modo lectura con `fs.readFile`.
- Normaliza los campos heterogéneos (correos, refresh tokens, etiquetas) a la entidad `Account`.
- Si se detecta una cuenta ya existente en el pool de Conduit, actualiza los tokens sin duplicar la entrada.

### 3. TUI Reactivo con Ink (`conduit quota`)
Se utiliza **Ink** con React para terminal:
- Renderiza una caja estructurada con bordes redondeados y colores ANSI.
- Muestra barras de progreso calculadas dinámicamente (`████████░░`).
- Un hook de efecto (`useEffect`) con temporizador de 1 segundo descuenta los segundos en vivo de las ventanas de reset sin redibujo completo de la consola.
- Si `process.stdout.isTTY` es falso (ej. tuberías o CI), el comando emite un reporte estático en texto plano y termina inmediatamente.

### 4. Herramientas MCP
En `conduit mcp serve`:
- `get_quota_status`: Devuelve el snapshot estructurado de cuotas y cuentas del pool.
- `switch_account`: Recibe `provider` y `accountNumber` o `id`, actualiza `activeIndex` y persiste en disco.
- `set_account_alias`: Recibe `provider`, `accountNumber` o `id` y `alias`, actualizando el nombre visible.
Ninguna herramienta MCP expone ni acepta tokens de sesión.

## Risks / Trade-offs

- **[Entornos no TTY o tuberías]** → Si `process.stdout.isTTY` es falso, Ink se omite y se imprime el resumen en texto plano para no romper pipes de bash.
- **[Archivos externos ausentes o corruptos]** → Cada importador maneja `ENOENT` y errores de parseo de forma silenciosa e independiente, informando al usuario qué fuentes están disponibles.
- **[Compatibilidad de React y NodeNext]** → Se integran `ink` y `react` como dependencias ESM directas, manteniendo `moduleResolution: NodeNext`.

## Migration Plan

No hay migración destructiva. Si el usuario ya tenía cuentas en Kilo/OpenCode, puede ejecutar `conduit account import` para incorporarlas inmediatamente. Para rollback, basta con eliminar `~/.conduit/pools.json`.
