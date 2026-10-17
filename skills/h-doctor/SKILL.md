---
name: h-doctor
description: Diagnostica la instalación y la configuración del harness sin modificar el proyecto.
---

Ejecutar `node .agents/harness/bin/harness.mjs doctor --project .` y `node .agents/harness/bin/harness.mjs validate --project .`. Leer `.agents/harness/workflows/builtin.md` desde la raíz del proyecto para interpretar límites. Distinguir archivos presentes, capacidad del runtime demostrada y servicios conectados. Informar errores sin ejecutar comandos del producto ni instalar dependencias.
