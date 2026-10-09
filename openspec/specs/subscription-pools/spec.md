# subscription-pools Specification

## Purpose
Gestionar pools multi-cuenta de suscripción con almacenamiento local seguro en modo 0600, importación universal no destructiva y dashboard interactivo reactivo en terminal.

## Requirements

### Requirement: Almacén local seguro de cuentas

The system SHALL almacenar y persistir los pools de cuentas en el archivo local `~/.conduit/pools.json` aplicando permisos de sistema de archivos `0600` de forma atómica en cada guardado, incluyendo el snapshot de cuotas de cada cuenta.

#### Scenario: Guardado atómico con permisos 0600
- **WHEN** Conduit crea o actualiza el archivo de pools
- **THEN** escribe los datos mediante archivo temporal y reemplazo atómico, asegurando que los permisos queden estrictamente en `0600` (`rw-------`)

#### Scenario: Lectura de cuentas persistidas
- **WHEN** Conduit inicia o carga el estado de cuentas
- **THEN** lee `~/.conduit/pools.json` y valida su estructura sin filtrar tokens o secretos a la salida estándar

### Requirement: Importador universal no destructivo

The system SHALL proporcionar un motor de importación que descubra cuentas locales existentes en Antigravity, Codex y Claude Code mediante lectura de solo lectura estricta sin alterar los archivos de origen y capturando los snapshots de cuota disponibles.

#### Scenario: Descubrimiento de cuentas desde Antigravity
- **WHEN** el usuario ejecuta el comando de importación y existe `~/.config/opencode/antigravity-accounts.json`
- **THEN** Conduit detecta y lee las cuentas de Google Antigravity extrayendo correos, etiquetas, refresh tokens y el árbol `cachedQuota` de Gemini y Non-Gemini

#### Scenario: Descubrimiento de cuentas desde Codex y Kilo OpenAI
- **WHEN** existen archivos de cuentas de OpenAI en `~/.config/kilo/openai-accounts.json` o `~/.local/share/kilo/auth.json`
- **THEN** Conduit detecta y lee las cuentas de OpenAI extrayendo correos, planes y tokens de sesión

#### Scenario: Descubrimiento de cuentas desde Claude Code
- **WHEN** existen archivos de autenticación en `~/.config/opencode/anthropic-auth.json` o `auth.json`
- **THEN** Conduit detecta y lee las sesiones de Claude Pro/Max extrayendo tokens y cuotas cacheadas en `anthropic-auth-state.json`

#### Scenario: Importación selectiva e interactiva
- **WHEN** el usuario ejecuta `conduit account import`
- **THEN** el sistema presenta un asistente interactivo con las fuentes detectadas permitiendo confirmar la importación

#### Scenario: Deduplicación de cuentas existentes
- **WHEN** se importa una cuenta que ya existe en el almacén de Conduit
- **THEN** actualiza los tokens y cuotas correspondientes sin duplicar la entrada en el pool

#### Scenario: Origen de solo lectura estricta
- **WHEN** el importador lee cualquiera de las configuraciones externas
- **THEN** abre los archivos en modo exclusivo de lectura y no modifica ni elimina los archivos originales

### Requirement: Gestión de pool y cuenta activa

The system SHALL proporcionar comandos de terminal y una interfaz interactiva TUI para listar cuentas, cambiar la cuenta activa, asignar alias amigables y administrar cuentas del pool.

#### Scenario: Listar cuentas sin exponer tokens
- **WHEN** el usuario ejecuta `conduit account list`
- **THEN** muestra proveedor, índice, correo o alias, plan detectado y estado activo, sin imprimir jamás tokens de acceso o refresh

#### Scenario: Cambio de cuenta activa por índice o alias
- **WHEN** el usuario ejecuta `conduit account switch <provider> <target>`
- **THEN** actualiza el puntero de cuenta activa para ese proveedor y guarda el cambio con permisos `0600`

#### Scenario: Asignación y limpieza de alias
- **WHEN** el usuario ejecuta `conduit account alias <provider> <target> <alias>`
- **THEN** asocia el alias amigable a la cuenta o lo elimina si se especifica `clear`

#### Scenario: Panel interactivo AccountManager con Ink en terminal TTY
- **WHEN** el usuario ejecuta `conduit account` sin subcomandos en una terminal interactiva
- **THEN** renderiza un componente TUI en Ink que permite navegar con flechas, activar con 's', editar alias con 'e', eliminar con 'd' y salir con 'q'

### Requirement: Dashboard interactivo de cuotas en terminal

The system SHALL renderizar un dashboard TUI interactivo en vivo con Ink / React al ejecutar `conduit quota` con soporte para snapshots locales rápidos y refresco bajo demanda.

#### Scenario: Presentación de cuotas reactiva con Ink
- **WHEN** el usuario ejecuta `conduit quota` en una terminal interactiva
- **THEN** renderiza un componente React en terminal con barras visuales de cuota, porcentajes disponibles y cuentas del pool a partir del snapshot local en menos de 50ms

#### Scenario: Desglose exhaustivo de 4 líneas para Google Antigravity
- **WHEN** se visualiza una cuenta de Google Antigravity en el dashboard
- **THEN** muestra las 4 ventanas de cuota reales: Gemini/5h, Gemini/Wk, Non-Gem/5h y Non-Gem/Wk con sus porcentajes y tiempos relativos de reset

#### Scenario: Refresco de cuotas bajo demanda
- **WHEN** el usuario presiona la tecla 'r' en la TUI o ejecuta `conduit quota --refresh`
- **THEN** consulta las fuentes/APIs en vivo, actualiza los snapshots en `~/.conduit/pools.json` y refresca la vista inmediatamente

#### Scenario: Temporizador en vivo de reinicio de cuotas
- **WHEN** el dashboard de cuotas está activo en pantalla
- **THEN** actualiza los segundos restantes en vivo sin parpadeo de pantalla

#### Scenario: Navegación y activación mediante teclado
- **WHEN** el usuario navega con las flechas del teclado y presiona Enter sobre una cuenta
- **THEN** cambia inmediatamente la cuenta activa del pool y actualiza el indicador visual en tiempo real
