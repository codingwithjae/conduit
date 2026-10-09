# Spec Delta

## MODIFIED Requirements

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
