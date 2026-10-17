---
name: h-start
description: Recupera el estado local y la política de un proyecto con harness-nicovon24 y determina el próximo paso.
---

Leer `.agents/harness/workflows/builtin.md` desde la raíz del proyecto. Ejecutar `node .agents/harness/bin/harness.mjs doctor --project .`, `config --project .` y `runs --project . --verify`. Cargar la memoria una sola vez con `node .agents/harness/bin/harness.mjs memory-recall --project .`; no abrir MEMORY.md ni consultar Supermemory por separado. El comando busca en el namespace del proyecto si existe `SUPERMEMORY_API_KEY` y siempre compone cache y resultados remotos bajo un solo presupuesto; en caso de fallo informa que la búsqueda remota quedó pendiente. Contrastar el punto de reanudación, las referencias Git, `codeMatches` y `specMatches` con los archivos actuales; marcar lo no confirmable como pendiente de revalidación. Registrar pendientes en `docs/PLAN.md` y decisiones en su fuente duradera antes de compactar. No iniciar edición solo por invocar esta skill.
