# Spec Delta

## Purpose

Ejecutar prompts de inferencia directamente desde la CLI mediante cuentas del pool de suscripciones, con prioridad configurable y auto-failover transparente ante límites de cuota (429).

## ADDED Requirements

### Requirement: Inferencia respaldada por el pool de suscripciones

The system SHALL proporcionar el comando `conduit use <model> <prompt>` para ejecutar inferencia priorizando la cuenta activa del pool de suscripciones del proveedor correspondiente.

#### Scenario: Inferencia por defecto con cuenta activa del pool
- **WHEN** el usuario ejecuta `conduit use <model> <prompt>` y existe una cuenta activa en el pool para ese proveedor
- **THEN** Conduit ejecuta la inferencia utilizando los tokens de sesión de esa cuenta y muestra la respuesta en consola

#### Scenario: Forzar uso de API key oficial con flag
- **WHEN** el usuario ejecuta `conduit use <model> <prompt> --api-key`
- **THEN** Conduit omite la cuenta del pool y delega la llamada a la API key oficial configurada en las variables de entorno

#### Scenario: Sin cuentas en pool ni API key
- **WHEN** no existen cuentas en el pool para ese proveedor ni API key en el entorno
- **THEN** Conduit interrumpe la ejecución con un error descriptivo sugiriendo importar cuentas con `conduit account import`

### Requirement: Auto-failover transparente ante errores 429

The system SHALL interceptar respuestas HTTP 429 en la cuenta activa del pool, rotar automáticamente a la siguiente cuenta disponible del pool para ese proveedor y reintentar la solicitud sin interrumpir la operación.

#### Scenario: Rotación y reintento automático ante límite de tasa
- **WHEN** la cuenta activa de un proveedor devuelve error 429 durante la ejecución de `conduit use` y existen otras cuentas en el pool
- **THEN** Conduit marca la cuenta como agotada, rota a la siguiente cuenta disponible, reintenta la solicitud con éxito e informa qué cuenta completó la respuesta

#### Scenario: Agotamiento de todas las cuentas del pool
- **WHEN** todas las cuentas del pool para ese proveedor devuelven error 429
- **THEN** Conduit devuelve un error `rate_limited` indicando que todas las cuentas del pool alcanzaron su límite de cuota

#### Scenario: Actualización persistente de la cuenta activa
- **WHEN** el auto-failover rota con éxito a una nueva cuenta
- **THEN** actualiza el puntero de cuenta activa en `~/.conduit/pools.json` con permisos `0600`
