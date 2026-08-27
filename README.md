# MI Dashboard

Dashboard para visualizar ejecuciones de pruebas, suites, casos e historial desde Supabase.

## Qué muestra

- Resumen general con métricas clave.
- Suites con sus casos relacionados y duración promedio.
- Casos únicos y sus ejecuciones relacionadas.
- Historial separado de ejecuciones y casos, con búsqueda, orden y paginación.
- Ejecuciones con acceso a reportes HTML interactivos y descarga directa.
- Fallos recientes con acceso rápido al reporte.

## Requisitos

- Node.js 20 o superior.
- Una base de datos en Supabase con estas tablas:
  - `public.executions`
  - `public.execution_tests`
  - `public.caso_grupo`

## Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto con:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu_clave_publicable
```

Si necesitas leer datos con permisos elevados, el proyecto también soporta claves privadas de Supabase desde variables como:

```env
SUPABASE_SECRET_KEY=tu_clave_secreta
SUPABASE_SECRET_KEYS=tu_clave_secreta
```

Para lanzar ejecuciones desde la UI, agrega además:

```env
GITHUB_TOKEN=tu_github_pat
GITHUB_REPOSITORY=jermaburgos/ProyectoBaseAutomatizacionSelenium
GITHUB_WORKFLOW_FILE=run-single-test.yml
GITHUB_GROUPS_WORKFLOW_FILE=run-groups.yml
GITHUB_WORKFLOW_REF=feature/webYourStore
GITHUB_API_VERSION=2026-03-10
```

## Instalación

```bash
npm install
```

## Ejecución local

```bash
npm run dev
```

Abre `http://localhost:3000`.

## Scripts

- `npm run dev`: arranca el servidor de desarrollo.
- `npm run build`: compila la aplicación para producción.
- `npm run start`: ejecuta la build en modo producción.
- `npm run lint`: revisa el código con ESLint.

## Estructura de la app

- `app/page.tsx`: carga los datos y renderiza el dashboard.
- `app/components/dashboard-shell.tsx`: interfaz principal.
- `app/lib/dashboard.ts`: lógica de lectura, filtros, métricas y formateo.
- `app/api/report/preview`: vista previa HTML del reporte con reescritura de URLs relativas.
- `app/api/report/download`: descarga directa del archivo del reporte.
- `app/api/report`: exportación CSV de ejecuciones.

## Reportes

Cada ejecución puede incluir:

- Vista rápida: abre el reporte HTML dentro del dashboard.
- Descarga: baja el archivo asociado directamente.

## Lanzar ejecución

La sección `Lanzar ejecución` permite elegir entre dos modos:

- `Prueba unitaria`: muestra los casos únicos detectados en la base de datos y envía el `test_name` seleccionado al workflow `run-single-test.yml`.
- `Suite / grupo`: muestra las suites existentes y envía un `test_groups` separado por comas al workflow `run-groups.yml`.

El backend expone `POST /api/github/dispatch` y usa las variables de entorno anteriores para llamar a la API de GitHub sin exponer el token en el navegador.

## Datos esperados

La UI consume principalmente:

- `executions`: ejecuciones generales.
- `execution_tests`: detalle de pruebas por ejecución.
- `caso_grupo`: relación entre casos y grupos.

Campos relevantes:

- `xml_test_name`
- `browser`
- `started_at`
- `finished_at`
- `duration_ms`
- `total_tests`
- `passed_tests`
- `failed_tests`
- `skipped_tests`
- `approval_percentage`
- `verdict`
- `report_url`
- `metadata`

## Notas

- La vista está optimizada para escritorio y mobile.
- Las tablas incluyen orden, paginación y navegación responsive.
- Los reportes HTML se sirven a través de endpoints internos para mantener la experiencia dentro de la app.
