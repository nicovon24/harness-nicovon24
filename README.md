# harness-nicovon24

Arnés personal de desarrollo con especificación proporcional, modelos configurables, revisión y reanudación entre sesiones.

**Estado al 17 de octubre de 2026:** núcleo local `0.1.0-alpha.1` implementado parcialmente. Funcionan la CLI de configuración, la instalación conservadora de recursos Codex y el registro local con bloqueos cooperativos. Todavía faltan pilotos con agentes reales, transferencia automática entre modelos, descubrimiento de skills en Orca/Codex y Supermemory; no es la v0.1 completa.

## Documentación

- [MEMORY.md](MEMORY.md): trabajo realizado, estado comprobado, pendientes y mensaje para retomar.
- [Plan acordado](docs/PLAN.md): decisiones vigentes, secuencia y aceptación del núcleo inicial.
- [Especificación original](README-BASE.md): requisitos amplios y objetivo de v0.1 completa.

Las decisiones posteriores registradas en el plan actualizan la especificación original: núcleo local primero, procedimiento `builtin` inicial y transferencia automática entre modelos con opción manual explícita.

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

`init` crea `harness/.gitignore` con `.local/` para mantener checkpoints y cola fuera de Git. Si ese archivo ya existe sin esa regla, informa el conflicto para revisión manual.

`config` muestra la procedencia de cada elección. Para probar una selección de tarea sin persistirla: `config --project <ruta> --classification complex-implementation`, o `--role implementer --profile sol --effort high`. El resultado indica modelos **solicitados**, no identidad comprobada del runtime. `doctor` informa el estado de archivos y deja las capacidades no probadas como `unverified`.

El registro local usa `begin --project <ruta> --feature <slug>`, `checkpoint --project <ruta> --run <id> --token <token> --phase <fase> --next <paso>`, `runs --project <ruta>` y `end --project <ruta> --run <id> --token <token> --workers-stopped`. `review-record` guarda un veredicto asociado al snapshot de Git y a `requirements.md`; `review-status` lo marca inválido si cambia código o aceptación. El proyecto debe ser la raíz de su repositorio Git para estas dos operaciones. La independencia declarada por el invocador sigue pendiente de verificación con agentes reales.

Los bloqueos se guardan por defecto en el home local bajo `.harness-nicovon24/locks`; los checkpoints y eventos pendientes de memoria en `harness/.local/`, fuera de Git. La cola local conserva eventos, pero todavía no los envía a Supermemory. El usuario o agente debe verificar que ningún worker sigue escribiendo antes de liberar. Otros procesos que no utilicen estos comandos no quedan bloqueados.

Las skills instaladas contienen instrucciones para el procedimiento `builtin`; su descubrimiento e invocación real todavía deben probarse en Orca/Codex. No se afirma ejecución automática de modelos, memoria remota ni revisión independiente hasta completar los pilotos del [plan](docs/PLAN.md).

Verificación del código: `npm test`, `npm run check` y `npm audit`. El instalador se probó en proyectos temporales; no se instaló en proyectos personales durante esta sesión.
