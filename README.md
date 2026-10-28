# 💰 GastosApp — Gestión Financiera Personal y Colaborativa (PWA Mobile-First)

![React 19](https://img.shields.io/badge/React-19-blue?logo=react&style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&style=for-the-badge)
![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&style=for-the-badge)
![SQLAlchemy 2.0](https://img.shields.io/badge/SQLAlchemy-2.0_Async-D71F00?logo=sqlalchemy&style=for-the-badge)
![Supabase PostgreSQL](https://img.shields.io/badge/Supabase-PostgreSQL_RLS-3ECF8E?logo=supabase&style=for-the-badge)
![Firebase Cloud Messaging](https://img.shields.io/badge/Firebase-FCM_Push-FFCA28?logo=firebase&style=for-the-badge)
![Workbox PWA](https://img.shields.io/badge/PWA-Workbox-purple?logo=pwa&style=for-the-badge)

**GastosApp** es una Progressive Web App (**PWA**) de vanguardia, concebida bajo la filosofía *mobile-first*, diseñada para transformar la gestión financiera personal y colaborativa. El sistema combina registro de gastos con conversión multidivisa en tiempo real (Bolívares, USD BCV, EUR BCV, USDT Binance P2P y USD Efectivo), un motor inteligente de presupuestos mensuales por categorías con auto-clonación, un ecosistema de herramientas financieras integradas (gastos fijos, deudas amortizables, ingresos proyectados y metas de ahorro) y una red social financiera ("Panas") con arquitectura unificada de compartición y sincronización de saldos entre usuarios.

---

## 📑 Tabla de Contenidos

- [✨ Características Principales](#-características-principales)
- [🏗 Arquitectura del Sistema](#-arquitectura-del-sistema)
- [🛠 Stack Tecnológico Completo](#-stack-tecnológico-completo)
- [📁 Estructura del Proyecto y Directorios Clave](#-estructura-del-proyecto-y-directorios-clave)
- [🔄 Módulos Funcionales Detallados](#-módulos-funcionales-detallados)
  - [1. Autenticación y Perfil de Usuario](#1-autenticación-y-perfil-de-usuario)
  - [2. Gastos Diarios y Motor Multidivisa en Tiempo Real](#2-gastos-diarios-y-motor-multidivisa-en-tiempo-real)
  - [3. Motor de Presupuestos Mensuales (Budgets Engine)](#3-motor-de-presupuestos-mensuales-budgets-engine)
  - [4. Herramientas Financieras (Tools Hub)](#4-herramientas-financieras-tools-hub)
  - [5. Red de Contactos ("Panas") y Arquitectura de Compartición](#5-red-de-contactos-panas-y-arquitectura-de-compartición)
  - [6. Sistema de Notificaciones Push (FCM), Cron Jobs y Bandeja In-App](#6-sistema-de-notificaciones-push-fcm-cron-jobs-y-bandeja-in-app)
  - [7. Sistema de Categorías Dinámicas y Visuales](#7-sistema-de-categorías-dinámicas-y-visuales)
- [🗄 Modelo Relacional Canónico (V4 - 18 Tablas)](#-modelo-relacional-canónico-v4---18-tablas)
- [🚀 Guía de Instalación y Configuración Local](#-guía-de-instalación-y-configuración-local)
- [🔐 Variables de Entorno](#-variables-de-entorno)
- [📡 Referencia Completa de API REST](#-referencia-completa-de-api-rest)
- [☁️ Despliegue en Producción](#-despliegue-en-producción)
- [🧹 Mantenimiento, Scripts y Flujo Git](#-mantenimiento-scripts-y-flujo-git)

---

## ✨ Características Principales

1. **Control de Gastos Diarios y Snapshot Multimoneda:**
   - Registro instantáneo con importe, descripción, categoría, fecha y moneda seleccionada.
   - Cálculo y persistencia de valores equivalentes en `BS`, `USD_BCV`, `EUR_BCV`, `USDT` y `USD_CASH`, congelando las tasas vigentes en el instante del gasto.
   - Posibilidad de sobrescribir la tasa con un valor manual personalizado por transacción.
   - Filtros de alta granularidad: Rangos de fecha (Hoy, Esta Semana, Este Mes, Este Año, Todo el Historial, Rango Personalizado) y montos mínimos/máximos.

2. **Motor de Presupuestos Mensuales y Límites por Categoría:**
   - Presupuestos independientes por mes (`YYYY-MM`) y por categoría con seguimiento del gasto ejecutado vs. límite asignado.
   - Tres modos de cálculo global: `manual` (monto fijado por el usuario), `single_income` (vinculado a un ingreso específico) y `all_incomes` (suma automática de todos los ingresos estimados del mes).
   - Mecanismo de **clonado automático inteligente**: al iniciar un nuevo mes, si no existe presupuesto, se heredan los límites del mes anterior con estado `is_confirmed = false` para revisión y confirmación en un clic.
   - Sistema de alertas preventivas que dispara notificaciones push al alcanzar el 80% y el 100% del presupuesto.

3. **Herramientas Financieras Especializadas (Tools Hub):**
   - **Gastos Fijos:** Control de compromisos periódicos con día de corte mensual, historial de pagos (`checks`) y opción de convertir el pago directamente en un gasto real del Dashboard.
   - **Deudas Nuestras (Owed) y Por Cobrar (Receivable):** Registro de préstamos y deudas con historial de abonos parciales, cálculo dinámico de remanente y liquidación automática al 100%.
   - **Ingresos Estimados:** Proyección de cobros mensuales con confirmación real, abonos parciales y reprogramación de fechas pendientes.
   - **Metas de Ahorro:** Creación de fondos de ahorro con importe objetivo, fecha límite, depósitos progresivos con opción de vincularlos como gastos reales, barra de progreso y felicitación festiva con confeti al alcanzar el 100%.

4. **Finanzas Colaborativas ("Panas") y Compartición Unificada:**
   - Búsqueda y conexión entre usuarios registrados mediante correo electrónico.
   - Arquitectura unificada de compartición (`shares` y `share_members`) con roles `admin` y `member`.
   - Generación automática de registros espejo en la cuenta del destinatario (por ejemplo, registrar una deuda crea automáticamente una deuda "Por Cobrar" simétrica en la cuenta del prestamista).
   - Sincronización bidireccional inmediata de abonos, pagos de gastos fijos y depósitos a metas compartidas.

5. **Monitor de Tasas en Vivo y Conversor Interactivo:**
   - Consulta automatizada del Dólar y Euro oficial del Banco Central de Venezuela (**BCV**).
   - Consulta directa del USDT mediante la API pública P2P de **Binance**.
   - Memoria caché en servidor con TTL de 30 minutos para evitar saturación y bloqueos de IP.
   - Calculadora y conversor interactivo bidireccional entre todas las divisas soportadas.

6. **Notificaciones Push Web (FCM), Cron Jobs y Bandeja In-App:**
   - Notificaciones Web Push nativas mediante Firebase Cloud Messaging (FCM) integradas en Service Worker (`sw.ts`).
   - Centro de notificaciones in-app con contador en tiempo real de mensajes no leídos y marcado masivo.
   - Disparador programado dual mediante Vercel Serverless Function (`api/cron/notifications.ts`):
     - **Ventana Matutina (9:00 AM VET / 13:00 UTC):** Gastos fijos por vencer hoy, deudas vencidas y cobros pendientes.
     - **Ventana Nocturna (8:00 PM VET / 00:00 UTC):** Vencimientos del día siguiente y alerta de inactividad (3+ días sin registros).

7. **Arquitectura PWA y Resiliencia en la Nube:**
   - PWA instalable en dispositivos móviles y de escritorio, con soporte de ejecución en segundo plano.
   - Bucle interno de **Self-Ping** cada 10 minutos en el backend para evitar la suspensión del contenedor en Render Free Tier.

---

## 🏗 Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Cliente Web / PWA (React 19)                         │
│   Vite + TypeScript + Workbox SW + NotificationContext + Categories    │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │                                        │
      Supabase Auth JWT                           REST API (HTTP/JSON)
  (Bearer Token en Headers)                  (Endpoints /api/*)
                │                                        │
                ▼                                        ▼
   ┌──────────────────────────┐             ┌────────────────────────────┐
   │    Supabase Auth JWKS    │             │      FastAPI Backend       │
   │  Validación asíncrona    │             │   SQLAlchemy 2.0 (Async)   │
   │   sin latencia de BD     │             │    asyncpg Connection Pool │
   └──────────────────────────┘             └────────────┬───────────────┘
                                                         │
         ┌───────────────────────┬───────────────────────┼───────────────────────┐
         │                       │                       │                       │
         ▼                       ▼                       ▼                       ▼
┌──────────────────┐   ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   Supabase DB    │   │  Firebase Admin   │   │  Tasas de Cambio  │   │    Vercel Cron    │
│  PostgreSQL 15+  │   │  Cloud Messaging  │   │ pyDolar / Scraping│   │ Serverless Func   │
│  18 Tablas + RLS │   │ (Web Push a FCM)  │   │   Binance P2P     │   │ /api/push/cron    │
└──────────────────┘   └───────────────────┘   └───────────────────┘   └───────────────────┘
```

### Capas de la Solución:
- **Capa Cliente (PWA):** React 19 con enrutador centralizado, gestión de estados mediante contextos especializados (`AuthContext`, `NotificationContext`, `CategoriesContext`), interceptores de peticiones Axios para inyección del JWT y Service Worker Workbox configurado con `injectManifest` para interceptar notificaciones push de Firebase en background.
- **Capa de Seguridad e Identidad:** Las peticiones viajan firmadas con tokens JWT emitidos por Supabase Auth. El backend FastAPI descarga y almacena en caché el juego de claves públicas (JWKS) del proyecto Supabase y verifica criptográficamente la firma del token sin consultar la base de datos en cada petición.
- **Capa de Servicios y Negocio (FastAPI):** Arquitectura modular dividida en routers específicos por dominio funcional. Utiliza sesiones asíncronas con SQLAlchemy 2.0 y `asyncpg` para máxima concurrencia y bajo consumo de memoria.
- **Capa de Persistencia (PostgreSQL en Supabase):** 18 tablas canónicas con integridad referencial estricta (`ON DELETE CASCADE` y `ON DELETE SET NULL`), índices sobre claves foráneas y fechas, y políticas de seguridad Row Level Security (RLS) habilitadas.

---

## 🛠 Stack Tecnológico Completo

### Frontend
- **Framework:** React 19.0.0
- **Lenguaje:** TypeScript 5.6+
- **Herramienta de Construcción:** Vite 6.0+
- **Enrutamiento:** React Router DOM v7
- **Estilos:** Custom Modern CSS Design System (variables CSS, temas oscuro/claro, tokens tipográficos y de elevación)
- **Íconos:** Lucide React (catálogo de más de 40 íconos semánticos)
- **Cliente HTTP:** Axios (con interceptores automáticos de autenticación y manejo de errores)
- **PWA & Offline:** Vite Plugin PWA (`vite-plugin-pwa`) y Workbox Service Worker
- **Push Client:** Firebase JS SDK v11 (módulo Messaging)

### Backend
- **Framework:** FastAPI 0.115+
- **Servidor ASGI:** Uvicorn
- **Lenguaje:** Python 3.10+
- **ORM:** SQLAlchemy 2.0 (Motor asíncrono con `create_async_engine`)
- **Driver de BD:** `asyncpg`
- **Validación de Datos:** Pydantic v2
- **Criptografía & Auth:** PyJWT y `cryptography` para validación de JWKS de Supabase
- **Cliente HTTP Asíncrono:** HTTPX (para consulta de tasas BCV, Binance P2P y bucle de self-ping)
- **Web Scraping:** BeautifulSoup4 y `pyDolarVenezuela`
- **Push Server:** Firebase Admin SDK (Python)

### Base de Datos & Servicios en la Nube
- **Base de Datos:** Supabase PostgreSQL 15+ con Row Level Security (RLS)
- **Autenticación:** Supabase Auth (GoTrue con JWKS asimétrico RS256)
- **Hospedaje Backend:** Render (Web Service con contenedor Linux)
- **Hospedaje Frontend:** Vercel (Edge Network + Serverless Functions)
- **Orquestación de Cron:** Vercel Cron Jobs (`vercel.json`) invocando `/api/cron/notifications.ts`
- **Servicio Push:** Firebase Cloud Messaging (FCM Web Push)

---

## 📁 Estructura del Proyecto y Directorios Clave

```
gastosapp/
├── schema.sql                    # Esquema DDL canónico de PostgreSQL (V4 - 18 tablas)
├── rls_policies.sql              # Políticas RLS generales para tablas personales
├── rls_connections.sql           # Políticas RLS para la red de Panas y compartición
├── migrate_*.sql                 # Scripts históricos de migración (consolidados en schema.sql)
├── README.md                     # Documentación técnica maestra del sistema
│
├── backend/
│   ├── app/
│   │   ├── auth.py               # Decodificación y validación de Supabase JWKS JWT
│   │   ├── bcv_service.py        # Scraping de BCV, API Binance P2P y conversiones
│   │   ├── crud.py               # Lógica de base de datos para gastos y resúmenes
│   │   ├── crud_budgets.py       # Motor de presupuestos, límites, clonación y alertas
│   │   ├── crud_connections.py   # Lógica de conexiones entre usuarios ("Panas")
│   │   ├── crud_debts.py         # Lógica de deudas, amortizaciones y cuentas espejo
│   │   ├── crud_fixed_expenses.py# Lógica de gastos fijos y comprobantes mensuales
│   │   ├── crud_incomes.py       # Lógica de ingresos proyectados y confirmaciones
│   │   ├── crud_savings.py       # Lógica de fondos de ahorro y depósitos
│   │   ├── database.py           # Conexión asyncpg y generador de sesiones get_db
│   │   ├── main.py               # Inicialización FastAPI, lifespan y self-ping loop
│   │   ├── models.py             # Modelos declarativos ORM de SQLAlchemy 2.0
│   │   ├── push_service.py       # Despacho de notificaciones push vía Firebase Admin
│   │   ├── schemas.py            # DTOs de entrada y salida con Pydantic v2
│   │   ├── sharing.py            # Motor unificado de compartición de entidades
│   │   ├── time_utils.py         # Utilidades de hora legal de Venezuela (UTC-4)
│   │   └── routers/
│   │       ├── budgets.py        # Endpoints /api/budgets
│   │       ├── categories.py     # Endpoints /api/categories
│   │       ├── connections.py    # Endpoints /api/connections
│   │       ├── debts.py          # Endpoints /api/debts
│   │       ├── expenses.py       # Endpoints /api/expenses
│   │       ├── fixed_expenses.py # Endpoints /api/fixed-expenses
│   │       ├── incomes.py        # Endpoints /api/incomes
│   │       ├── notifications.py  # Endpoints /api/notifications
│   │       ├── profiles.py       # Endpoints /api/profile
│   │       ├── push.py           # Endpoints /api/push y webhook /cron
│   │       ├── savings.py        # Endpoints /api/savings
│   │       └── shares.py         # Endpoints /api/shares
│   ├── create_tables.py          # Script de inicialización de modelos SQLAlchemy
│   └── requirements.txt          # Dependencias de Python congeladas
│
└── frontend/
    ├── api/
    │   └── cron/
    │       └── notifications.ts  # Vercel Serverless Function disparadora del cron
    ├── public/                   # Manifiesto PWA, favicon SVG y assets públicos
    ├── src/
    │   ├── api.ts                # Cliente Axios tipado con todas las llamadas API
    │   ├── App.tsx               # Enrutamiento principal, Guards y Shell de navegación
    │   ├── firebase.ts           # Inicialización del cliente Web de Firebase FCM
    │   ├── pushManager.ts        # Registro de Service Worker y solicitud de tokens
    │   ├── supabaseClient.ts     # Cliente Supabase para inicio de sesión
    │   ├── sw.ts                 # Service Worker (Workbox + FCM Push Handler)
    │   ├── types.ts              # Tipos canónicos e interfaces TypeScript
    │   ├── context/
    │   │   ├── AuthContext.tsx   # Estado de sesión de usuario y perfil
    │   │   ├── CategoriesContext.tsx # Caché de categorías dinámicas y colores
    │   │   └── NotificationContext.tsx # Contador de no leídas y drawer de avisos
    │   ├── pages/
    │   │   └── PanasPage.tsx     # Gestión de conexiones, solicitudes y balance con panas
    │   ├── components/
    │   │   ├── Budgets.tsx       # Interfaz completa del motor de presupuestos
    │   │   ├── Dashboard.tsx     # Tablero principal de gastos y estadísticas
    │   │   ├── DebtList.tsx      # Gestión y abono de deudas
    │   │   ├── FixedExpenses.tsx # Gestión de gastos fijos y pagos mensuales
    │   │   ├── SavingGoals.tsx   # Gestión de metas y depósitos de ahorro
    │   │   ├── ToolsHub.tsx      # Centro de acceso rápido a herramientas
    │   │   ├── InvitePanaModal.tsx # Modal para invitar un pana por correo
    │   │   └── PanaDetailModal.tsx # Detalle de finanzas compartidas con un pana
    │   └── utils/
    │       └── categoryVisuals.ts# 12 colores semánticos, 44+ íconos y mapeo heurístico
    ├── vercel.json               # Reglas SPA y programación del cron en Vercel
    └── vite.config.ts            # Configuración de Vite y plugin VitePWA
```

---

## 🔄 Módulos Funcionales Detallados

### 1. Autenticación y Perfil de Usuario
- **Emisión e Inspección de Tokens:** El usuario se autentica contra Supabase Auth mediante correo/contraseña o Magic Link. El token JWT resultante es interceptado por Axios y enviado en el encabezado `Authorization: Bearer <token>`.
- **Validación Criptográfica Stateless en Backend (`backend/app/auth.py`):** El backend no consulta la base de datos para validar credenciales; en su lugar, obtiene las claves públicas del endpoint JWKS (`https://<supabase-project>.supabase.co/auth/v1/.well-known/jwks.json`) y valida la firma asimétrica del token directamente en memoria.
- **Sincronización Automática de Perfil:** Un trigger en PostgreSQL (`on_auth_user_created`) crea automáticamente un registro en la tabla `public.profiles`. Si un usuario antiguo no posee perfil, el endpoint `/api/profile/` lo genera perezosamente (*lazy provisioning*) e inicializa las categorías por defecto.
- **Preferencias Granulares:** Cada perfil almacena ajustes individuales de notificación (`notify_fixed_expenses`, `notify_debts`, `notify_incomes`, `notify_inactivity`) que el cron respeta antes de emitir alertas.

### 2. Gastos Diarios y Motor Multidivisa en Tiempo Real
- **Monedas Admitidas:**
  - `BS`: Bolívares soberanos.
  - `USD_BCV`: Dólar a tasa oficial del Banco Central de Venezuela.
  - `EUR_BCV`: Euro a tasa oficial del Banco Central de Venezuela.
  - `USDT`: Dólar cripto referenciado en la mediana de compra de Binance P2P.
  - `USD_CASH`: Dólar en efectivo con soporte de tasa manual personalizada.
- **Motor de Conversión (`backend/app/bcv_service.py`):**
  - Mantiene en memoria las tasas vigentes con un tiempo de expiración (TTL) de 30 minutos.
  - Al insertar o editar un gasto, calcula y persiste simultáneamente: `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs` y `rate_usdt_bs`.
  - Esta estrategia congela la "foto exacta" del valor de la moneda en la fecha del gasto, evitando que las fluctuaciones cambiarias alteren los registros históricos.

### 3. Motor de Presupuestos Mensuales (Budgets Engine)
- **Archivos:** `backend/app/routers/budgets.py`, `backend/app/crud_budgets.py`, `frontend/src/components/Budgets.tsx`.
- **Modelos:** `monthly_budgets` y `budget_category_limits`.
- **Modos de Cálculo del Límite Global (`income_mode`):**
  1. `manual`: El usuario establece una cifra fija en su moneda de preferencia (`manual_global_limit`).
  2. `single_income`: El presupuesto toma como techo el monto de un ingreso estimado específico (`linked_income_id`).
  3. `all_incomes`: El techo se calcula dinámicamente sumando todos los ingresos estimados activos del mes.
- **Límites Específicos por Categoría:** Cada categoría puede tener un límite monetario asignado. El sistema calcula en tiempo real el monto ejecutado consumido por los gastos registrados en ese mes.
- **Clonado Automático entre Meses:** Al consultar un nuevo mes (`YYYY-MM`) que aún no ha sido configurado, el motor localiza el presupuesto del mes anterior, duplica la estructura de categorías y límites, y lo marca como no confirmado (`is_confirmed = false`), permitiendo al usuario aceptarlo con un botón o modificarlo sin rehacer el trabajo.
- **Alertas Proactivas de Consumo:** El cron evalúa el porcentaje gastado del presupuesto global y de cada categoría. Cuando se alcanza el 80% o el 100%, emite una notificación push personalizada y marca las columnas `notified_80` o `notified_100` para evitar envíos duplicados.

### 4. Herramientas Financieras (Tools Hub)
- **Gastos Fijos (`fixed_expenses` y `fixed_expense_checks`):**
  - Almacena compromisos recurrentes con día de corte mensual (`payment_day`).
  - Cada mes se puede marcar como pagado, guardando la tasa de cambio de esa fecha y permitiendo con un solo toggle (`create_expense = true`) insertar el registro como un gasto ordinario en el Dashboard.
- **Deudas Propias y por Cobrar (`debts` y `debt_payments`):**
  - Distingue entre `owed` (lo que debes) y `receivable` (lo que te deben).
  - Los abonos parciales van deduciendo el saldo de la deuda. Al llegar al total adeudado, el sistema conmuta automáticamente `is_settled = true`.
- **Ingresos Estimados (`estimated_incomes` e `income_checks`):**
  - Permite planificar el flujo de caja del mes. Soporta cobros parciales con campo `pending_date` para reprogramar la fecha de cobro de la fracción pendiente.
- **Metas de Ahorro (`saving_goals` y `saving_deposits`):**
  - Permite crear objetivos de ahorro con monto meta, fecha límite y categoría.
  - Los depósitos pueden registrarse opcionalmente como gastos en el Dashboard (`create_expense = true`). Al alcanzar el 100%, el sistema marca la meta como cumplida y lanza una celebración visual con confeti.

### 5. Red de Contactos ("Panas") y Arquitectura de Compartición
- **Archivos:** `backend/app/routers/shares.py`, `backend/app/sharing.py`, `backend/app/routers/connections.py`, `frontend/src/pages/PanasPage.tsx`.
- **Ciclo de Conexión:** Un usuario envía una solicitud por correo (`/api/connections/request`). El destinatario puede aceptarla o rechazarla. Al aceptarse, ambos usuarios quedan conectados como "Panas".
- **Modelo Unificado de Compartición (`shares` y `share_members`):**
  - Soporta tres tipos de entidad: `debt`, `fixed_expense` y `saving_goal`.
  - Roles definidos: `admin` (quien creó el recurso compartido o fue promovido) y `member` (integrante con permisos de visualización y abono).
  - Al compartir una deuda o gasto fijo con un pana, el backend genera una entidad espejo en la cuenta del destinatario (por ejemplo, si el Usuario A registra que le debe $50 al Usuario B, el Usuario B ve automáticamente una deuda "Por Cobrar" de $50 del Usuario A).
  - Los abonos o pagos realizados por cualquiera de las partes generan un registro de pago espejo mediante `sync_id`, manteniendo los balances perfectamente sincronizados en tiempo real.

### 6. Sistema de Notificaciones Push (FCM), Cron Jobs y Bandeja In-App
- **Registro de Dispositivos:** El frontend solicita permiso mediante la Notification API del navegador, obtiene el token FCM del SDK de Firebase y lo registra en `/api/push/subscribe`.
- **Orquestación del Cron Dual:** La función Serverless de Vercel (`api/cron/notifications.ts`) se ejecuta mediante Vercel Cron dos veces al día:
  - `0 13 * * *` (13:00 UTC = 9:00 AM UTC-4): Vencimientos de hoy, atrasos y recordatorios del día posterior.
  - `0 0 * * *` (00:00 UTC = 8:00 PM UTC-4): Recordatorios de vencimientos de mañana y alerta de inactividad (3+ días sin registrar gastos).
- **Seguridad del Cron:** El endpoint `/api/push/cron` exige un token Bearer validado mediante `secrets.compare_digest(provided_token, cron_secret)` para impedir ejecuciones no autorizadas.
- **Bandeja In-App:** Cada notificación enviada genera un registro en la tabla `notifications`, permitiendo que el usuario consulte el historial desde la campana de la barra superior aun si tenía el dispositivo apagado o sin conexión al momento del push.

### 7. Sistema de Categorías Dinámicas y Visuales
- **Archivos:** `frontend/src/context/CategoriesContext.tsx`, `frontend/src/utils/categoryVisuals.ts`, `frontend/src/components/CategoryManager.tsx`.
- **Paleta Semántica de 12 Colores:** Ámbar (`#F59E0B`), Azul (`#3B82F6`), Morado (`#8B5CF6`), Cian (`#06B6D4`), Rojo (`#EF4444`), Rosa (`#EC4899`), Esmeralda (`#10B981`), Índigo (`#6366F1`), Turquesa (`#14B8A6`), Naranja (`#F97316`), Verde (`#22C55E`) y Pizarra (`#64748B`).
- **Biblioteca de 44+ Íconos:** Integración nativa con Lucide React (`Utensils`, `Car`, `Home`, `Zap`, `HeartPulse`, `Gamepad2`, `Briefcase`, `PiggyBank`, etc.).
- **Mapeo Heurístico Inteligente (`NAME_TO_ICON`):** Si una categoría se crea o importa sin ícono explícito, el sistema infiere el ícono óptimo a partir de palabras clave (ej. "gasolina" -> `Car`, "luz" -> `Zap`, "médico" -> `HeartPulse`).
- **Aislamiento por Usuario:** Las categorías se almacenan en la tabla `categories` con una restricción única por usuario `(user_id, name)`.

---

## 🗄 Modelo Relacional Canónico (V4 - 18 Tablas)

El sistema utiliza un esquema relacional normalizado con integridad referencial estricta y claves foráneas en cascada:

1. `profiles`: Datos de usuario vinculados 1:1 a `auth.users(id)`. Almacena nombre visible, avatar y banderas de preferencia para notificaciones.
2. `categories`: Categorías personalizadas por usuario con campos de nombre, color hexadecimal e ícono Lucide. Restricción única en `(user_id, name)`.
3. `expenses`: Registro transaccional de gastos con fecha, categoría, moneda de entrada, montos equivalentes calculados y tasas históricas de cambio.
4. `fixed_expenses`: Catálogo de gastos fijos recurrentes mensuales con día de pago esperado (`payment_day`) y bandera de activación.
5. `fixed_expense_checks`: Registro mensual (`month_year`, ej. '2026-10') de pagos efectuados sobre gastos fijos. Soporta vinculación directa al gasto generado (`expense_id`) y trazabilidad de sincronización (`sync_id`).
6. `debts`: Deudas contraídas (`owed`) o préstamos otorgados (`receivable`) con contraparte, monto original, fecha límite y bandera `is_settled`.
7. `debt_payments`: Registro de abonos sobre deudas con conversión multimoneda en la fecha del pago, opción de generar gasto en Dashboard y sincronización espejo.
8. `estimated_incomes`: Proyección de ingresos recurrentes o eventuales por mes con monto esperado y día de cobro.
9. `income_checks`: Comprobante mensual de cobro real sobre un ingreso estimado, con soporte de pagos parciales (`is_partial`) y reprogramación.
10. `push_subscriptions`: Tokens FCM únicos asociados a cada usuario para entrega de notificaciones Web Push.
11. `notifications`: Historial persistente de avisos y alertas in-app para la campana de notificaciones con estado `is_read`.
12. `connections`: Solicitudes y vínculos de amistad ("Panas") entre dos usuarios con estados `pending`, `accepted` o `rejected`.
13. `saving_goals`: Metas de ahorro con monto objetivo, fecha meta, categoría, color, ícono y estado de completado.
14. `saving_deposits`: Historial de aportes monetarios a metas de ahorro, con fecha, conversión cambiaria y generación opcional de gasto.
15. `shares`: Tabla maestra de la arquitectura unificada de compartición que define la entidad raíz compartida (`debt`, `fixed_expense`, `saving_goal`) y su propietario original.
16. `share_members`: Membresía de usuarios en cada ítem compartido, vinculando la instancia individual de la entidad (`entity_id`), su rol (`admin` o `member`) y quién lo agregó.
17. `monthly_budgets`: Cabecera del presupuesto mensual por usuario y mes (`month_year`), modo de cálculo global (`manual`, `single_income`, `all_incomes`), banderas de confirmación y banderas de alerta enviada (80% y 100%).
18. `budget_category_limits`: Límites de gasto asignados a categorías específicas dentro de un presupuesto mensual, con banderas de deduplicación de alertas.

### Políticas de Row Level Security (RLS)
Todas las tablas tienen habilitado Row Level Security (RLS) en Supabase:
- El backend FastAPI se conecta mediante `DATABASE_URL` utilizando el rol `postgres`, el cual realiza *bypass* de RLS de forma transparente.
- Las políticas de RLS garantizan que si un cliente intenta consultar Supabase directamente con la clave anónima (`anon_key`), solo tendrá acceso a filas donde `auth.uid() = user_id`.

---

## 🚀 Guía de Instalación y Configuración Local

### Prerrequisitos
- **Node.js** v18+ y **npm** v9+
- **Python** 3.10+
- Cuenta gratuita en [Supabase](https://supabase.com/)
- Cuenta gratuita en [Firebase Console](https://console.firebase.google.com/)

---

### 1. Configuración de Base de Datos (Supabase)
1. Crea un nuevo proyecto en Supabase.
2. Dirígete a la sección **SQL Editor** del panel de control de Supabase.
3. Ejecuta el archivo maestro canónico `schema.sql` (contiene las 18 tablas, triggers e índices).
4. Ejecuta a continuación `rls_policies.sql` y `rls_connections.sql` para blindar el acceso directo desde el cliente.
5. En **Project Settings -> Database**, copia la cadena de conexión en formato URI (modo *Transaction* o *Session*).

---

### 2. Configuración de Firebase Cloud Messaging (Web Push)
1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Registra una **Aplicación Web** y guarda el objeto de configuración (`firebaseConfig`).
3. En **Configuración del proyecto -> Cloud Messaging**, ve a la sección de certificados Web Push y genera un nuevo **Par de claves VAPID**.
4. En **Configuración del proyecto -> Cuentas de servicio**, genera una nueva clave privada en formato JSON.
5. Guarda este archivo en `backend/firebase-adminsdk.json` o codifícalo en Base64 para producción.

---

### 3. Instalación del Backend (FastAPI)
1. Accede al directorio `backend`:
   ```bash
   cd backend
   ```
2. Crea y activa un entorno virtual de Python:
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Instala todas las dependencias requeridas:
   ```bash
   pip install -r requirements.txt
   ```
4. Crea el archivo `.env` en `backend/` basándote en la plantilla de la sección [Variables de Entorno](#-variables-de-entorno).
5. Inicia el servidor de desarrollo:
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```
   *La API estará disponible en `http://localhost:8000` y la documentación interactiva Swagger en `http://localhost:8000/docs`.*

---

### 4. Instalación del Frontend (React 19 + Vite)
1. Abre una nueva terminal y navega al directorio `frontend`:
   ```bash
   cd frontend
   ```
2. Instala los paquetes de Node:
   ```bash
   npm install
   ```
3. Crea el archivo `.env` en `frontend/` completando tus credenciales de Supabase y Firebase.
4. Inicia el entorno local de desarrollo:
   ```bash
   npm run dev
   ```
   *Accede a la aplicación en `http://localhost:5173`.*

---

## 🔐 Variables de Entorno

### Backend (`backend/.env`)

| Variable | Tipo | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Requerido | Cadena de conexión asíncrona a Supabase con protocolo `postgresql+asyncpg://` | `postgresql+asyncpg://postgres.xxxx:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Requerido | URL raíz del proyecto Supabase para verificación de JWKS | `https://xyzcompany.supabase.co` |
| `FRONTEND_URL` | Opcional | URL del frontend para enlaces de notificación | `http://localhost:5173` |
| `CRON_SECRET` | Requerido | Token secreto para autenticar las peticiones al endpoint `/api/push/cron` | `mi_clave_secreta_super_segura_123` |
| `ALLOWED_ORIGINS` | Opcional | Orígenes CORS permitidos separados por comas | `http://localhost:5173,https://gastosapp.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Opcional | Clave JSON de Firebase codificada en Base64 (ideal para Render sin subir archivo JSON) | `eyJuYW1lIjogImdhc3RvcyJ9...` |
| `PORT` | Opcional | Puerto de escucha de Uvicorn (Render lo asigna dinámicamente) | `8000` |

```env
# Plantilla para backend/.env
DATABASE_URL=postgresql+asyncpg://postgres.xxxx:tu_password@aws-0-us-east-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://tu-proyecto.supabase.co
FRONTEND_URL=http://localhost:5173
CRON_SECRET=super_secret_cron_token_32chars
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Frontend (`frontend/.env`)

| Variable | Tipo | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Requerido | URL base del API backend (debe terminar en `/api`) | `http://localhost:8000/api` |
| `VITE_SUPABASE_URL` | Requerido | URL de Supabase para inicializar el cliente Auth | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Requerido | Clave pública anónima de Supabase | `eyJhbGciOiJIUzI1NiIsIn...` |
| `VITE_FIREBASE_API_KEY` | Requerido | API Key web de Firebase | `AIzaSyB...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Requerido | Dominio de Auth de Firebase | `tu-proyecto.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Requerido | ID del proyecto en Firebase | `tu-proyecto-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Requerido | Bucket de storage de Firebase | `tu-proyecto.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Requerido | ID de remitente del servicio FCM | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Requerido | Identificador de aplicación Web en Firebase | `1:123456789012:web:abcdef` |
| `VITE_FIREBASE_VAPID_KEY` | Requerido | Clave pública VAPID para Web Push | `BEl62...` |
| `CRON_SECRET` | Servidor | Token secreto para la función serverless `api/cron/notifications.ts` en Vercel | `super_secret_cron_token_32chars` |

```env
# Plantilla para frontend/.env
VITE_API_URL=http://localhost:8000/api
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_publica
VITE_FIREBASE_API_KEY=tu_api_key_firebase
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef
VITE_FIREBASE_VAPID_KEY=tu_vapid_key_publica
CRON_SECRET=super_secret_cron_token_32chars
```

---

## 📡 Referencia Completa de API REST

Todos los endpoints (salvo `/health`, `/` y `/api/expenses/rates`) requieren autenticación mediante encabezado HTTP: `Authorization: Bearer <supabase_jwt>`.

### 1. Gastos Diarios y Tasas (`/api/expenses`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/expenses/` | Lista paginada y filtrada por fechas (`date_from`, `date_to`) de gastos. |
| `POST` | `/api/expenses/` | Crea un nuevo gasto y calcula equivalencias en las 5 monedas. |
| `GET` | `/api/expenses/{expense_id}` | Obtiene los detalles de un gasto específico. |
| `PUT` | `/api/expenses/{expense_id}` | Actualiza monto, categoría, notas o tasa de un gasto existente. |
| `DELETE` | `/api/expenses/{expense_id}` | Elimina un gasto del sistema. |
| `GET` | `/api/expenses/summary` | Resumen global acumulado de gastos por divisa. |
| `GET` | `/api/expenses/summary-range` | Resumen estadístico agrupado para un rango de fechas. |
| `GET` | `/api/expenses/rates` | Devuelve las tasas oficiales actuales de BCV y Binance P2P. |

### 2. Categorías Dinámicas (`/api/categories`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/categories/` | Obtiene todas las categorías activas del usuario autenticado. |
| `POST` | `/api/categories/` | Crea una nueva categoría con nombre, color e ícono personalizado. |
| `POST` | `/api/categories/seed-defaults` | Restaura el conjunto de categorías por defecto del sistema. |
| `PUT` | `/api/categories/{category_id}` | Modifica el nombre, color o ícono de una categoría. |
| `DELETE` | `/api/categories/{category_id}` | Elimina una categoría del usuario. |

### 3. Presupuestos Mensuales (`/api/budgets`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/budgets/categories` | Lista categorías elegibles para configurar presupuestos. |
| `GET` | `/api/budgets/monthly/{month_year}` | Obtiene o auto-clona la vista de presupuesto del mes `YYYY-MM`. |
| `PUT` | `/api/budgets/monthly/{month_year}` | Crea o actualiza la configuración global del presupuesto mensual. |
| `POST` | `/api/budgets/monthly/{month_year}/confirm` | Confirma explícitamente el presupuesto clonado del mes. |
| `PUT` | `/api/budgets/monthly/{month_year}/category` | Agrega o actualiza el límite para una categoría específica. |
| `DELETE` | `/api/budgets/monthly/{month_year}/category/{name}` | Elimina el límite presupuestario de una categoría. |
| `POST` | `/api/budgets/monthly/{month_year}` | Crea un nuevo presupuesto adicional nombrado para el mes. |
| `PUT` | `/api/budgets/{budget_id}` | Actualiza un presupuesto por su ID único. |
| `POST` | `/api/budgets/{budget_id}/primary` | Marca el presupuesto como el primario del mes. |
| `DELETE` | `/api/budgets/{budget_id}` | Elimina un presupuesto por su ID. |
| `PUT` | `/api/budgets/{budget_id}/category` | Modifica un límite de categoría referenciado por el ID del presupuesto. |
| `DELETE` | `/api/budgets/{budget_id}/category/{name}` | Elimina un límite de categoría referenciado por el ID del presupuesto. |

### 4. Compartición Unificada ("Shares") (`/api/shares`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/shares/by-entity/{entity_id}` | Retorna metadatos de compartición de una entidad (`debt`, `fixed_expense`, `saving_goal`). |
| `POST` | `/api/shares/{share_id}/members` | Añade nuevos usuarios integrantes (`user_ids`) a un ítem compartido. |
| `PATCH` | `/api/shares/{share_id}/members/{user_id}` | Actualiza el rol de un integrante (`admin` o `member`). |
| `DELETE` | `/api/shares/{share_id}/members/{user_id}` | Expulsa o permite abandonar voluntariamente un ítem compartido. |

### 5. Conexiones entre Panas (`/api/connections`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/connections/` | Lista las conexiones de amigos aprobadas y pendientes. |
| `GET` | `/api/connections/overview` | Resumen consolidado del balance financiero con todos los panas. |
| `GET` | `/api/connections/partner/{partner_id}/details` | Desglose pormenorizado de ítems compartidos con un pana específico. |
| `POST` | `/api/connections/request` | Envía una solicitud de amistad por correo electrónico. |
| `POST` | `/api/connections/request-by-user/{target_id}` | Envía una solicitud de amistad por UUID de usuario. |
| `PUT` | `/api/connections/{connection_id}/accept` | Acepta una solicitud de amistad recibida. |
| `PUT` | `/api/connections/{connection_id}/reject` | Rechaza una solicitud de amistad recibida. |
| `DELETE` | `/api/connections/{connection_id}` | Elimina una conexión existente entre panas. |

### 6. Gastos Fijos (`/api/fixed-expenses`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/fixed-expenses/` | Lista los gastos fijos configurados del usuario. |
| `POST` | `/api/fixed-expenses/` | Registra un nuevo gasto fijo con su día de corte mensual. |
| `GET` | `/api/fixed-expenses/summary` | Estadísticas acumuladas y porcentaje de pago del mes. |
| `GET` | `/api/fixed-expenses/monthly/{month_year}` | Lista los gastos fijos indicando si ya fueron pagados en el mes. |
| `PUT` | `/api/fixed-expenses/{expense_id}` | Modifica monto, nombre o día de corte del gasto fijo. |
| `DELETE` | `/api/fixed-expenses/{expense_id}` | Elimina o desactiva un gasto fijo. |
| `POST` | `/api/fixed-expenses/{expense_id}/check` | Marca el gasto fijo como pagado en un mes y opcionalmente crea un gasto. |
| `DELETE` | `/api/fixed-expenses/{expense_id}/check/{month_year}` | Desmarca el pago de un mes específico. |

### 7. Deudas y Préstamos (`/api/debts`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/debts/?type=owed|receivable` | Lista las deudas activas o liquidadas según su tipo. |
| `POST` | `/api/debts/` | Crea una nueva deuda por pagar o por cobrar. |
| `GET` | `/api/debts/{debt_id}` | Detalle de la deuda e historial de abonos efectuados. |
| `PUT` | `/api/debts/{debt_id}` | Modifica las condiciones originales de la deuda. |
| `DELETE` | `/api/debts/{debt_id}` | Elimina una deuda del sistema. |
| `POST` | `/api/debts/{debt_id}/payments` | Registra un abono a la deuda, recalculando el saldo y verificando liquidación. |
| `PUT` | `/api/debts/payments/{payment_id}` | Modifica un abono registrado con anterioridad. |
| `DELETE` | `/api/debts/payments/{payment_id}` | Elimina un abono y revierte el balance pendiente. |

### 8. Ingresos Estimados (`/api/incomes`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/incomes/` | Lista las fuentes de ingreso estimadas. |
| `POST` | `/api/incomes/` | Crea una proyección de ingreso con día de cobro previsto. |
| `GET` | `/api/incomes/monthly/{month_year}` | Retorna los ingresos estimados con su estado de cobro en el mes. |
| `PUT` | `/api/incomes/{income_id}` | Actualiza el monto o concepto del ingreso proyectado. |
| `DELETE` | `/api/incomes/{income_id}` | Elimina una proyección de ingreso. |
| `POST` | `/api/incomes/{income_id}/check` | Registra el cobro real (total o parcial) de un ingreso mensual. |
| `DELETE` | `/api/incomes/{income_id}/check/{month_year}` | Elimina el comprobante de cobro de un mes. |

### 9. Metas de Ahorro (`/api/savings`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/savings/` | Lista las metas de ahorro activas o cumplidas. |
| `POST` | `/api/savings/` | Crea un nuevo fondo de ahorro con monto meta y plazo. |
| `GET` | `/api/savings/summary` | Estadísticas del total ahorrado y porcentaje de alcance. |
| `GET` | `/api/savings/{goal_id}` | Consulta una meta de ahorro y el desglose de aportes. |
| `PUT` | `/api/savings/{goal_id}` | Modifica el nombre, meta o fecha límite del ahorro. |
| `DELETE` | `/api/savings/{goal_id}` | Elimina una meta de ahorro. |
| `POST` | `/api/savings/{goal_id}/deposits` | Registra un aporte a la meta, validando si alcanza el 100%. |
| `PUT` | `/api/savings/deposits/{deposit_id}` | Actualiza un depósito registrado previamente. |
| `DELETE` | `/api/savings/deposits/{deposit_id}` | Elimina un depósito y ajusta el balance del fondo. |

### 10. Notificaciones e Historial (`/api/notifications`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/notifications/` | Obtiene el historial de notificaciones in-app del usuario. |
| `PATCH` | `/api/notifications/mark-read` | Marca todas las notificaciones pendientes como leídas. |

### 11. Suscripciones Push y Cron Trigger (`/api/push`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/api/push/subscribe` | Registra el token FCM del dispositivo para envíos push. |
| `POST` | `/api/push/unsubscribe` | Desvincula un token FCM de la cuenta del usuario. |
| `POST` | `/api/push/test` | Envía una notificación push de diagnóstico al dispositivo actual. |
| `POST` / `GET` | `/api/push/cron` | Disparador seguro del cron nocturno/matutino (requiere `CRON_SECRET`). |

### 12. Perfil de Usuario (`/api/profile`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/profile/` | Devuelve el perfil del usuario actual (auto-creándolo si no existe). |
| `PUT` | `/api/profile/` | Actualiza nombre para mostrar, avatar y preferencias de notificación. |

---

## ☁️ Despliegue en Producción

### 1. Despliegue del Backend en [Render](https://render.com/)
1. Conecta tu repositorio de GitHub en Render y crea un **Web Service**.
2. Parámetros de compilación y arranque:
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Variables de entorno en Render:
   - `DATABASE_URL`: Cadena asíncrona de Supabase (`postgresql+asyncpg://...`).
   - `SUPABASE_URL`: URL oficial de tu proyecto Supabase.
   - `FRONTEND_URL`: URL pública de tu frontend en Vercel (ej. `https://gastosapp.vercel.app`).
   - `CRON_SECRET`: Clave secreta idéntica a la configurada en Vercel.
   - `ALLOWED_ORIGINS`: Lista de orígenes de confianza.
   - `FIREBASE_SERVICE_ACCOUNT_BASE64`: Cadena Base64 del archivo `firebase-adminsdk.json`.
4. El backend mantendrá su contenedor activo automáticamente gracias a la rutina asíncrona de **Self-Ping** integrada en `main.py`.

### 2. Despliegue del Frontend en [Vercel](https://vercel.com/)
1. Importa el repositorio en Vercel y asigna como **Root Directory:** `frontend`.
2. Vercel detectará el framework como **Vite** de manera nativa.
3. Configura las variables de entorno en el panel de Vercel con los valores descritos en la sección Frontend de [Variables de Entorno](#-variables-de-entorno).
4. El archivo `vercel.json` se encargará de:
   - Redirigir el tráfico SPA a `index.html`.
   - Programar automáticamente la ejecución del cron en los horarios `0 13 * * *` y `0 0 * * *`.

---

## 🧹 Mantenimiento y Flujo Git

### Flujo de Trabajo Git Recomendado
```bash
# 1. Verificar estado de archivos modificados
git status

# 2. Agregar cambios al área de preparación
git add .

# 3. Confirmar cambios con convención semántica
git commit -m "docs: actualizar README exhaustivo con arquitectura V4 y motor de presupuestos"

# 4. Publicar en rama principal
git push origin main
```

---

*GastosApp — Gestión financiera moderna, transparente y colaborativa.*
