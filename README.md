# Plataforma de Gestión de Leads

Implementación de la Fase 1 y parte de la Fase 2 del plan: base de datos en
Supabase + Next.js (JavaScript) conectado, con login, listado de leads e
importación de Excel funcionando de punta a punta.

## 1. Configurar Supabase

1. Crea un proyecto en https://supabase.com.
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`
   completo (crea tablas, RLS, y la función `import_leads`).
3. Ve a **Authentication → Users** y crea manualmente los 1-2 usuarios
   iniciales (correo + contraseña). El perfil en `profiles` se crea solo
   gracias al trigger `on_auth_user_created`.
4. Ve a **Settings → API** y copia `Project URL` y `anon public key`.

## 2. Configurar el proyecto local

```bash
cp .env.local.example .env.local
# pega ahí NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Abre http://localhost:3000 — redirige a `/login`.

## 3. Qué ya funciona

- **Login** (`app/login/page.js`) con Supabase Auth.
- **Leads** (`app/leads/page.js`) — tabla con búsqueda, trae el embudo/etapa
  actual de cada lead si tiene uno asignado.
- **Importar Excel** (`app/imports/page.js`) — flujo completo: seleccionar
  archivo → detectar columnas (Nombre/Teléfono/Dirección/Correo, con o sin
  tildes) → vista previa con validación → confirmar → inserción en batch vía
  RPC `import_leads` (ignora duplicados por teléfono automáticamente). El
  correo es opcional (`null` permitido).

## 4. Qué falta (siguientes fases del plan)

- Pantalla y CRUD de **Embudos** y **Etapas** (`app/funnels/`).
- **Vista Kanban** con drag & drop (`components/kanban/`).
- **Detalle del lead** y edición (`app/leads/[id]/`).
- **Operaciones masivas** (selección múltiple, asignar a embudo/etapa).
- **Dashboard** con totales.

## 5. Estructura

```
app/
  layout.js, page.js, globals.css
  login/page.js
  leads/page.js
  imports/page.js
lib/
  supabase/client.js     ← cliente Supabase
  supabase/auth.js       ← login/logout/sesión
  excel/readExcel.js     ← lectura y detección de columnas del Excel
  validations/leads.js   ← validación de filas (nombre/teléfono obligatorios)
supabase/
  schema.sql             ← esquema completo: tablas, RLS, función import_leads
```