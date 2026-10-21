# 📐 Plan Maestro de Reparación Técnica y Diseño de Interfaces — GastosApp

Este plan descompone y especifica técnicamente la resolución de los **11 problemas críticos** y las principales debilidades de alto impacto detectadas en la auditoría integral, siguiendo las metodologías de **`planning-and-task-breakdown`**, **`api-and-interface-design`** y **`surgical-patch`**.

---

## 🌳 Grafo de Dependencias de Implementación

Para garantizar cero regresiones y evitar retrabajo, las correcciones deben ejecutarse en este orden estricto:

```
[Fase 1: Capa de Datos y Seguridad Base]
  ├── Tarea 1.1: Script RLS para Tablas Faltantes (Supabase)
  └── Tarea 1.2: Limpieza de Claves Criptográficas y Git (.gitignore)
         │
         ▼
[Fase 2: Núcleo del Backend y Contratos de Autenticación]
  ├── Tarea 2.1: Hardening de CORS y JWT en FastAPI (auth.py, main.py)
  ├── Tarea 2.2: Módulo Centralizado de Tiempo (VET_TZ America/Caracas)
  ├── Tarea 2.3: Atomicidad de Autogasto y Blindaje de Divisas (bcv_service.py, crud_fixed_expenses.py)
  └── Tarea 2.4: Rediseño del Contrato de Cron (/api/push/cron)
         │
         ▼
[Fase 3: Sincronización 'Panas' y Lógica Simétrica]
  ├── Tarea 3.1: Inversión Simétrica de Deudas Clonadas (sharing.py, crud_debts.py)
  ├── Tarea 3.2: Disolución de Recursos al Eliminar Pana (crud_connections.py)
  └── Tarea 3.3: Prevención de Deadlocks ABBA y Limpieza de Autogastos Huérfanos
         │
         ▼
[Fase 4: Frontend, PWA y Resiliencia de Red]
  ├── Tarea 4.1: Interceptor Axios 401 con Mutex y Auto-Refresco de JWT
  ├── Tarea 4.2: Code-Splitting con React.lazy() y Optimización de Bundle en Vite
  ├── Tarea 4.3: Sondeo Real en WakeUpLoader y Manejo de Errores en Dashboard
  └── Tarea 4.4: Optimización O(1) en Lista de Gastos (React.memo)
         │
         ▼
[Fase 5: Sincronización de Automatizaciones Externas]
  ├── Tarea 5.1: Alineación de Vercel Cron con el Backend (vercel.json, notifications.ts)
  └── Tarea 5.2: Eliminación de sleep(2) y Deduplicación Diaria de Notificaciones
```

---

## 🛠️ Especificaciones Técnicas y Diseño de Interfaces

### 1. Diseño de Políticas RLS de Supabase (`rls_v2_savings_budgets_shares.sql`)
* **Problema atendido:** `SEC-01`
* **Especificación:**
  * Habilitar RLS en: `saving_goals`, `saving_deposits`, `monthly_budgets`, `budget_category_limits`, `shares`, `share_members`, `shared_fixed_expenses`, `shared_debts`, `shared_saving_goals`.
  * Políticas de tenencia directa `auth.uid() = user_id` para `saving_goals` y `monthly_budgets`.
  * Políticas relacionales vía `EXISTS` para tablas hijas (`saving_deposits` vinculada a `saving_goals.user_id = auth.uid()` o membresía en share).
  * Políticas de membresía para `shares` y `share_members`.

### 2. Diseño del Contrato de Seguridad en Backend (`auth.py` y `main.py`)
* **Problemas atendidos:** `SEC-03`, `SEC-04`
* **Especificación:**
  * En `main.py`: Reemplazar `allow_origins=["*"]` con una lista blanca leída de `ALLOWED_ORIGINS` (por defecto `http://localhost:5173,https://gastosapp.vercel.app`), manteniendo `allow_credentials=True`.
  * En `auth.py`:
    * Algoritmos fijados estrictamente a `["ES256", "RS256"]` (eliminar `HS256` del decode asimétrico).
    * Validar `audience="authenticated"` e `issuer=f"{SUPABASE_URL}/auth/v1"`.
    * Añadir TTL de 1 hora al caché en memoria de JWKS (`_jwks_cache_time`).

