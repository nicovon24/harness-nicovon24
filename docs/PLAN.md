# Plan acordado del núcleo inicial

## Decisión vigente: memoria local primero (2026-10-17)

Este hito reemplaza los requisitos anteriores que hacían obligatoria la memoria remota para reanudar. La continuidad del proyecto se basa en `AGENTS.md` (reglas), este plan y documentos de feature (decisiones, aceptación y pendientes), `MEMORY.md` (cache breve), `harness/.local/` (estado operativo y ownership) y Git (versiones y evidencia). Supermemory v5 queda como piloto optativo de resúmenes seleccionados. La memoria global entre proyectos se pospone; no es criterio de salida de este trabajo. Los apartados históricos posteriores se leen con esta prioridad.

La reanudación normal usa `memory-render`, `runs --verify` y las fuentes duraderas, sin red. `memory-recall --pilot` consulta un namespace del proyecto cuando se elige expresamente. `memory-publish --pilot` prepara un resumen breve con fuente durable, y `memory-sync --pilot --event ID` transmite solo ese evento. La mera presencia de `SUPERMEMORY_API_KEY` no activa el piloto. `memory-record` continúa siendo local. Eventos y recibos fijan destino; un checkpoint inconcluso no se exporta. `memory-status` y `memory-usage` informan pendientes y consumo local observado.

Las comprobaciones nuevas quedan ligadas al snapshot de código y aceptación. Los checks anteriores sin esa evidencia se consideran no verificados; la identidad del reviewer y el resultado de un check proporcionados por flags siguen siendo declaraciones del invocador. Un journal local permite recuperar el mismo checkpoint tras una interrupción con `checkpoint --recover`, conservando ID y payload.

Aceptación de este hito: pruebas con mocks y CLI instalada, piloto de continuidad local, documentación coherente y preparación de Supermemory con consumo medible. La prueba real del servicio depende de credencial y conectividad; si faltan, queda pendiente con procedimiento. El resto de aceptación de v0.1 (modelos y reviewer reales, descubrimiento de skills y otras integraciones) sigue abierto.

### Evidencia de implementación de `0.1.0-alpha.3`

- `npm test`: 24 casos pasaron el 2026-10-17. `npm run check`: sintaxis de CLI y todos los módulos `src/` pasó. La suite usa HTTP simulado y proyectos temporales sin credenciales. El validador `quick_validate.py` de `skill-creator` no pudo ejecutarse porque este Python no tiene PyYAML; frontmatter y rutas de las tres skills editadas se inspeccionaron directamente y las skills se copiaron en el fixture de instalación.
- Piloto local instalado desde el checkout de implementación antes de incrementar su etiqueta de versión, en `harness/.local/pilot-project`, repo temporal con commit `6a172f97deefd1f7e871b0b529ecb009f1a4ecf3`: `sum(2, 3) === 5` comprobado por Node; `docs/PLAN.md` del fixture conserva tarea terminada y pendiente; `memory-record` guardó el resumen y `checkpoint` capturó aceptación y código. Un proceso CLI nuevo informó `resumeValidation: current`, check vigente y próximo paso `revisar el comportamiento con otro agente`. `memory-render` mostró la cache y señaló que su entrada previa carecía de commit comprobado cuando se escribió bajo el sandbox. La cola remota quedó pendiente. Esto prueba otro proceso CLI, no otra sesión de agente.
- Primer intento del piloto: Node no pudo invocar Git dentro del sandbox (`spawn EPERM`), y el directorio de locks se ubicó dentro del fixture, por lo que ese snapshot quedó obsoleto. El segundo run usó estado de host fuera del fixture y capturó el snapshot con Git; el historial anterior permanece visible como `unverified/stale`.
- Una sesión nueva de subagente, con contexto independiente y tarea solo de lectura, retomó el fixture: contrastó Git directo (`master`, HEAD `6a172f9`), plan, aceptación y cache cargada una vez; concluyó que `sum` está terminada y que falta revisar el comportamiento con otro agente. Su `runs --verify` dentro del sandbox devolvió `needs-revalidation` y checks `unverified` porque la invocación asíncrona de Git falló con `spawn EPERM`. El mismo segundo run había dado `current` en la CLI con acceso a Git. La sesión nueva prueba lectura por otro agente, pero no revisión independiente de código ni identidad/modelo reportados por el runtime.
- Supermemory real sigue pendiente: `SUPERMEMORY_API_KEY` está ausente en este entorno; no se probó conectividad al servicio. Procedimiento: preparar un resumen inocuo con `memory-publish --pilot`, enviar solo su ID con `memory-sync --pilot --event`, consultar `memory-processing --pilot --event --wait-seconds 300`, buscarlo desde otro proceso con `memory-recall --pilot`, revisar `memory-usage --days 7 --project-days 30` y comparar con cifras oficiales de la misma ventana cuando estén disponibles. Probar otro projectId y una copia movida manteniendo identidad. No declarar éxito de servicio por aceptación de documento o mocks.

