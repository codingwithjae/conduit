# Proposal

## Why

Conduit necesita el primer caso de uso útil para cualquier CLI compatible con MCP: descubrir los modelos disponibles en una cuenta y delegarles una tarea sin instalar otra CLI de proveedor. Este cambio entrega una integración local pequeña, verificable y basada en APIs oficiales antes de ampliar autenticación o gestión de pools.

## What Changes

- Añadir `conduit mcp serve`, un servidor MCP local por `stdio`.
- Exponer `provider_status`, `list_models` y `delegate_task`; la delegación requiere confirmación explícita y envía exactamente el prompt del usuario, sin plantillas añadidas por Conduit.
- Añadir adaptadores iniciales para las APIs oficiales de OpenAI y Google Gemini mediante API keys proporcionadas por el entorno.
- Exigir confirmación explícita por cada delegación, declarar proveedor/modelo/coste potencial y no adjuntar contexto local automáticamente.
- Proteger stdout para el protocolo MCP, sanitizar errores y probar llamadas sin credenciales ni tráfico real.

## Enmienda constitucional

P5 se actualiza de la versión 1.0 a 1.1 para permitir que `delegate_task` envíe el prompt explícito del usuario al proveedor elegido y devuelva su respuesta. La motivación es habilitar delegación multi-modelo desde cualquier cliente MCP. La alternativa era conservar P5 sin cambios y excluir toda inferencia MCP. El usuario aceptó la excepción “Permitir delegación explícita” el 2026-10-07. La enmienda prohíbe adjuntar automáticamente archivos, historial, variables de entorno o credenciales, y exige confirmación por llamada, divulgar proveedor/modelo y posible facturación. No cambia el almacenamiento de credenciales ni autoriza evasión de cuotas.

## Capabilities

### New Capabilities

- `mcp-model-delegation`: servidor MCP stdio, catálogo dinámico, estado de proveedores y delegación de texto a OpenAI/Gemini.

### Modified Capabilities

Ninguna.

## Impact

- Añade el adaptador MCP y adaptadores HTTP para OpenAI y Gemini.
- Añade el SDK oficial de MCP y Zod; los adapters usan `fetch` para los endpoints oficiales de proveedores.
- Añade la configuración de `conduit mcp serve` y variables de entorno para API keys.
- No altera autenticación nativa de Claude Code ni requiere Kilo, Codex u otra CLI anfitriona.