### 3. Diseño de la Atomicidad en Autogasto y Servicio BCV (`crud_fixed_expenses.py` y `bcv_service.py`)
* **Problemas atendidos:** `FIN-01`, `FIN-02`, `FIN-03`, `FIN-04`, `FIN-05`
* **Especificación:**
  * En `routers/fixed_expenses.py`: No invocar `crud.create_expense` con commit previo. Delegar la creación del autogasto dentro de `crud_fixed_expenses.check_fixed_expense` usando `db.flush()` en la misma transacción SQLAlchemy. Si el check falla por restricción única o duplicado, la sesión ejecuta rollback automático y no persiste ningún gasto fantasma.
  * En `bcv_service.py`:
    * Envolver `Monitor(BCV).get_all_monitors()` con `await asyncio.to_thread(...)` con timeout de 8s.
    * No cachear diccionarios con `None` por 30 minutos; implementar retención de la última tasa válida.
    * Corregir `USD_CASH`: indexarlo a la tasa de mercado paralelo (`usdt_bs`) o BCV dólar, nunca a la tasa del Euro.
  * Módulo de tiempo: Crear `backend/app/time_utils.py` con `VET_TZ = ZoneInfo("America/Caracas")` y helpers `vet_today()` y `vet_now()`.

### 4. Diseño del Contrato de Simetría en Deudas Compartidas (`sharing.py`)
* **Problemas atendidos:** `PAN-01`, `PAN-02`, `PAN-04`, `PAN-05`
* **Especificación:**
  * Crear función especializada `_clone_debt_data(entity: models.Debt, creator_id: UUID, target_user_id: UUID)`:
    * Si `entity.type == "receivable"`, el clon recibe `type = "owed"`.
    * Si `entity.type == "owed"`, el clon recibe `type = "receivable"`.
    * Asignar como `counterpart` el `display_name` del creador (obtenido de `models.Profile`).
    * Excluir `type` y `counterpart` de `sync_parent_fields`.
  * Política de desconexión en `crud_connections.py:delete_connection`:
    * Al eliminar una conexión entre dos usuarios, buscar todos los shares compartidos de 2 miembros y disolverlos automáticamente (eliminando el `Share` pero manteniendo las deudas/gastos locales de cada usuario como registros personales independientes).
  * Concurrencia:
    * Ordenar determinísticamente las entidades por UUID antes de iterar en `fan_out_child_create`.
    * Limpiar autogastos vinculados antes de eliminar deudas clonadas en lote.

### 5. Diseño del Interceptor de Respuesta en Axios (`frontend/src/api.ts`)
* **Problema atendido:** `FRONT-01`
* **Especificación:**
  * Interceptar respuestas con status 401.
  * Si ya hay un refresco en curso (`isRefreshing`), encolar la promesa en `failedQueue`.
  * Si es la primera petición 401, marcar `isRefreshing = true` e invocar `supabase.auth.refreshSession()`.
  * Tras obtener el nuevo token, reintentar todas las peticiones encoladas con el nuevo Bearer token y resolverlas transparentemente.
  * Si la sesión expiró irreversiblemente, limpiar sesión y redirigir a `/login`.

### 6. Diseño de Code-Splitting y Optimización de Rendimiento (`App.tsx` y `vite.config.ts`)
* **Problemas atendidos:** `FRONT-02`, `FRONT-05`
* **Especificación:**
  * En `App.tsx`: Convertir las importaciones estáticas de rutas (`Budgets`, `SavingGoals`, `DebtList`, `FixedExpenses`, `PanasPage`, `RatesPage`, `SettingsPage`) a `React.lazy()` envueltas en un `<Suspense>` general.
  * En `vite.config.ts`: Configurar `manualChunks` dividiendo dependencias en: `vendor-react`, `vendor-supabase`, `vendor-firebase` y `vendor-ui`.
  * En `ExpenseList.tsx`: Reemplazar `categories.find()` en cada render por un `categoryMap = useMemo(...)` con acceso O(1) y envolver `ExpenseItem` en `React.memo()`.

### 7. Diseño del Contrato del Cron y Manejo de FCM (`vercel.json`, `notifications.ts`, `push.py`)
* **Problemas atendidos:** `NOTIF-01`, `NOTIF-02`, `NOTIF-03`
* **Especificación:**
  * En `vercel.json`: Reemplazar `"0 10 * * *"` por dos crons:
    * `"0 13 * * *"` (9:00 AM hora de Venezuela).
    * `"0 0 * * *"` (8:00 PM hora de Venezuela).
  * En `frontend/api/cron/notifications.ts`:
    * Validar `request.headers.authorization === Bearer ${CRON_SECRET}`.
    * Hacer `fetch` al endpoint real: `${BACKEND_URL}/api/push/cron?token=${CRON_SECRET}` con timeout de 8 segundos.
  * En `backend/app/routers/push.py`:
    * Aceptar el secreto vía `Authorization: Bearer <token>` o query param con `secrets.compare_digest`.
    * Eliminar `await asyncio.sleep(2)`.
    * Envolver `messaging.send()` en `asyncio.to_thread`.
    * Implementar deduplicación diaria verificando si ya existe un registro en `models.Notification` para ese usuario y concepto en el día en curso.

---

## 📋 Lista de Tareas Operativas

Las tareas detalladas para la fase de construcción se encuentran registradas en [`tasks/todo.md`](todo.md).
