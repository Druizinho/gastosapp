# 📘 Documentación Detallada: Arquitectura, Funcionamiento y Catálogo de Archivos de GastosApp

Este documento contiene la explicación técnica exhaustiva de cómo funciona **GastosApp**, su arquitectura de capas, el flujo de datos entre componentes, los modelos de base de datos y la descripción detallada de cada archivo del proyecto.

---

# 📑 Índice

1. [Visión General de GastosApp](#1-visión-general-de-gastosapp)
2. [Arquitectura del Sistema y Flujo de Datos](#2-arquitectura-del-sistema-y-flujo-de-datos)
3. [Funcionamiento Detallado por Módulos](#3-funcionamiento-detallado-por-módulos)
   - [3.1 Autenticación y Perfil de Usuario](#31-autenticación-y-perfil-de-usuario)
   - [3.2 Motor Multidivisa y Conversiones Históricas](#32-motor-multidivisa-y-conversiones-históricas)
   - [3.3 Gastos Diarios y Balance](#33-gastos-diarios-y-balance)
   - [3.4 Motor de Presupuestos Mensuales (Budgets Engine)](#34-motor-de-presupuestos-mensuales-budgets-engine)
   - [3.5 Hub de Herramientas Financieras (Tools Hub)](#35-hub-de-herramientas-financieras-tools-hub)
   - [3.6 Finanzas Colaborativas ("Panas") y Compartición Unificada](#36-finanzas-colaborativas-panas-y-compartición-unificada)
   - [3.7 Sistema de Notificaciones Push (FCM), Cron Jobs y Bandeja In-App](#37-sistema-de-notificaciones-push-fcm-cron-jobs-y-bandeja-in-app)
   - [3.8 Sistema de Categorías Dinámicas y Visuales](#38-sistema-de-categorías-dinámicas-y-visuales)
   - [3.9 Progressive Web App (PWA) y Mecanismo Antidormida](#39-progressive-web-app-pwa-y-mecanismo-antidormida)
4. [Modelo de Datos Canónico (PostgreSQL V4 - 18 Tablas)](#4-modelo-de-datos-canónico-postgresql-v4---18-tablas)
5. [Catálogo Exhaustivo de Archivos del Proyecto](#5-catálogo-exhaustivo-de-archivos-del-proyecto)
   - [Raíz del Proyecto](#raíz-del-proyecto)
   - [Backend (`backend/app/`)](#backend-backendapp)
   - [Frontend (`frontend/src/`)](#frontend-frontendsrc)

---

# 1. Visión General de GastosApp

**GastosApp** es una Progressive Web App (**PWA**) concebida bajo la filosofía *mobile-first*, diseñada para resolver los desafíos particulares de la administración financiera personal y colaborativa:

1. **La economía multimoneda:** En economías inflacionarias o bimonetarias (como Venezuela), las transacciones conviven entre Bolívares (`BS`), Dólares en efectivo (`USD_CASH`), Dólares oficiales (`USD_BCV`), Euros oficiales (`EUR_BCV`) y criptomonedas estables (`USDT` Binance P2P). GastosApp congela las tasas de cambio de cada transacción al momento del gasto, preservando el valor adquisitivo histórico exacto.
2. **Presupuestación inteligente:** Control de límites mensuales asignados por categoría con clonado automático entre meses y semáforos de advertencia.
3. **Finanzas compartidas en la vida real:** Parejas, roomies, socios o familiares que comparten deudas, gastos fijos (alquiler, servicios) o metas de ahorro pueden sincronizar sus balances mediante la red de **"Panas"** con roles y cuentas espejo automáticas.

---

# 2. Arquitectura del Sistema y Flujo de Datos

```
┌──────────────────────────────────────────────────────────────────┐
│                   Cliente PWA (React 19 + Vite)                  │
│       Service Worker (sw.ts) + Cache Workbox + Web Push FCM      │
└─────────────────┬───────────────────────────────┬────────────────┘
                  │                               │
        Token Bearer JWT                  Peticiones Axios
                  │                               │
                  ▼                               ▼
       ┌─────────────────────┐        ┌────────────────────────────┐
       │    Supabase Auth    │        │      FastAPI Backend       │
       │ (Gestión de Cuentas)│        │   (SQLAlchemy 2.0 Async)   │
       └─────────────────────┘        └─────────────┬──────────────┘
                                                    │
                 ┌──────────────────────────────────┼──────────────────────────────────┐
                 ▼                                  ▼                                  ▼
      ┌─────────────────────┐            ┌─────────────────────┐            ┌─────────────────────┐
      │  Supabase Database  │            │ Firebase Admin SDK  │            │  BCV & Binance P2P  │
      │ PostgreSQL con RLS  │            │   Push Messaging    │            │   Tasas en Tiempo   │
      └─────────────────────┘            └─────────────────────┘            └─────────────────────┘
```

### Flujo de una petición típica:
1. **El usuario interactúa en la app** (por ejemplo, registra un gasto en bolívares).
2. **El cliente (Axios)** intercepta la petición, extrae el token de sesión de Supabase Auth y lo añade en la cabecera `Authorization: Bearer <jwt_token>`.
3. **El backend (FastAPI)** recibe la petición:
   - El middleware `get_current_user` valida la firma del token mediante las llaves públicas JWKS de Supabase (guardadas en memoria con TTL) y extrae el `user_id`.
   - Consulta el servicio de tasas (`bcv_service.py`), el cual tiene en caché la cotización actual del BCV y Binance P2P.
   - Calcula el equivalente del monto en `USD_BCV`, `EUR_BCV`, `USDT` y `BS`.
   - Guarda el registro en la base de datos PostgreSQL de Supabase.
   - Devuelve la respuesta serializada al cliente mediante modelos Pydantic v2.
4. **El cliente actualiza el estado de React**, refrescando la lista y el resumen general sin parpadeos.

---

# 3. Funcionamiento Detallado por Módulos

## 3.1 Autenticación y Perfil de Usuario
- **Supabase Auth:** Administra usuarios y sesiones con contraseñas seguras o Magic Links.
- **Validación JWT sin latencia:** El backend no consulta la base de datos para saber quién hace la petición. Lee el JSON Web Token (JWT) firmado criptográficamente por Supabase y valida su autenticidad usando el endpoint de JWKS (`.well-known/jwks.json`), que queda cacheado en memoria.
- **Creación automática de perfil:** En PostgreSQL, un trigger (`handle_new_user`) detecta cuando un usuario nuevo se registra y automáticamente inserta una fila en `profiles` y genera las categorías iniciales predeterminadas (*Alimentación, Transporte, Vivienda, Ocio, Salud*).

## 3.2 Motor Multidivisa y Conversiones Históricas
- **Monedas soportadas:** `BS`, `USD_BCV`, `EUR_BCV`, `USDT` y `USD_CASH`.
- **Scraping y Caché:**
  - Las tasas oficiales se extraen mediante `pyDolarVenezuela`.
  - La tasa de USDT se extrae directamente de la API P2P de Binance buscando órdenes de compra verificadas.
  - Se utiliza `cachetools.TTLCache` con un tiempo de expiración de 30 minutos (1800 segundos), evitando saturar los servicios externos y asegurando respuestas ultrarrápidas.
- **Preservación histórica:** Cada gasto guarda columnas separadas: `amount_bs`, `amount_usd`, `amount_eur`, `amount_usdt` junto con las tasas de conversión vigentes en ese día (`rate_usd_bs`, etc.).

## 3.3 Gastos Diarios y Balance
- **CRUD Completo:** Creación, lectura, edición y eliminación de gastos con filtros rápidos (Hoy, Semana, Mes, Año, Todo el historial) o rango personalizado por selector de fechas.
- **Resúmenes estadísticos:** El endpoint `/api/expenses/summary-range` calcula sumas acumuladas por moneda, promedio de gasto diario y desglose porcentual por categoría.
- **Categorías con reasignación segura:** Si un usuario elimina una categoría, los gastos asociados no se pierden: se reasignan automáticamente a la categoría `"Sin Categoría"`.

## 3.4 Motor de Presupuestos Mensuales (Budgets Engine)
- **Archivos:** `backend/app/routers/budgets.py`, `backend/app/crud_budgets.py`, `frontend/src/components/Budgets.tsx`.
- **Límites por Categoría y Techo Efectivo:** Cada categoría puede tener un límite monetario asignado. El sistema calcula en tiempo real el monto ejecutado consumido por los gastos registrados en ese mes. El techo global del presupuesto (`effective_global_limit`) se obtiene sumando los límites asignados a cada categoría.
- **Clonado Automático entre Meses:** Al consultar un nuevo mes (`YYYY-MM`) que aún no ha sido configurado, el motor localiza el presupuesto del mes anterior, duplica la estructura de categorías y límites, y lo marca como no confirmado (`is_confirmed = false`), permitiendo al usuario aceptarlo con un botón o modificarlo sin rehacer el trabajo.
- **Alertas Proactivas de Consumo:** El cron evalúa el porcentaje gastado del presupuesto global y de cada categoría. Cuando se alcanza el 80% o el 100%, emite una notificación push personalizada y marca las columnas `notified_80` o `notified_100` para evitar envíos duplicados.

## 3.5 Hub de Herramientas Financieras (Tools Hub)
1. **Gastos Fijos (`fixed_expenses`):** Compromisos periódicos con día de corte mensual (`payment_day`), historial mensual de pagos (`fixed_expense_checks`) y opción de convertir el pago directamente en un gasto real del Dashboard (`create_expense = true`).
2. **Deudas Nuestras (Owed) y Por Cobrar (Receivable):** Registro de préstamos y deudas con historial de abonos parciales, cálculo dinámico de remanente y liquidación automática al 100% (`is_settled = true`).
3. **Ingresos Estimados (`estimated_incomes`):** Proyección de cobros mensuales con confirmación real (`income_checks`), abonos parciales y reprogramación de fechas pendientes (`pending_date`).
4. **Metas de Ahorro (`saving_goals`):** Creación de fondos de ahorro con importe objetivo, fecha límite, depósitos progresivos (`saving_deposits`) con opción de vincularlos como gastos reales, barra de progreso y felicitación festiva con confeti al alcanzar el 100%.

## 3.6 Finanzas Colaborativas ("Panas") y Compartición Unificada
- **Arquitectura Multimiembro (`shares` y `share_members`):**
  - Los miembros se asocian directamente al ítem compartido (deuda, gasto fijo o fondo de ahorro).
  - Jerarquía de roles: Creador/Dueño (`admin`), Administradores (`admin`) y Miembros (`member`).
  - Cuentas espejo: Al compartir una deuda o gasto fijo, el backend crea un registro espejo en la cuenta del pana conectado (ej. deuda "Por Pagar" para uno y "Por Cobrar" para el otro) y sincroniza los abonos y pagos mediante `sync_id`.

## 3.7 Sistema de Notificaciones Push (FCM), Cron Jobs y Bandeja In-App
- **Tecnología:** Firebase Cloud Messaging (FCM) + Web Push API integrada en `sw.ts`.
- **Registro:** El cliente solicita permisos y envía su token FCM al backend (`/api/push/subscribe`).
- **Historial In-App:** Cada alerta enviada se guarda en la tabla `notifications`. El usuario puede verlas en cualquier momento desde el icono de campana en la barra superior (`NotificationSheet`).
- **Ventanas del Cron Dual (`/api/push/cron`):**
  - **Ventana de la Mañana (9:00 AM UTC-4):** Gastos fijos que vencen hoy, recordatorios de vencidos ayer, ingresos previstos y deudas vencidas.
  - **Ventana de la Noche (8:00 PM UTC-4):** Recordatorio preventivo de vencimientos de mañana y alerta de inactividad (3+ días sin registros).

## 3.8 Sistema de Categorías Dinámicas y Visuales
- **Archivos:** `frontend/src/context/CategoriesContext.tsx`, `frontend/src/utils/categoryVisuals.ts`, `frontend/src/components/CategoryManager.tsx`.
- Paleta semántica de 12 colores, catálogo de 44+ íconos Lucide y mapeo heurístico por nombre.

## 3.9 Progressive Web App (PWA) y Mecanismo Antidormida
- **Instalabilidad:** Cuenta con `manifest.webmanifest`, íconos adaptativos y soporte completo en Android, iOS y Desktop.
- **Service Worker (`sw.ts`):** Utiliza Workbox para precachear el frontend y Firebase Messaging para notificaciones en segundo plano.
- **Mecanismo Anti-suspensión en Render:** Tarea periódica en `main.py` (`_self_ping_loop`) que ejecuta una petición cada 10 minutos a `/health` para mantener el contenedor despierto.

---

# 4. Modelo de Datos Canónico (PostgreSQL V4 - 18 Tablas)

Consolidado en `schema.sql`:
1. `profiles`: Perfil de usuario, avatar y preferencias de notificación.
2. `categories`: Categorías por usuario con nombre, color e ícono.
3. `expenses`: Registro de transacciones con montos y tasas históricas en 5 monedas.
4. `fixed_expenses`: Catálogo de gastos fijos recurrentes mensuales.
5. `fixed_expense_checks`: Comprobantes mensuales de pago de gastos fijos.
6. `debts`: Deudas por pagar (`owed`) o por cobrar (`receivable`).
7. `debt_payments`: Abonos sobre deudas con amortización y cuentas espejo.
8. `estimated_incomes`: Proyección de ingresos del mes con fecha esperada.
9. `income_checks`: Comprobante mensual de cobro real (total o parcial).
10. `push_subscriptions`: Tokens FCM para notificaciones Web Push.
11. `notifications`: Historial persistente in-app con estado `is_read`.
12. `connections`: Solicitudes y vínculos de amistad ("Panas").
13. `saving_goals`: Metas de ahorro con monto objetivo y plazo.
14. `saving_deposits`: Aportes monetarios a fondos de ahorro.
15. `shares`: Entidad raíz de compartición (`debt`, `fixed_expense`, `saving_goal`).
16. `share_members`: Membresía y roles (`admin`, `member`) en ítems compartidos.
17. `monthly_budgets`: Cabecera del presupuesto mensual por usuario y mes (`YYYY-MM`).
18. `budget_category_limits`: Límites de gasto por categoría con control de alertas al 80% y 100%.

---

# 5. Catálogo Exhaustivo de Archivos del Proyecto

## Raíz del Proyecto
| Archivo | Propósito |
| :--- | :--- |
| `schema.sql` | Esquema DDL canónico de PostgreSQL con las 18 tablas, triggers, RLS e índices. |
| `README.md` | Guía de bienvenida, stack, instalación, despliegue y referencia de API. |
| `DOCUMENTACION_DETALLADA.md` | Este documento de referencia técnica exhaustiva. |
| `.gitignore` | Exclusiones de control de versiones. |
| `.antigravityignore` | Exclusiones de indexación para agentes de desarrollo. |

## Backend (`backend/app/`)
| Archivo | Propósito |
| :--- | :--- |
| `backend/app/main.py` | Entrada FastAPI, ciclo de vida, CORS, self-ping y registro de routers. |
| `backend/app/database.py` | Motor asíncrono SQLAlchemy (`asyncpg`), pool de conexiones y `get_db`. |
| `backend/app/models.py` | Modelos declarativos ORM de las 18 tablas. |
| `backend/app/schemas.py` | Modelos Pydantic v2 (DTOs) para validación de entrada/salida. |
| `backend/app/auth.py` | Validación JWT stateless contra el endpoint JWKS de Supabase. |
| `backend/app/bcv_service.py` | Scraping BCV, consulta P2P Binance y conversor de divisas con caché. |
| `backend/app/push_service.py` | Despacho de notificaciones push vía Firebase Admin SDK. |
| `backend/app/sharing.py` | Motor unificado de compartición y permisos jerárquicos de Panas. |
| `backend/app/crud.py` | Lógica de base de datos para gastos y categorías. |
| `backend/app/crud_budgets.py` | Motor de presupuestos mensuales, límites, clonado y alertas. |
| `backend/app/crud_debts.py` | Lógica de deudas, abonos y cuentas espejo. |
| `backend/app/crud_fixed_expenses.py` | Lógica de gastos fijos y comprobantes mensuales. |
| `backend/app/crud_incomes.py` | Lógica de ingresos estimados y cobros. |
| `backend/app/crud_savings.py` | Lógica de metas y depósitos de ahorro. |
| `backend/app/crud_connections.py` | Lógica de red de Panas y solicitudes. |
| `backend/app/routers/*.py` | 12 controladores REST específicos por dominio funcional. |

## Frontend (`frontend/src/`)
| Archivo / Directorio | Propósito |
| :--- | :--- |
| `frontend/src/main.tsx` | Montaje de React 19 en el DOM. |
| `frontend/src/App.tsx` | Enrutador principal, guards de autenticación y shell visual. |
| `frontend/src/api.ts` | Cliente Axios centralizado con interceptores automáticos de JWT. |
| `frontend/src/types.ts` | Definiciones e interfaces de TypeScript del sistema. |
| `frontend/src/sw.ts` | Service Worker para PWA (Workbox) y notificaciones de fondo (Firebase). |
| `frontend/src/context/` | Contextos de React (`AuthContext`, `NotificationContext`, `CategoriesContext`). |
| `frontend/src/pages/PanasPage.tsx` | Página principal de conexiones, balance con amigos e invitaciones. |
| `frontend/src/components/` | Componentes visuales organizados para Dashboard, Budgets, ToolsHub, Modales y Panas. |
| `frontend/src/utils/categoryVisuals.ts` | Mapeo de 12 colores semánticos y 44+ íconos Lucide. |