Fecha: 2026-10-17. Acordado en conversación y en implementación. El estado de reanudación se mantiene en la cache local `MEMORY.md`; decisiones y pendientes duraderos viven en este plan.

Este plan actualiza la [especificación original](../README-BASE.md) en los puntos decididos posteriormente. Sus requisitos restantes siguen vigentes. El prompt maestro original debe interpretarse con este alcance escalonado.

## 1. Resultado y decisiones cerradas

Construir un arnés local instalable por proyecto, con un recorrido completo de especificación, implementación, revisión y reanudación. El núcleo inicial será un hito utilizable previo a la v0.1 completa.

- Procedimiento inicial: `builtin`. Superpowers se integrará posteriormente mediante procedimientos concretos y una revisión fijada.
- Modelos para construir este arnés: Astra High para análisis y planificación; Sol High para implementación y revisión con contexto nuevo.
- Defaults generales: conservar los del README. La selección High de este trabajo será un override de ejecución.
- Transferencia entre modelos: automática por defecto, con opción manual explícita del usuario. Si no está disponible la automatización requerida, guardar checkpoint e informar el bloqueo; no cambiar silenciosamente a manual.
- Entorno inicial: Windows, PowerShell y Orca/Codex. Node.js 22+ con módulos ESM; el entorno inspeccionado tiene Node 24.
- Testing estándar por defecto; TDD cuando se solicite.
- Máximo dos subagentes activos; únicamente el coordinador delega.

La automatización de transferencia es independiente de los modos `solo`, `auto` y `team`, que controlan la delegación.

## 2. Primera comprobación: recorrido real entre modelos

Antes de construir el instalador completo, realizar un piloto pequeño en un proyecto temporal:

1. Astra prepara aceptación y plan breve.
2. El runtime crea un implementador Sol con encargo y rutas asignadas.
3. Un reviewer Sol con contexto nuevo inspecciona resultado y evidencia.
4. El coordinador integra la entrega y prepara un checkpoint.
5. Otra sesión recupera el trabajo y determina el siguiente paso.

Registrar modelo y esfuerzo solicitados, mecanismo utilizado y datos reportados por el runtime cuando existan. La identidad declarada por el agente no cuenta como prueba.

Cuando el cliente permita delegar, el coordinador puede seguir en Astra mientras Sol implementa. Un cambio del modelo de la sesión principal utilizará el mecanismo real del cliente.

Criterio de salida: evidencia del recorrido automático o bloqueo concreto de la capacidad ausente. La configuración y la instalación independientes pueden avanzar; el flujo automático no queda terminado sin prueba.

## 3. Implementación del núcleo

### Configuración y política

- `harness/project.json` será el manifiesto del proyecto.
- Resolver modelos mediante override de ejecución > override de proyecto > regla autorizada > default.
- Aplicar las reglas del README en orden explícito; ante clasificación incierta, conservar el default.
- Validar contratos con JSON Schema y una biblioteca existente, sin desarrollar un validador general artesanal.
- Mostrar procedencia de la política efectiva y distinguir preferencias de requisitos obligatorios de cierre.
- `init` conservará herencia: no copiar defaults como overrides permanentes.

### Instalación y uso

- Distribuir desde un checkout local versionado del arnés.
- Conservar `init`, `validate`, `config`, `doctor`, `install` y `uninstall`, con `--project` y `--runtime codex` donde corresponda.
- Instalar por proyecto los recursos necesarios para las skills y registrar versión y hashes.
- Una instalación conserva su versión y defaults asociados hasta una actualización explícita.
- `install` muestra preview por defecto; `--apply` instala o actualiza; `--dry-run` no escribe.
- Preservar modificaciones ajenas y abortar ante conflictos. Desinstalar únicamente archivos atribuibles a la instalación y preservar cambios posteriores.
- Evitar dependencia accidental de rutas absolutas al checkout de origen; las skills instaladas deben localizar sus recursos.
- Comprobar descubrimiento real en Orca/Codex antes de documentar invocación como funcional.
- Respetar CODEX_HOME efectivo; no reemplazar configuración global, hooks ni skills personales.

