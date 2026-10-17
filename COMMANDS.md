# Comandos del harness

Referencia rápida para `0.1.0-alpha.3` en Windows/PowerShell. Requiere Node.js 22 o posterior. [README.md](README.md) explica la instalación y [docs/PLAN.md](docs/PLAN.md) conserva el estado y los pendientes vigentes.

## Agregarlo a un proyecto

Ejecutar desde el checkout de este repositorio. Reemplazar la ruta por la del proyecto consumidor:

```powershell
npm ci
$project = 'C:\ruta\a\MiProyecto'
node bin/harness.mjs init --project $project
node bin/harness.mjs validate --project $project
node bin/harness.mjs install --runtime codex --project $project
node bin/harness.mjs install --runtime codex --project $project --apply
```

`init` crea `harness/project.json` y excluye la cache local de Git. Conserva los archivos existentes del proyecto; no redacta su `AGENTS.md` ni su `docs/PLAN.md`. `install` muestra una vista previa por defecto; `--apply` copia la CLI, sus dependencias y las skills a `.agents/`. La versión del manifiesto debe coincidir con la del checkout para instalar. Los conflictos con archivos editados detienen la instalación.

Una vez instalado, ejecutar los demás ejemplos desde la raíz del proyecto consumidor:

```powershell
Set-Location $project
$cli = '.agents/harness/bin/harness.mjs'
node $cli doctor --project .
node $cli config --project .
node $cli runs --project . --verify
node $cli memory-render --project .
```

Cargar la cache **una sola vez** al retomar. Contrastar con Git y los archivos actuales las referencias de repo, worktree, rama, commit y próximo paso que muestre el contexto.

## Skills para pedirle trabajo al agente

Las skills instaladas en `.agents/skills/` contienen instrucciones para el agente. Su presencia no verifica que el cliente las haya descubierto ni que pueda crear subagentes o cambiar de modelo.

| Skill | Uso |
|---|---|
| `h-start` | Leer política, runs y memoria local; decidir el próximo paso. |
| `h-doctor` | Diagnosticar la instalación y las capacidades disponibles. |
| `h-spec` | Definir requisitos y aceptación; terminar antes de implementar. |
| `h-feature` | Seguir especificación, implementación, checks, revisión y checkpoint. |
| `h-debug` | Investigar y corregir un fallo con evidencia. |
| `h-review` | Revisar código y aceptación sin editar lo revisado. |
| `h-checkpoint` | Guardar estado verificable y siguiente paso. |

Si el cliente no muestra una skill, indicarle su ruta, por ejemplo `.agents/skills/h-feature/SKILL.md`. El procedimiento compartido está en `.agents/harness/workflows/builtin.md`.

## CLI: configuración e instalación

Todas las órdenes de esta sección usan `node $cli <comando> --project .` desde el proyecto instalado. Para preparar otro proyecto desde este checkout, usar `node bin/harness.mjs` y `--project <ruta>`.

| Comando | Función y opciones principales |
|---|---|
| `help` | Mostrar los comandos disponibles; no requiere `--project`. |
| `init` | Crear el manifiesto del proyecto; ejecutar solo una vez. |
| `validate` | Validar `harness/project.json`. |
| `config` | Mostrar política efectiva; admite `--classification`, `--mode solo\|auto\|team`, `--testing standard\|tdd` y el trío `--role`, `--profile`, `--effort`. |
| `doctor` | Diagnosticar versiones, instalación, memoria y capacidades aún no verificadas. |
| `install --runtime codex` | Mostrar vista previa; `--apply` instala y `--dry-run` explicita la consulta sin escrituras. |
| `uninstall --runtime codex` | Mostrar vista previa; `--apply` quita solo archivos atribuibles a la instalación. |

## CLI: ejecución y revisión

