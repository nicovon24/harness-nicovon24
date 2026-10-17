# Memoria del harness

## Memoria nativa y cache propia

Claude Code carga sus propios CLAUDE.md según sus reglas; Codex puede usar AGENTS.md. Esas instrucciones no son la cache de trabajo. El harness solo incorpora la cache cuando el flujo llama memory-recall o memory-render; no se importa MEMORY.md desde CLAUDE.md, para evitar duplicados. En este checkout no hay CLAUDE.md, hooks de memoria ni credencial de Supermemory. checkpoint crea eventos locales pendientes en harness/.local/memory-queue/; memory-sync puede transmitirlos mediante la API v5.

## Política efectiva

- Cinco fechas locales distintas como máximo, seleccionadas por actividad sustantiva registrada explícitamente. Una pausa de semanas o meses no elimina días activos.
- 150 líneas y 8192 bytes UTF-8 como límites simultáneos del contexto completo; se cuentan encabezados, metadata, referencias, títulos, separadores, cache local y resultados remotos.
- Hasta cinco puntos breves por día; zona configurada por timeZone en harness/project.json, o America/Argentina/Buenos_Aires.
- Cada punto guarda timestampUtc ISO UTC y la fecha de actividad local. Leer, cargar, abrir sesión, consultar proveedor, resumir y limpiar no agregan actividad.
- Primero se conserva reanudación, bloqueos, estado verificado, decisiones/pendientes y actividad reciente. Se agregan puntos completos; no se truncan textos. El compositor omite elementos completos de menor prioridad cuando el bloque global no cabe.
- Referencias de repo/worktree, rama y commit acompañan los puntos. Al reanudar se contrastan con Git y disco.

Los valores son topes fijos en src/memory.mjs y se exponen como defaults en config/defaults.json; no hay overrides que permitan ampliarlos.

## Uso

Desde el inicio del proyecto:

    node .agents/harness/bin/harness.mjs memory-recall --project .

El comando consulta Supermemory bajo el namespace `memory.namespace` o `projectId` cuando `SUPERMEMORY_API_KEY` está configurada. Si falta o falla la consulta, entrega solo la cache local e informa el estado por stderr. Nunca cargar el resultado remoto por otra vía. Si otro conector ya entrega recuerdos del mismo projectId, usar el compositor local sin duplicar la consulta:

    Get-Content -Raw recuerdos.json | node .agents/harness/bin/harness.mjs memory-render --project . --supermemory-stdin

Al guardar una actividad relevante, registrar primero el pendiente o decisión completo en su documento duradero, luego usar:

    node .agents/harness/bin/harness.mjs memory-record --project . --kind progress --text "Resumen breve" --ref docs/PLAN.md --session-id ID --agent-id coordinator

--ref debe existir; para vaciar la cache, su archivo debe contener el resumen registrado, o debe ser una referencia Git verificable. memory-clear aborta si alguna entrada no tiene fuente duradera comprobable. No se debe editar MEMORY.md manualmente ni reescribirlo desde un snapshot viejo. El comando toma un bloqueo compartido por worktree, vuelve a leer bajo el bloqueo y renombra un temporal atómicamente. Espera escritores concurrentes hasta 10 segundos; un bloqueo abandonado requiere revisión manual, no recuperación automática por antigüedad.

Los checkpoints guardan eventos locales con ID estable. Para transmitirlos explícitamente:

    node .agents/harness/bin/harness.mjs memory-sync --project .

La API v5 usa un namespace por proyecto. Antes de reenviar, el adaptador consulta el documento por ID; si ya existe y contiene el identificador del evento, guarda un recibo local y evita añadirlo otra vez. Antes del primer POST guarda un intento local. Si el resultado de ese POST es incierto y la consulta posterior no encuentra el documento, bloquea el reenvío automático para evitar duplicados: revisar el evento y el servicio antes de resolverlo manualmente. Si no hay respuesta confirmada o falla el recibo, la cola permanece. No borra eventos ni registra sincronización por una respuesta incierta. Intentos, recibos y cola se guardan bajo `harness/.local/`. La búsqueda y escritura reales con credenciales todavía requieren un piloto: las pruebas actuales usan respuestas HTTP simuladas. Supermemory procesa documentos de manera asíncrona, así que aceptación de escritura no equivale a recuerdo recuperable.

Los documentos duraderos compartidos, como docs/PLAN.md, deben cambiarse con el ownership de checkout/feature establecido por begin; el bloqueo de memoria no protege esos documentos. Los registros se separan por projectId, ruta worktree, session_id y agent_id. No se conservan transcripciones, secretos ni datos privados.

## Formato y reconstrucción

MEMORY.md es JSON estructurado local, ignorado por Git. MEMORY.template.md es la plantilla pública vacía. Borrar MEMORY.md no debe borrar pendientes/decisiones: esos registros deben permanecer en docs/PLAN.md o fuentes duraderas. La cache puede reconstruirse desde esos documentos y los puntos del historial Git. La limpieza no borra mensajes ya incorporados a una conversación activa.

La escritura exige referencias duraderas para puntos nuevos; al compactar verifica que las entradas retiradas puedan reconstruirse. Si la comprobación falla, no reemplaza la cache. Guardar la entrada en memoria no equivale por sí solo a persistir un pendiente o decisión.

A MEMORY.md previo en prosa no se interpreta ni se borra automaticamente: conservarlo y migrar cada hecho importante con su fuente duradera antes de reemplazarlo. La CLI aborta ante un formato desconocido.
