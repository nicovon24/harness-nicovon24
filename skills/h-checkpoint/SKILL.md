---
name: h-checkpoint
description: Guarda el estado operativo local de una ejecución y su siguiente paso.
---

Seguir la fase checkpoint de `.agents/harness/workflows/builtin.md` desde la raíz del proyecto. Registrar fase, política, referencias de código/spec, checks reales, bloqueos y próximo paso en `harness/.local/runs/<runId>/`. No guardar secretos ni transcripciones. Supermemory requiere escritura confirmada para marcar sincronización completa; hasta entonces dejar `memory_sync_pending`.
