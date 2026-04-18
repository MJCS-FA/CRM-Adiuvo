# VisitasMedicasAdiuvo

Aplicación web PWA (mobile-first) para gestión de visitas médicas.

## Stack Obligatorio Implementado
- Frontend: React + React Router + Ant Design
- Backend: Node.js + Express (archivo principal `backend/server.js`)
- Base de datos: MySQL
- Auth: JWT + validación real contra endpoint externo
- Offline: Service Worker + IndexedDB (cola y sincronización)

## Regla Crítica de Ruteo
Toda la app está configurada para ejecutarse bajo:

`/visitas`

Incluye:
- Router frontend con `basename="/visitas"`
- API en `/visitas/api/...`
- Manifest y service worker bajo `/visitas`
- Fallback SPA bajo `/visitas/*`
- Backend Express sirviendo frontend bajo `/visitas`

## Estructura del Proyecto

```text
.
|-- backend
|   |-- server.js
|   |-- package.json
|   |-- package-lock.json
|   |-- .gitignore
|   `-- src
|       |-- config
|       |-- controllers
|       |-- database
|       |   `-- migrations/001_init.sql
|       |-- middlewares
|       |-- repositories
|       |-- routes
|       |-- services
|       `-- utils
|-- frontend
|   |-- package.json
|   |-- package-lock.json
|   |-- vite.config.js
|   |-- .gitignore
|   |-- public
|   |   |-- manifest.webmanifest
|   |   `-- sw.js
|   `-- src
|       |-- app
|       |-- assets
|       |-- components
|       |-- context
|       |-- hooks
|       |-- layouts
|       |-- offline
|       |-- pages
|       |-- pwa
|       |-- routes
|       |-- services
|       |-- styles
|       `-- utils
`-- REGLAS_GENERALES.md
```

## Variables de Entorno

### Backend
Copiar `backend/.env.example` a `backend/.env`.

Variables clave:
- `PORT`
- `APP_BASE_PATH=/visitas`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORP_DB_HOST`
- `CORP_DB_PORT`
- `CORP_DB_NAME`
- `CORP_DB_USER`
- `CORP_DB_PASS`
- `PERSONAS_TABLE`
- `PERSONAS_USERNAME_COLUMN`
- `PERSONAS_CREDENTIALS_COLUMN`
- `OUTSYSTEMS_VERIFY_URL`

### Frontend
Copiar `frontend/.env.example` a `frontend/.env`.

Variables clave:
- `VITE_API_BASE_URL=/visitas/api`

## Instalación y Ejecución

1. Instalar dependencias del backend:
```bash
cd backend
npm install
```

2. Instalar dependencias del frontend:
```bash
cd ../frontend
npm install
```

3. Crear base de datos MySQL (ejemplo):
```sql
CREATE DATABASE visitas_medicas;
```

4. Ejecutar migración inicial:
- Archivo: `backend/src/database/migrations/001_init.sql`

5. Levantar en desarrollo:
```bash
cd backend
npm run dev
```

En otra terminal:
```bash
cd frontend
npm run dev
```

Servicios esperados:
- Frontend (Vite): `http://localhost:5173/visitas`
- Backend (Express): `http://localhost:4000/visitas`

6. Build de frontend:
```bash
cd frontend
npm run build
```

## Autenticación Real
Login backend:
- `POST /visitas/api/auth/login`

Payload:
```json
{
  "username": "astrid",
  "password": "holas"
}
```

El backend valida credenciales contra:
- `https://fep-dev.outsystemsenterprise.com/api/rest/general/VerificarPassword?Hash=...&Pass=...`

Flujo real:
- busca al usuario en `tblPersonas` por `Correo_electronico`
- toma `credenciales` como valor `Hash`
- envía `Pass` con la contraseña digitada por el usuario
- permite acceso solo cuando `isValid` es `true`

Si es valido:
- crea/recupera usuario local
- genera JWT
- devuelve sesión

## API Base
- `GET /visitas/api/health`
- `POST /visitas/api/auth/login`
- `GET /visitas/api/auth/me`
- `GET /visitas/api/visits`
- `POST /visitas/api/visits`

## Offline y Sincronización
- Service worker para cache base y navegación offline.
- IndexedDB para:
  - cache local de visitas
  - cola de mutaciones pendientes
- Si no hay red:
  - nuevas visitas se guardan localmente
  - quedan marcadas como pendientes de sincronización
- Al volver online:
  - sincronización manual desde pantalla de visitas

## UI / Design System
- Ant Design configurado con color principal `#1A67E2`
- Componentes reutilizables en `frontend/src/components/ui`:
  - botones (Primary, Secondary, Outline, Ghost, Danger, Danger Outline)
  - inputs, select, card, table, loader, badge, modal
- Layout mobile-first para uso tipo app.

## Notas de Seguridad
- No se hardcodean credenciales.
- Se usan variables de entorno.
- Endpoints protegidos con JWT.
- Manejo de errores centralizado en backend.

## Reglas Generales
Ver documento:
- [REGLAS_GENERALES.md](REGLAS_GENERALES.md)
