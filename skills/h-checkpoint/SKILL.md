---
name: h-checkpoint
description: Guarda el estado operativo local de una ejecución y su siguiente paso.
---

Seguir la fase checkpoint de `.agents/harness/workflows/builtin.md` desde la raíz del proyecto. Registrar fase, política, referencias de código/spec, bloqueos y próximo paso en `harness/.local/runs/<runId>/`. Usar `--check-command`, `--check-result` y `--check-scope` para cada comprobación pertinente; son declaraciones del invocador y quedan ligadas al snapshot capturado. Si hay journal pendiente, revisar ownership y ejecutar `checkpoint --recover` con el mismo run/token antes de uno nuevo. No guardar secretos ni transcripciones. Un evento local no implica sincronización remota; Supermemory solo se usa con `--pilot` y evento elegido.
