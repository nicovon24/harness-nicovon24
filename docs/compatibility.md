# Compatibilidad y evidencia

Estado al 17 de octubre de 2026. `probado` significa ejecución observada; `estático` solo archivos o ayuda local inspeccionados.

| Capacidad | Estado | Evidencia o límite |
|---|---|---|
| CLI Node 24 en Windows | Probado | `npm test` con 19 casos, `npm run check` |
| Instalación por proyecto | Probado en fixtures | Dos proyectos temporales, preview, repetición y desinstalación aislada |
| CLI copiada en el proyecto | Probado en fixture | La copia ejecutó `config` sin ruta al checkout de origen |
| Bloqueo cooperativo de checkout/feature | Probado en fixture | Segunda ejecución bloqueada; token exigido para checkpoint y cierre |
| Invalidez de revisión tras cambios | Probado en fixture | `review-status` detectó cambios tanto de código como de aceptación; la identidad independiente solo queda declarada por el invocador |
| Cache de memoria y durabilidad | Probado en fixtures | Cinco días activos, sin caducidad por pausa, límites de 150 líneas y 8192 bytes UTF-8, dos escritores concurrentes, limpieza solo con referencia durable |
| Checkpoint y reanudación local | Probado en fixtures | Hashes de código y aceptación, serialización de checkpoints y `runs --verify`; un piloto con CLI instalada completó un run solo y lo leyó desde otro proceso |
| Piloto en PortafolioNuevo | Probado en copia local del commit `9832e9c` | Instalación `0.1.0-alpha.2` idempotente, `doctor: files-match`, check real, checkpoint capturado, autorrevisión `current`, cierre y reanudación `current`; `MEMORY.md` ignorado y recuperado. El repositorio original conservó su estado previo (`output/` y `tmp/` sin rastrear). |
| Invocación de skill en Codex CLI | Piloto parcial | `codex exec` con Sol High leyó `h-doctor` y su guía compartida; su política interna bloqueó ejecutar Node desde el agente. La CLI instalada pasó `validate` y `doctor` al ejecutarla directamente. El cliente avisó de límite de contexto de skills; falta comprobar descubrimiento nativo sin invocación explícita. |
| Cambio automático de modelo y revisión independiente | Pendiente | No se creó un agente real ni se comprobó identidad reportada por runtime |
| Supermemory v5 | Adaptador probado con HTTP simulado; piloto remoto pendiente | Namespace por proyecto, cola, reconciliación por ID y recuperación bajo presupuesto. No hay `SUPERMEMORY_API_KEY` disponible; sin escritura ni lectura contra el servicio verificadas |
| Claude, Pi, Linux y CI | Pendiente | Sin pruebas en esos entornos |

`codex --version` reportó `codex-cli 0.157.0` en este entorno. Emitió advertencias de acceso denegado al limpiar temporales y crear aliases bajo el CODEX_HOME de Orca; el comando terminó correctamente. Eso no certifica el descubrimiento ni la delegación.

Los dos pilotos `codex exec` reportaron `model: gpt-6-sol` y `reasoning effort: high` en el encabezado del runtime. No crearon subagentes ni cambiaron de modelo automáticamente. En el segundo, la política de ejecución rechazó los comandos Node antes de arrancarlos; la comprobación directa posterior de la misma CLI instalada devolvió `valid: true` y `installation: files-match`.

Una revisión posterior en contexto nuevo del código fuente mediante `codex exec` fue rechazada por la revisión automática del entorno: implicaba enviar código y documentación locales a un proveedor externo sin autorización específica para esa exportación. Se continuó con pruebas y revisión local; la revisión independiente del código sigue pendiente.

El piloto de la CLI instalada usó autorrevisión declarada por el invocador. Demuestra el recorrido local de comandos, no descubrimiento nativo de skills, sesión nueva de agente, transferencia de modelos ni identidad independiente. El adaptador Supermemory sigue la [API v5 y sus namespaces](https://api.supermemory.ai/reference); las pruebas usan respuestas simuladas y no prueban procesamiento ni recuperación remota real.

En la copia de PortafolioNuevo, el sandbox impidió inicialmente que Node lanzara Git (`spawn EPERM`); por eso el primer snapshot quedó sin verificar y `review-record` falló. La repetición con ejecución local autorizada capturó ambos hashes y dejó la revisión vigente. La copia se obtuvo con `git archive` y `git init`, sin commit nuevo: sus resúmenes de memoria marcan la referencia Git como pendiente de revalidación.

Referencia de ubicación de skills: [OpenAI, Using skills to accelerate OSS maintenance](https://developers.openai.com/blog/skills-agents-sdk).
