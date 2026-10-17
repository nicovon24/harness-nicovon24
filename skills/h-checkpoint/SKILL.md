---
name: h-checkpoint
description: Guarda el estado operativo local de una ejecución y su siguiente paso.
---

Seguir la fase checkpoint de `.agents/harness/workflows/builtin.md` desde la raíz del proyecto. Registrar fase, política, referencias de código/spec, comando y resultado de cada check ejecutado, bloqueos y próximo paso en `harness/.local/runs/<runId>/`. Usar los flags `--check-command`, `--check-result` y `--check-scope` para cada comprobación pertinente. No guardar secretos ni transcripciones. Supermemory requiere escritura confirmada para marcar sincronización completa; hasta entonces dejar `memory_sync_pending`.
