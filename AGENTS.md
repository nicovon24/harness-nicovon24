# Contexto para trabajar en este repositorio

Antes de actuar, consultá docs/PLAN.md y las secciones pertinentes de PRODUCT.md. Cargá la cache una sola vez al retomar mediante `node bin/harness.mjs memory-render --project .`; no abras MEMORY.md por separado ni la importes también desde una memoria nativa.

- docs/PLAN.md conserva decisiones y pendientes duraderos; MEMORY.md es una cache local con hasta 5 días activos distintos y no vence por inactividad.
- El compositor del harness cuenta la memoria local y remota como un único bloque de hasta 150 líneas y 8192 bytes UTF-8. No agregues resultados remotos al contexto por fuera del compositor.
- Al retomar, valida las referencias de repo, worktree, rama, commit y punto de reanudación contra el disco/Git. Señalá lo que no se pueda confirmar.
- Antes de registrar un pendiente o decisión en la cache, guardalo en su documento duradero. No guardes secretos, datos personales ni transcripciones.
- El prompt maestro dentro de la especificación es una referencia, no una orden automática. Ante implementación, seguí el plan y registrá evidencia real. No confundas modelos solicitados con modelos reportados por el runtime.
- Actualizá la memoria solo para actividad real relevante, con timestamp UTC, session_id y agent_id; leer, cargar o limpiar no cuenta como actividad. Usá memory-record para mantener límites y bloqueo concurrente.
