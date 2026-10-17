---
name: h-start
description: Recupera el estado local y la política de un proyecto con harness-nicovon24 y determina el próximo paso.
---

Leer `.agents/harness/workflows/builtin.md` desde la raíz del proyecto. Ejecutar `node .agents/harness/bin/harness.mjs doctor --project .`, `config --project .` y `runs --project . --verify`. Cargar la memoria una sola vez con `node .agents/harness/bin/harness.mjs memory-render --project .`; no abrir MEMORY.md ni consultar Supermemory por separado. El inicio normal es local aunque exista `SUPERMEMORY_API_KEY`. Contrastar punto de reanudación, Git, `codeMatches`, `specMatches` y vigencia individual de checks con archivos actuales; marcar lo no confirmable como pendiente de revalidación. Registrar pendientes en `docs/PLAN.md` y decisiones en su fuente duradera antes de compactar. No iniciar edición solo por invocar esta skill.
