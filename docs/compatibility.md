# Compatibilidad y evidencia

Estado al 17 de octubre de 2026. `probado` significa ejecución observada; `estático` solo archivos o ayuda local inspeccionados.

| Capacidad | Estado | Evidencia o límite |
|---|---|---|
| CLI Node 24 en Windows | Probado | `npm test` con cuatro casos, `npm run check` |
| Instalación por proyecto | Probado en fixtures | Dos proyectos temporales, preview, repetición y desinstalación aislada |
| CLI copiada en el proyecto | Probado en fixture | La copia ejecutó `config` sin ruta al checkout de origen |
| Bloqueo cooperativo de checkout/feature | Probado en fixture | Segunda ejecución bloqueada; token exigido para checkpoint y cierre |
| Invalidez de revisión tras cambios | Probado en fixture | `review-status` detectó cambios tanto de código como de aceptación; la identidad independiente solo queda declarada por el invocador |
| Invocación de skill en Codex CLI | Piloto parcial | `codex exec` con Sol High leyó `h-doctor` y su guía compartida; su política interna bloqueó ejecutar Node desde el agente. La CLI instalada pasó `validate` y `doctor` al ejecutarla directamente. El cliente avisó de límite de contexto de skills; falta comprobar descubrimiento nativo sin invocación explícita. |
| Cambio automático de modelo y revisión independiente | Pendiente | No se creó un agente real ni se comprobó identidad reportada por runtime |
| Supermemory | Pendiente | Sin escritura ni recuperación remota verificadas |
| Claude, Pi, Linux y CI | Pendiente | Sin pruebas en esos entornos |

`codex --version` reportó `codex-cli 0.157.0` en este entorno. Emitió advertencias de acceso denegado al limpiar temporales y crear aliases bajo el CODEX_HOME de Orca; el comando terminó correctamente. Eso no certifica el descubrimiento ni la delegación.

Los dos pilotos `codex exec` reportaron `model: gpt-6-sol` y `reasoning effort: high` en el encabezado del runtime. No crearon subagentes ni cambiaron de modelo automáticamente. En el segundo, la política de ejecución rechazó los comandos Node antes de arrancarlos; la comprobación directa posterior de la misma CLI instalada devolvió `valid: true` y `installation: files-match`.

Referencia de ubicación de skills: [OpenAI, Using skills to accelerate OSS maintenance](https://developers.openai.com/blog/skills-agents-sdk).
