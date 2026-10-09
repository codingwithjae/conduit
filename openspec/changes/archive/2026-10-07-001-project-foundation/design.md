# Design

## Context

Consulta `proposal.md` para la motivación y `specs/cli-foundation/spec.md` para el contrato observable. La base ya tiene OpenSpec, una constitución y modos de agente. Este cambio crea solamente el ejecutable local y su cadena de compilación/pruebas.

## Goals / Non-Goals

**Goals:**

- Usar Node.js ESM y TypeScript estricto, con Node `>=20.19.0`.
- Mantener el punto de entrada de terminal separado del código TypeScript compilado.
- Hacer que el programa CLI sea instanciable en tests sin lanzar el proceso real.
- Mantener la arquitectura preparada para puertos y adaptadores sin crear módulos vacíos prematuramente.

**Non-Goals:**

- No añadir llamadas de red, inferencia, OAuth, gestión de cuentas, cuotas, TUI ni servidor MCP.
- No depender de Kilo, OpenCode, Codex u otra CLI anfitriona para ejecutar Conduit.
- No decidir aquí el mecanismo definitivo de publicación a npm ni un nombre de paquete público.

## Decisions

### ESM nativo con TypeScript estricto

Configurar `package.json` con `"type": "module"` y `tsconfig.json` con `module` y `moduleResolution` en `NodeNext`. Esto se alinea con Node y el ecosistema MCP, y evita mezclar CommonJS y ESM.

### CLI delgada basada en Commander

`bin/conduit.js` solo carga el módulo compilado y propaga el código de salida. `src/adapters/inbound/cli` construye y ejecuta el parser de comandos. Commander provee parsing y ayuda consistente; el resto del proyecto no depende de Commander.

La versión se obtiene desde `package.json` en tiempo de ejecución para evitar mantener una constante duplicada.

### Puertos y adaptadores por capas

- `src/domain`: tipos y reglas puras, sin dependencias de CLI, MCP o SDKs de proveedores.
- `src/application`: casos de uso y contratos/puertos que consume el dominio.
- `src/adapters/inbound/cli`: comandos de terminal; MCP será otro adaptador de entrada en un cambio posterior.
- `src/adapters/outbound`: almacenamiento, autenticación y proveedores; se añadirán cuando exista una especificación aprobada para esas capacidades.

En esta base solo se crea el adaptador CLI y el núcleo mínimo de versión. No se crean carpetas vacías para componentes todavía no implementados.

### Pruebas con Vitest y sin servicios externos

Vitest cubre la salida de ayuda/versión y errores del parser. Las pruebas invocan el programa con argumentos y streams inyectables; no contactan proveedores ni requieren tokens. `npm test` construye el CLI antes de ejecutar pruebas de integración del binario.

### Toolchain y scripts reproducibles

pnpm es el gestor recomendado y `pnpm-lock.yaml` es el lockfile canónico. No se añade `packageManager` a `package.json`: Corepack puede usarlo para impedir la ejecución de otro gestor, lo que contradice la interoperabilidad requerida. `package.json` conserva dependencias y scripts portables, sin invocar un gestor específico dentro de los scripts. npm, Yarn y Bun pueden instalar y ejecutar las mismas tareas; sus lockfiles locales no son la fuente de verdad del repositorio.

Se definen scripts independientes `build`, `typecheck` y `test`. Vitest usa Vite como dependencia de desarrollo explícita para satisfacer su peer dependency de forma consistente entre gestores. El binario se ejecuta desde `dist/`; `prepack` compila antes de empaquetar. No se usa `tsx` como dependencia de runtime.

## Risks / Trade-offs

- [El binario no funcionará antes de compilar] → documentar/validar `npm run build`; ejecutar `prepack` al crear un paquete.
- [Los gestores alternativos pueden resolver versiones distintas sin sus propios lockfiles comprometidos] → declarar pnpm como canonical, mantener scripts neutrales y validar la instalación alternativa en CI antes de anunciar soporte para un gestor.
- [Commander imprime y termina el proceso en flags de ayuda] → configurar `exitOverride` y streams de salida para que el comportamiento se pueda probar sin terminar Vitest.
- [El contrato inicial es pequeño] → mantener fuera de este cambio comandos no implementados como `account`, `quota` y `use`; cada uno recibirá su propia propuesta OpenSpec.

## Migration Plan

No hay versión previa ni datos de usuario que migrar. Crear el paquete base y validar build, tipos, tests y ejecución de los flags. Rollback: revertir los archivos de esta propuesta; no se escriben credenciales ni datos de ejecución.
