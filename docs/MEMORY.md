# Memoria y reanudación

La continuidad normal es local. `AGENTS.md` fija reglas; `docs/PLAN.md` y documentos de feature conservan decisiones, requisitos y pendientes; `MEMORY.md` resume la actividad para reanudar; `harness/.local/` guarda run, ownership, journal, cola, recibos y métricas; Git conserva versiones y evidencia. Supermemory v5 es un piloto optativo, separado de la fuente de verdad del proyecto. La memoria global entre proyectos está pospuesta.

## Cache local

`MEMORY.md` es JSON estructurado, ignorado por Git. `MEMORY.template.md` es su plantilla versionada. Se conservan cinco fechas locales distintas con actividad real, sin vencimiento por pausa y con hasta cinco puntos breves por fecha. Cada punto guarda timestamp UTC, `session_id`, `agent_id`, projectId, worktree, rama, commit y referencia duradera. La zona horaria se toma del manifiesto o de `America/Argentina/Buenos_Aires`.

El compositor cuenta cache y recuerdos remotos aceptados en **un solo bloque** de 150 líneas y 8192 bytes UTF-8, con títulos y metadata. Omite puntos completos cuando no caben. Leer, renderizar, consultar Supermemory o limpiar la cache no genera actividad. La escritura usa un lock por worktree, lectura fresca y reemplazo atómico. La limpieza y compactación abortan cuando no se puede comprobar la fuente duradera de una entrada retirada.

```powershell
node .agents/harness/bin/harness.mjs memory-render --project .
node .agents/harness/bin/harness.mjs memory-record --project . --kind progress --text "Resumen que ya consta en docs/PLAN.md" --ref docs/PLAN.md --session-id ID --agent-id coordinator
node .agents/harness/bin/harness.mjs memory-clear --project .
```

Al reanudar, cargar una sola vez con `memory-render`, contrastar referencias con Git y disco, y marcar lo no verificable. `memory-recall` sin `--pilot` también entrega solo contexto local. No abrir `MEMORY.md` manualmente ni importarlo desde memoria nativa. Un documento duradero compartido exige ownership del checkout; el lock de la cache no protege `docs/PLAN.md`.

## Checkpoints

`checkpoint` guarda un journal antes de añadir el evento a la cola y actualizar `state.json`. Una interrupción deja el journal y la evidencia para `checkpoint --recover` con el mismo run/token. La recuperación reutiliza ID, timestamp, snapshot y payload congelados. Un checkpoint nuevo, aunque repita fase y próximo paso, recibe otra identidad. Los eventos inconclusos se muestran como tales en `runs` y `memory-status`, y no se exportan. No recuperar locks por antigüedad ni cerrar un run con journal pendiente.

Cada check nuevo conserva el snapshot de código y aceptación de su registro. `runs --verify` lo marca `current`, `stale` o `unverified`. Un resultado pasado por flags es `caller-reported`; la identidad de un reviewer pasada por flags tampoco prueba independencia.

## Piloto Supermemory

La mera presencia de `SUPERMEMORY_API_KEY` no genera llamadas. Usar `memory-publish --pilot --text ... --ref ... --session-id ...` para preparar un resumen explícito con fuente que contenga el texto. Luego usar `memory-sync --pilot --event ID` para ese único evento; no se exporta la cola completa. `memory-recall --pilot` busca en el namespace del proyecto y el compositor solo incluye recuerdos con `metadata.projectId` coincidente. Origen ausente, ajeno o contradictorio queda fuera del contexto. Se conservan ID, namespace, proyecto de origen y referencias.

Para `memory-render --supermemory-stdin`, cada recuerdo externo debe traer `id`, `namespace` y `projectId` original (directo o en `metadata`). Si falta uno, se omite del contexto como origen desconocido. Los resultados del adaptador llevan el namespace de la consulta y el ID devuelto por la API; nunca se asigna `projectId` del manifiesto a un resultado sin origen.

El destino queda fijo en evento, intento y recibo. Un evento legacy sin destino requiere `--namespace` explícito; un intento anterior incompatible bloquea el cambio. Un POST incierto no se repite ciegamente: se consulta por ID y se reconcilia si el contenido coincide. Los códigos 402 y 429 dejan pendiente el evento; `Retry-After` se respeta. Se usan hasta tres intentos solo para consultas transitorias seguras. La cola, los recibos y las métricas están fuera de Git.

`memory-status` informa desactivado, pendiente, aceptado, incierto o reconciliado sin red. `memory-processing --pilot --event ID --wait-seconds 300` consulta procesamiento y extracción con un deadline; después busca el recuerdo y solo marca `recoverable` si encuentra su projectId y eventId originales. Si vence el plazo queda pendiente. La API distingue aceptación del documento, `system.status`, `system.dreamingStatus` y resultados de búsqueda. [Documentos](https://supermemory.ai/docs/ingestion/document-operations).

## Consumo

`memory-usage --days 7 --project-days 30` suma llamadas observadas de los agentes y worktrees accesibles del proyecto; proyecta con tasa diaria constante. Registra timestamps, bytes, errores, reintentos, consultas, escrituras y última operación exitosa, sin claves ni payloads. Las consultas HTTP y los bytes no equivalen a operaciones o SM tokens facturados. La estimación de búsqueda usa la tarifa pública; ingestión y total quedan indeterminados sin contadores oficiales. Otros proyectos/clientes pueden compartir los créditos de la cuenta y no figurar en el registro local. Comparar manualmente con la facturación real del proveedor cuando esté disponible. No crear tareas programadas, no comprar planes ni activar recargas. [Facturación oficial](https://supermemory.ai/docs/overview/billing).

Para una comparación local, copiar manualmente del panel o de `GET /v3/auth/billing/usage` los valores oficiales a `harness/.local/official-usage.json` con `observedAtUtc`, `periodStartUtc`, `periodEndUtc`, `searchQueries` y `creditsBalanceUsd`; usar `memory-usage --official-file harness/.local/official-usage.json`. El archivo debe contener solo esos números y fechas, no la respuesta completa ni correo o datos de la organización. Esta interfaz oficial exige permisos de administrador o propietario; una clave limitada puede recibir 403. Los períodos y ámbitos distintos se presentan juntos, sin restarlos como si midieran el mismo proyecto.

El piloto remoto real requiere credencial, conectividad y un resumen inocuo con fuente comprobable. La suite automática usa mocks. Una lectura desde otro proceso CLI prueba persistencia local entre procesos; una sesión nueva de agente requiere evidencia separada del runtime.
