---
name: h-start
description: Recupera el estado local y la política de un proyecto con harness-nicovon24 y determina el próximo paso.
---

Leer `.agents/harness/workflows/builtin.md` desde la raíz del proyecto. Ejecutar `node .agents/harness/bin/harness.mjs doctor --project .` y `node .agents/harness/bin/harness.mjs config --project .`. Leer checkpoints locales, contrastar con Git y con el manifiesto. Si Supermemory está disponible y autorizado, recuperar recuerdos del mismo `projectId` y comprobarlos contra el workspace. Indicar el siguiente paso verificable y cualquier capacidad pendiente. No iniciar edición solo por invocar esta skill.