| Comando | Función y opciones principales |
|---|---|
| `begin --feature <slug>` | Adquirir los bloqueos cooperativos de checkout y feature; devuelve `runId` y `token`. |
| `checkpoint --run <runId> --token <token> --phase <fase> --next <paso>` | Guardar snapshot, fase y siguiente paso. Si hubo un check, añadir `--check-command <comando> --check-result pass\|fail\|skipped --check-scope <requisito>`. |
| `checkpoint --run <runId> --token <token> --recover` | Recuperar un checkpoint interrumpido después de revisar el ownership. |
| `runs --verify` | Listar runs y comprobar vigencia de snapshots y checks. |
| `review-record --run <runId> --token <token> --verdict pass\|fail --reviewer self\|independent` | Registrar el veredicto; `independent` requiere `--review-session <id>`. La identidad sigue siendo una declaración del invocador. |
| `review-status --run <runId>` | Comprobar si la revisión sigue vigente tras cambios de código o aceptación. |
| `end --run <runId> --token <token> --workers-stopped` | Cerrar la ejecución después de comprobar que los workers terminaron. |

Los bloqueos coordinan usuarios del harness en el mismo host. Los checks y la independencia del reviewer registrados por flags no demuestran por sí solos qué ejecutó el runtime.

## CLI: memoria local

| Comando | Función y opciones principales |
|---|---|
| `memory-render` | Componer el contexto local para retomar, dentro del límite de 150 líneas y 8192 bytes UTF-8. |
| `memory-record --kind <tipo> --text <resumen> --ref <archivo> --session-id <id> --agent-id <id>` | Registrar actividad real. El texto debe constar antes en la fuente duradera. Tipos: `resume`, `blocker`, `decision`, `verified`, `progress`, `change`, `test`. |
| `memory-clear` | Vaciar la cache solo si puede comprobar la fuente duradera de todas sus entradas. |

`MEMORY.md` es una cache local ignorada por Git. Las decisiones y los pendientes viven en `docs/PLAN.md` o en documentos de feature. Leer la memoria no crea actividad.

## CLI: piloto optativo de Supermemory

`--pilot` habilita cada operación remota expresamente. Hace falta `SUPERMEMORY_API_KEY` en el entorno del proceso; no guardar la clave en el manifiesto ni en los documentos. Aceptar una escritura no demuestra que el recuerdo ya sea recuperable.

| Comando | Función |
|---|---|
| `memory-publish --pilot --text <resumen> --ref <archivo> --session-id <id> --agent-id <id>` | Preparar **un** evento local con fuente duradera; devuelve su ID. |
| `memory-status` | Ver eventos, recibos y pendientes locales sin red. |
| `memory-sync --pilot --event <id>` | Enviar solo el evento elegido. |
| `memory-processing --pilot --event <id> --wait-seconds 300` | Consultar procesamiento, extracción y posibilidad de recuperar el evento. |
| `memory-recall --pilot --query <texto>` | Buscar recuerdos remotos en el namespace del proyecto y componerlos con la cache local. |
| `memory-usage --days 7 --project-days 30` | Mostrar llamadas y estimaciones locales; `--official-file <ruta>` agrega contadores oficiales aportados por el usuario. |

La continuidad normal usa memoria local. En el piloto real de este repo Supermemory aceptó la escritura, pero la extracción permaneció en `dreaming` y la búsqueda no recuperó el evento; la evidencia está en [docs/PLAN.md](docs/PLAN.md).

## Recorrido habitual

1. Retomar con `doctor`, `config`, `runs --verify` y una carga de `memory-render`.
2. Antes de editar, ejecutar `begin --feature <slug>` y conservar `runId` y `token`.
3. Escribir aceptación proporcional al cambio. `h-spec` termina aquí; `h-feature` continúa.
4. Implementar y ejecutar checks pertinentes. Registrar resultados reales en un `checkpoint`.
5. Revisar según el riesgo, usar `review-record` y confirmar con `review-status`.
6. Guardar decisiones y pendientes en documentos duraderos; registrar en cache solo la actividad relevante. Cerrar con `end` cuando no haya workers activos.

La transferencia automática entre modelos y la revisión independiente identificada por el runtime siguen pendientes de evidencia. Consultar [docs/compatibility.md](docs/compatibility.md) para los límites observados.