### Workflows y artefactos

- Implementar h-start, h-doctor, h-spec, h-feature, h-debug, h-review y h-checkpoint reutilizando fases comunes.
- h-spec termina en especificación; h-feature continúa por las fases autorizadas.
- Cambios pequeños: un documento con aceptación, tareas y evidencia. Cambios relevantes: requisitos, diseño, tareas y revisión separados.
- Mantener un único estado de feature y vincular revisiones al snapshot de código y aceptación, incluidos archivos nuevos pertinentes.
- Exigir revisión independiente en team y en los casos de riesgo del README; identificar autorrevisión cuando esté permitida.
- Mantener límites de correcciones, delegaciones y tiempo por ejecución. Un timeout no libera ownership si un worker puede seguir escribiendo.

### Ownership y recuperación

- Bloqueos cooperativos atómicos de checkout y feature en registro compartido del host, fuera de Git.
- Workers de la misma ejecución con rutas exclusivas. No liberar ownership mientras puedan seguir escribiendo ni recuperar bloqueos solo por antigüedad.
- Checkpoints locales por fase con política, referencias de código, comprobaciones y próximo paso.
- Contrastar checkpoint y workspace antes de retomar; no repetir acciones cuyo resultado sea incierto.
- Declarar alcance cooperativo: no prometer impedir escrituras de herramientas externas que ignoren los bloqueos.

## 4. Verificación y aceptación

El núcleo inicial estará listo cuando demuestre:

- Instalación en dos proyectos, repetición sin duplicados y desinstalación de uno sin afectar al otro.
- Preview sin escrituras y conservación de archivos modificados por el usuario.
- Herencia y overrides correctos, rechazo de configuración inválida y procedencia visible.
- Transferencia automática real entre modelos solicitados y respeto de una elección manual explícita.
- Recorrido completo con revisión independiente y otro pequeño en solo.
- Reanudación desde otra sesión sin repetir trabajo completado.
- Competencia entre dos ejecuciones: solo una obtiene los bloqueos del mismo checkout o feature; features distintas en worktrees distintos pueden avanzar aisladas.
- Invalidación de revisión cuando cambia código o aceptación relevante.

Usar fixtures temporales para el instalador. Separar pruebas automáticas y pilotos con agentes. Registrar comando, resultado, entorno y aceptación comprobada. CI requiere evidencia propia; crear su configuración no equivale a ejecución exitosa. No declarar compatibilidad no probada.

## 5. Entrega y continuación hacia v0.1

Primera entrega: instrucciones de instalación, comandos comprobados, límites observados y commits locales por resultado. No realizar push ni publicación sin pedido explícito.

Después completar:

1. Supermemory: escritura y recuperación reales, separación por proyecto, cola durable y recuperación ante fallos. Los checkpoints del núcleo son recuperación operativa, no otro proveedor de memoria.
2. Superpowers: integración selectiva con revisión fijada, atribución y compatibilidad con testing estándar o TDD.
3. v0.1 completa: requisitos originales de memoria, instalación, modelos, exclusión de escritores y recorrido completo, con evidencia.

Claude, Pi, ejecución no interactiva y coordinación entre máquinas quedan para etapas posteriores. El núcleo inicial no se presentará como v0.1 completa mientras falten sus integraciones obligatorias.

## 6. Gestión de memoria acordada e implementada

- Cache local ignorada por Git: hasta cinco fechas distintas con actividad real, sin vencimiento por inactividad; fechas agrupadas por `timeZone` del manifiesto o `America/Argentina/Buenos_Aires`.
- Timestamp de cada punto en UTC. Lectura, apertura de sesión, consulta remota, resumen y limpieza no crean actividad.
- Contexto total compuesto por cache local y resultados remotos: máximo 150 líneas y 8192 bytes UTF-8 simultáneamente, incluidos títulos, metadata y separadores; máximo cinco puntos breves por fecha.
- El cargador CLI aplica prioridad por reanudación, bloqueos, decisiones, estado verificado y actividad reciente. No corta puntos a mitad; omite puntos enteros que no caben.
- Escritura local con lock por worktree, lectura fresca bajo lock y rename atómico; cada punto incluye projectId, worktree, rama, commit, session_id, agent_id y referencia duradera. No se compacta ni limpia si falla la comprobación de persistencia.
- `docs/MEMORY.md` documenta comandos y limitaciones. La cache local no es memoria nativa de Claude. Hay un adaptador Supermemory v5 con cola y recuperación por namespace, probado con respuestas simuladas; escritura y lectura remotas reales permanecen pendientes de credencial y piloto.
- Los documentos duraderos compartidos usan el ownership del checkout/run; el lock de MEMORY no coordina escrituras a `docs/PLAN.md`.
- Implementación verificada: pruebas de memoria cubren retoma tras un mes, lectura sin actividad, desplazamiento del sexto día, límites globales con Unicode/remoto, escrituras concurrentes y limpieza con pendientes duraderos.

