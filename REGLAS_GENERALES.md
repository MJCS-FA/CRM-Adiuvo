# Reglas Generales del Proyecto

Version: 0.1  
Fecha: 2026-03-24

## 1. Objetivo
Construir una aplicación mantenible, segura y fácil de evolucionar para la gestión de visitas médicas.

## 2. Principios de trabajo
- Simplicidad primero: evitar complejidad innecesaria.
- Consistencia: seguir convenciones comunes en todo el código.
- Calidad continua: preferir cambios pequeños, probados y revisables.
- Seguridad por defecto: no exponer información sensible.
- Documentación viva: documentar decisiones clave y mantenerlas actualizadas.

## 3. Estándares de código
- Usar nombres descriptivos para variables, funciones y archivos.
- Mantener funciones cortas y con una sola responsabilidad.
- Evitar duplicación de lógica; extraer utilidades reutilizables.
- Escribir comentarios solo cuando agreguen contexto no obvio.
- No mezclar cambios funcionales con refactors grandes en el mismo commit.

## 4. Estructura base sugerida
- `src/`: lógica principal de la aplicación.
- `public/`: entradas públicas, assets y archivos expuestos por el servidor.
- `config/`: configuraciones por entorno y parámetros globales.
- `tests/`: pruebas automatizadas.
- `docs/`: documentación técnica y funcional.

## 5. Git y ramas
- Rama principal: `main` siempre estable.
- Nuevas funcionalidades: ramas `feature/<tema>`.
- Correcciones: ramas `fix/<tema>`.
- Cambios urgentes de producción: ramas `hotfix/<tema>`.
- Toda integración a `main` debe pasar por Pull Request.

## 6. Commits
- Formato recomendado: Conventional Commits.
- Ejemplos:
  - `feat: agregar listado de visitas por médico`
  - `fix: corregir filtro de fechas en histórico`
  - `docs: actualizar reglas generales`
- Cada commit debe representar una unidad de cambio clara.

## 7. Calidad mínima antes de merge
- El código compila/ejecuta sin errores.
- Las pruebas automatizadas pasan.
- No hay credenciales ni secretos en el repositorio.
- Se actualiza documentación si cambia comportamiento.
- Se valida impacto en módulos relacionados.

## 8. Seguridad y datos
- Prohibido subir claves, tokens o contraseñas al repositorio.
- Usar variables de entorno para configuración sensible.
- Validar entradas del usuario en backend.
- Escapar/sanitizar salidas según el contexto.
- Registrar errores sin exponer datos personales.

## 9. Definición de terminado (DoD)
Un cambio se considera terminado cuando:
- Cumple el requerimiento funcional acordado.
- Incluye pruebas o evidencia de validación.
- Tiene revisión de código (cuando aplique).
- Está documentado de forma suficiente para mantenimiento.

## 10. Regla de evolucion
Estas reglas son base inicial. Cualquier ajuste debe quedar registrado en este archivo con fecha y breve razón del cambio.
