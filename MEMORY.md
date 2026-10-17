# Memoria de trabajo — harness-nicovon24

Última actualización: 2026-10-17, zona America/Buenos_Aires.

## Estado comprobado

El usuario pidió comenzar la implementación tras el handoff documental. Este checkout tiene ahora un núcleo local `0.1.0-alpha.1`: CLI Node, esquema JSON validado con Ajv, defaults y reglas de routing, instalación conservadora por proyecto, siete skills con procedimiento `builtin` compartido y registro de ejecuciones con bloqueos cooperativos. El estado real y los comandos están en [README.md](README.md). El [plan acordado](docs/PLAN.md) sigue definiendo el alcance pendiente.

No se instaló el arnés en proyectos personales, no se hizo push ni publicación. Se instaló y ejecutó en `.tmp/pilot`, excluido de Git. Codex CLI invocó explícitamente `h-doctor` y leyó sus archivos; avisó que el presupuesto de contexto omitió descripciones de skills y su política interna bloqueó ejecutar Node, por lo que el descubrimiento nativo completo sigue sin certificarse. La misma CLI instalada pasó `validate` y `doctor` al ejecutarla directamente. No se ejecutó el piloto entre modelos ni revisión independiente con agentes. Supermemory tampoco se escribió o recuperó. Los modelos que muestra `config` son **solicitados** según el mapa fijado; los dos pilotos de `codex exec` reportaron `gpt-6-sol` con esfuerzo `high` en el encabezado del runtime.

## Evidencia de esta sesión

- Node `v24.15.0`; Codex CLI `0.157.0`. `codex --version` terminó con advertencias de acceso denegado en temporales/aliases de CODEX_HOME administrado por Orca.
- `npm install --ignore-scripts` instaló Ajv y dependencias; `npm audit --json` reportó cero vulnerabilidades al comprobarlo.
- `npm test` pasó cuatro pruebas tras la última edición: configuración y overrides, instalación en dos proyectos, CLI copiada, conservación de cambios, bloqueo cooperativo y evento durable de checkpoint.
- `npm run check` pasó tras la última edición. `npm audit --json` reportó cero vulnerabilidades.
- La ubicación `.agents/skills/` se contrastó con [documentación oficial de OpenAI](https://developers.openai.com/blog/skills-agents-sdk). Un primer piloto Codex leyó siete skills en disco; un segundo invocó `h-doctor` y leyó su guía. El runtime anidado bloqueó los comandos Node; al ejecutarlos directamente, `validate` devolvió `valid: true` y `doctor` `installation: files-match`.
- Commit local inicial `02aa315` (`feat: add local harness core and Codex project installer`). No hubo push.

## Decisiones vigentes

- Núcleo local utilizable antes de v0.1 completa. `builtin` primero; Superpowers y Supermemory después, con pruebas reales.
- Defaults: coordinador Astra medium, researcher Luna high, implementer Sol medium, reviewer Sol high. Sol High fue recomendado al usuario para implementar este arnés; no se comprobó un cambio del modelo de esta sesión.
- Transferencia automática entre modelos por defecto con opción manual explícita. La falta de mecanismo real deja ese gate pendiente, sin convertirlo silenciosamente a manual.
- Instalación por proyecto desde checkout versionado, actualización explícita, sin reemplazar configuración global ni CODEX_HOME.

## Próximo paso

1. Completar el piloto de transferencia automática y revisión independiente entre modelos en un proyecto temporal; registrar datos de runtime y recuperación desde otra sesión.
2. Completar snapshots de código/aceptación e invalidación de revisión; verificar límites y ownership con agentes vivos.
3. Integrar Supermemory con envío/confirmación de la cola durable y recuperación reales; luego Superpowers en revisión fijada. No declarar v0.1 completa antes de la aceptación del plan.
4. Crear nuevos commits locales por los siguientes resultados revisados. No hacer push sin pedido explícito.
