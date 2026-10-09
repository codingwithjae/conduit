# Spec Delta

## ADDED Requirements

### Requirement: Herramientas MCP de cuotas y rotación de pool

The system SHALL registrar herramientas MCP en `conduit mcp serve` para consultar cuotas consolidadas del pool, cambiar la cuenta activa y asignar alias amigables.

#### Scenario: Consulta de estado de cuotas vía MCP
- **WHEN** un cliente MCP llama a `get_quota_status`
- **THEN** el servidor devuelve la lista de cuentas con sus ventanas de cuota (5h, 7d), porcentajes y tiempos de reinicio sin exponer tokens de autenticación

#### Scenario: Cambio de cuenta activa vía MCP
- **WHEN** un cliente MCP llama a `switch_account` con un proveedor y número o ID de cuenta válido
- **THEN** actualiza la cuenta activa en el pool de Conduit y devuelve confirmación sin exponer credenciales

#### Scenario: Asignación de alias vía MCP
- **WHEN** un cliente MCP llama a `set_account_alias` con un proveedor, número o ID de cuenta y un alias
- **THEN** persiste el alias en el almacén de Conduit con permisos 0600 y devuelve confirmación
