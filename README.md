# harness-nicovon24

Arnés local para especificación proporcional, modelos configurables, checks, revisión y reanudación por proyecto. Este hito consolida la continuidad local y deja Supermemory v5 como piloto explícito. La memoria global entre proyectos se pospone. La v0.1 completa todavía requiere comprobar las otras capacidades descritas en [docs/PLAN.md](docs/PLAN.md).

## Fuentes de verdad

| Lugar | Responsabilidad |
|---|---|
| `AGENTS.md` | Reglas breves y obligatorias para trabajar en el proyecto |
| `docs/PLAN.md` y documentos de feature | Decisiones, requisitos y pendientes duraderos |
| `MEMORY.md` | Cache local breve para reanudar; ignorada por Git |
| `harness/.local/` | Runs, ownership, journals, cola, recibos y métricas; ignorados por Git |
| Git | Versiones y evidencia verificable |
| Supermemory | Experimento complementario que requiere selección expresa |

La cache conserva hasta cinco fechas locales distintas de actividad real, cinco puntos por fecha y ninguna caducidad por pausa. El compositor de cache y recuerdos opcionales tiene un límite conjunto de 150 líneas y 8192 bytes UTF-8, incluidos metadata y títulos. Antes de registrar decisiones o pendientes en cache, guardarlos en su documento duradero. Al retomar, contrastar repo, worktree, rama, commit, aceptación y código con Git y disco. Un recuerdo no reemplaza las instrucciones vigentes.

## Instalación y continuidad local

Requiere Node.js 22+. En Windows/PowerShell, desde un checkout versionado:

```powershell
npm ci
node bin/harness.mjs init --project C:\ruta\a\proyecto
node bin/harness.mjs validate --project C:\ruta\a\proyecto
node bin/harness.mjs install --runtime codex --project C:\ruta\a\proyecto
node bin/harness.mjs install --runtime codex --project C:\ruta\a\proyecto --apply
```

`install` muestra preview y `--apply` copia recursos versionados a `.agents/`. La actualización respeta hashes y detiene conflictos con archivos editados por el usuario. `init` añade `/MEMORY.md` al `.gitignore` raíz y excluye `harness/.local/`; no reemplaza reglas existentes. Si `MEMORY.md` ya estaba rastreado, hay que quitarlo del índice conservando la copia local.

Esta entrega usa `0.1.0-alpha.3`. Los manifiestos `0.1.0-alpha.2` siguen validando, pero una instalación nueva desde este checkout requiere actualizar explícitamente `harnessVersion` del proyecto después de revisar el preview. Los antiguos `memory.readOnStart` y `memory.writeOnCheckpoint` se aceptan por compatibilidad y ya no activan red.

Al iniciar o retomar:

```powershell
node .agents/harness/bin/harness.mjs doctor --project .
node .agents/harness/bin/harness.mjs config --project .
node .agents/harness/bin/harness.mjs runs --project . --verify
node .agents/harness/bin/harness.mjs memory-render --project .
```

Cargar la cache una sola vez mediante el compositor. `memory-recall` sin flags produce el mismo contexto local y comunica que el piloto remoto está desactivado, incluso si hay clave. No abrir `MEMORY.md` ni sumar resultados remotos por otro canal. Guardar actividad real con `memory-record --project . --kind progress --text "Resumen breve" --ref docs/PLAN.md --session-id ID --agent-id coordinator`; el comando comprueba que la fuente contenga el texto. Lecturas y limpiezas no crean actividad.

Los runs usan `begin`, `checkpoint`, `runs --verify`, `review-record`, `review-status` y `end`. `checkpoint` exige run y token; `--check-command`, `--check-result` y `--check-scope` declaran checks ejecutados por el invocador. `runs --verify` informa vigencia del snapshot de cada check. Ante un checkpoint interrumpido, ejecutar `checkpoint --project . --run ID --token TOKEN --recover` tras revisar ownership; conserva el ID y payload originales. No liberar locks mientras algún worker pueda escribir. Un reviewer declarado independiente sigue siendo una declaración hasta comprobar su identidad con el runtime.

## Piloto Supermemory

`SUPERMEMORY_API_KEY` solo aporta la credencial; cada operación de red requiere `--pilot`. Los manifiestos existentes siguen siendo válidos; `memory.readOnStart` y `memory.writeOnCheckpoint` anteriores no habilitan automatización remota. Se usa `memory.namespace` o `projectId` como namespace aislado. El destino se fija por evento y recibo. La API del proveedor puede procesar documentos de forma asíncrona: aceptación no significa extracción ni recuerdo recuperable.

```powershell
node .agents/harness/bin/harness.mjs memory-publish --project . --pilot --text "Resumen inocuo que consta en docs/PLAN.md" --ref docs/PLAN.md --session-id piloto-1 --agent-id coordinator
node .agents/harness/bin/harness.mjs memory-status --project .
node .agents/harness/bin/harness.mjs memory-sync --project . --pilot --event ID
node .agents/harness/bin/harness.mjs memory-processing --project . --pilot --event ID --wait-seconds 300
node .agents/harness/bin/harness.mjs memory-recall --project . --pilot --query "Resumen inocuo"
node .agents/harness/bin/harness.mjs memory-usage --project . --days 7 --project-days 30
```

`memory-publish` prepara un solo evento local, con texto de hasta 2048 bytes y fuente comprobada. `memory-sync` solo envía el ID elegido; no vuelca toda la cola. Para un evento antiguo sin destino fijo se exige `--namespace` y se bloquea cualquier intento o recibo incompatible. Un POST de resultado incierto se reconcilia por ID antes de reenviar; no hay reintento ciego. Ante 402/429 o caída, la continuidad local persiste y el evento permanece pendiente. `memory-status` es local; `memory-processing --pilot` consulta documento y extracción, y comprueba búsqueda recuperable si el proveedor informa ambos como terminados.

`memory-usage` agrega peticiones observadas de agentes y worktrees accesibles del mismo proyecto. Muestra búsquedas, escrituras, consultas de estado, reintentos, errores, bytes enviados y última operación exitosa. Proyecta treinta días con tasa diaria constante. Los SM tokens facturados y el saldo real son desconocidos hasta consultar la cuenta; el saldo puede compartirse con otros clientes y proyectos. Bytes enviados, tokens del contexto y SM tokens facturados son unidades distintas. No se activan rerank, rewrite, extracción instantánea, recargas ni compras. La consulta oficial de facturación requiere permisos de propietario o administrador y se hace manualmente en la cuenta; [facturación](https://supermemory.ai/docs/overview/billing) y [tarifas](https://supermemory.ai/pricing/).

Si se dispone de contadores oficiales, [docs/MEMORY.md](docs/MEMORY.md) explica cómo introducir un resumen numérico bajo `harness/.local/` y compararlo con `memory-usage --official-file`, sin subir datos de la cuenta a Git.

## Evidencia y límites

`npm test` usa fixtures y HTTP simulado, sin credenciales. `npm run check` comprueba sintaxis. La [tabla de compatibilidad](docs/compatibility.md) distingue mocks, procesos CLI, sesiones reales y servicio. La instalación y los locks son locales al host; no hay exclusión entre máquinas. La transferencia automática real de modelos, un reviewer identificado por el runtime y el piloto remoto real siguen pendientes de evidencia antes de declarar v0.1 completa.
