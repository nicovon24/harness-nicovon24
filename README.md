# harness-nicovon24

Arnés personal de desarrollo con especificación proporcional, modelos configurables, revisión y reanudación entre sesiones.

**Estado al 17 de octubre de 2026:** núcleo local `0.1.0-alpha.2` implementado parcialmente. Funcionan la CLI de configuración, la instalación conservadora de recursos Codex, checkpoints verificables y el registro local con bloqueos cooperativos. Un piloto local con la CLI instalada pasó. Todavía faltan pilotos con agentes reales, transferencia automática entre modelos, descubrimiento de skills en Orca/Codex y Supermemory remoto real; no es la v0.1 completa.

## Documentación

- [MEMORY.template.md](MEMORY.template.md): plantilla versionada para cache local; `MEMORY.md` es local y se excluye de Git.
- [Plan acordado](docs/PLAN.md): decisiones vigentes, secuencia y aceptación del núcleo inicial.
- [Especificación original](README-BASE.md): requisitos amplios y objetivo de v0.1 completa.

Las decisiones posteriores registradas en el plan actualizan la especificación original: núcleo local primero, procedimiento `builtin` inicial y transferencia automática entre modelos con opción manual explícita.

`MEMORY.md` es una cache local con hasta cinco días distintos de actividad real, sin vencimiento por inactividad. El cargador `memory-recall` incorpora en un solo bloque la cache y los resultados de Supermemory cuando hay credencial; limita ese bloque a 150 líneas y 8192 bytes UTF-8. La memoria nativa de Claude (CLAUDE.md) es otro mecanismo; este repositorio no crea una importación de MEMORY.md ni duplica su carga. Pendientes y decisiones duraderas deben vivir en `docs/PLAN.md` o en su documento fuente. El formato, comandos y contrato de persistencia están en `docs/MEMORY.md`.

## Uso local actual

Requiere Node.js 22+. Desde este checkout:

```powershell
npm ci
node bin/harness.mjs init --project C:\ruta\a\proyecto
node bin/harness.mjs validate --project C:\ruta\a\proyecto
node bin/harness.mjs config --project C:\ruta\a\proyecto
node bin/harness.mjs install --runtime codex --project C:\ruta\a\proyecto
node bin/harness.mjs install --runtime codex --project C:\ruta\a\proyecto --apply
```

`install` muestra un preview sin escribir. `--apply` copia un snapshot versionado de la CLI, sus dependencias y las siete skills a `.agents/` del proyecto. La copia instalada no depende de la ruta de este checkout. Repetir la misma instalación no duplica archivos; ante un archivo administrado modificado, se detiene y lo conserva. Para desinstalar, usar `uninstall --runtime codex --project <ruta>` y después `--apply`. Una versión instalada permanece fijada hasta ejecutar una actualización explícita desde otro checkout y actualizar `harnessVersion` en el manifiesto.

`init` crea `harness/.gitignore` con `.local/` para mantener checkpoints y cola fuera de Git, y añade `/MEMORY.md` al `.gitignore` raíz sin borrar reglas existentes. Si una cache ya estaba rastreada por Git, hay que retirarla del índice conservando el archivo local.

`config` muestra la procedencia de cada elección. Para probar una selección de tarea sin persistirla: `config --project <ruta> --classification complex-implementation`, o `--role implementer --profile sol --effort high`. El resultado indica modelos **solicitados**, no identidad comprobada del runtime. `doctor` informa el estado de archivos y deja las capacidades no probadas como `unverified`.

El registro local usa `begin --project <ruta> --feature <slug>`, `checkpoint --project <ruta> --run <id> --token <token> --phase <fase> --next <paso>`, `runs --project <ruta> --verify` y `end --project <ruta> --run <id> --token <token> --workers-stopped`. `checkpoint` guarda hashes de código y aceptación, y acepta `--check-command`, `--check-result` y `--check-scope` para comprobaciones ya ejecutadas. `runs` deriva `memorySync` de los recibos locales de todos los eventos del run. `review-record` guarda un veredicto asociado al snapshot de Git y a `requirements.md`; `review-status` lo marca inválido si cambia código o aceptación. El proyecto debe ser la raíz de su repositorio Git para verificar snapshots. La independencia y los resultados de checks siguen declarados por el invocador.

Los bloqueos de ejecución se guardan por defecto en el home local bajo `.harness-nicovon24/locks`; los checkpoints y eventos pendientes de memoria en `harness/.local/`, fuera de Git. `memory-sync --project <ruta>` envía la cola a Supermemory v5 cuando existe `SUPERMEMORY_API_KEY`; `memory-recall --project <ruta>` busca recuerdos por namespace y compone la salida dentro del presupuesto global. Si falta la clave o falla la búsqueda, sigue disponible la memoria local. El adaptador pasó pruebas HTTP simuladas, pero falta probar una cuenta real. La escritura de MEMORY.md usa un bloqueo por worktree y escritura atómica; los documentos duraderos compartidos deben editarse dentro de una ejecución que posea el bloqueo de checkout. Otros procesos que ignoren estos comandos no quedan bloqueados.

Las skills instaladas contienen instrucciones para el procedimiento `builtin`; su descubrimiento e invocación real todavía deben probarse en Orca/Codex. No se afirma ejecución automática de modelos, memoria remota verificada ni revisión independiente hasta completar los pilotos del [plan](docs/PLAN.md).

Verificación del código: `npm test`, `npm run check` y `npm audit`. El instalador se probó en proyectos temporales; no se instaló en proyectos personales durante esta sesión.

Antecedente de verificación conservado para la migración segura de la cache anterior: El núcleo local 0.1.0-alpha.1 y sus pruebas de configuración, instalación, checkpoints y revisión están implementados; npm test pasó cinco pruebas y npm run check pasó en el chequeo anterior.
