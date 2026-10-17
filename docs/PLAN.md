# Plan acordado del núcleo inicial

Fecha: 2026-10-17. Acordado en conversación; implementación diferida por el usuario a una próxima sesión. El estado de reanudación se mantiene en [MEMORY.md](../MEMORY.md).

Este plan actualiza la [especificación original](../README-harness-nicovon24.md) en los puntos decididos posteriormente. Sus requisitos restantes siguen vigentes. El prompt maestro original debe interpretarse con este alcance escalonado.

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