## 7. Revisión de preparación — 2026-10-17

El núcleo local `0.1.0-alpha.2` permite un recorrido solo desde la CLI instalada en un proyecto temporal. Todavía no satisface los criterios de v0.1 completa ni demuestra orquestación automática con agentes reales.

- Hecho: `init` añade `/MEMORY.md` al `.gitignore` raíz del proyecto consumidor sin reemplazar reglas existentes; `harness/.local/` ya estaba excluido. Un MEMORY.md previamente rastreado debe retirarse del índice conservando su copia local.
- Hecho: memoria comprueba que el texto exista en su documento duradero, reconoce commits por el código de salida de Git y compacta por identidad de entrada. Las pruebas cubren errores de persistencia y timestamps legacy repetidos.
- Hecho: checkpoint guarda hashes de código y aceptación, comprobaciones declaradas por el invocador y eventos de cola. Las escrituras del mismo run se serializan; `runs --verify` marca `needs-revalidation` si el snapshot ya no coincide.
- Hecho: el adaptador Supermemory v5 utiliza namespace por proyecto, ID estable por evento, recibos locales y reconciliación antes de reintentar. La recuperación pasa por el presupuesto global. Solo se verificó con respuestas HTTP simuladas: no hay `SUPERMEMORY_API_KEY` en este entorno.
- Hecho: un fixture ejecutó desde la CLI instalada `begin`, una comprobación real, `checkpoint`, `runs --verify`, `review-record` con autorrevisión, `review-status`, `end` y nueva lectura del run desde otro proceso.
- Piloto adicional en un repo existente: copia aislada del commit `9832e9c` de PortafolioNuevo, sin tocar su árbol original. `init`, `validate`, instalación `0.1.0-alpha.2`, repetición sin cambios, `doctor: files-match`, bloqueo, `node --check postcss.config.mjs`, checkpoint con código/aceptación capturados, `runs --verify: current`, autorrevisión vigente, cierre y reanudación desde otro proceso: `current`. Un recuerdo local se registró y recuperó; `MEMORY.md` y `.local/` quedaron ignorados. Supermemory remoto, descubrimiento de skills y modelos reales no participaron.
- Pendiente para v0.1: piloto remoto real de Supermemory (escritura, procesamiento, recuperación y caída), descubrimiento de skills en Orca/Codex, transferencia real entre modelos, reviewer independiente identificado por el runtime y reanudación en una nueva sesión de agente. Un proceso nuevo de CLI no demuestra por sí solo una sesión nueva de agente.
- Límite conocido: los checks y la independencia del reviewer siguen declarados por el invocador; no hay verificación automática de identidad o del comando ejecutado. Los bloqueos son cooperativos y locales al host. Recuperar un bloqueo abandonado o un cierre parcial requiere revisión manual.
- Límite observado en el piloto: el sandbox negó a Node ejecutar Git (`spawn EPERM`), por lo que el primer checkpoint quedó `unverified` y la revisión no pudo registrarse. Al repetir en la misma copia con permiso de ejecución local, los snapshots y la revisión funcionaron. La copia no tiene commit propio porque se creó desde un archivo Git del commit de origen sin hacer un commit nuevo; la cache señala correctamente que no puede confirmar su commit.

Próximo paso histórico anterior a la decisión vigente: probar Supermemory v5 con una credencial del proyecto y un recuerdo de prueba no sensible; después ejecutar el piloto de agentes con transferencia y revisión independientes reales, registrando la identidad reportada por el runtime.

Antecedentes de handoff conservados como registro duradero (superados por el estado anterior):

- Próximo paso: corregir exclusión de cache en proyectos consumidores y garantías de persistencia; luego completar checkpoints verificables y piloto real de extremo a extremo.
- Próximo paso: validar el comportamiento instalado desde otra sesión y retomar los pilotos faltantes según docs/PLAN.md; confirmar el estado actual con Git antes de actuar.
- Siguen pendientes pilotos reales de transferencia y revisión independiente, recuperación en otra sesión, e integración efectiva de Supermemory y Superpowers; no declarar completa la v0.1.
