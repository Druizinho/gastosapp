# 💰 GastosApp — Gestión Financiera Personal y Colaborativa (PWA Mobile-First)

![React 19](https://img.shields.io/badge/React-19.2+-blue?logo=react&style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&style=for-the-badge)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&style=for-the-badge)
![SQLAlchemy 2.0](https://img.shields.io/badge/SQLAlchemy-2.0_Async-D71F00?logo=sqlalchemy&style=for-the-badge)
![Supabase PostgreSQL](https://img.shields.io/badge/Supabase-PostgreSQL_21_Tablas-3ECF8E?logo=supabase&style=for-the-badge)
![Firebase Cloud Messaging](https://img.shields.io/badge/Firebase-FCM_Push-FFCA28?logo=firebase&style=for-the-badge)
![Export Studio](https://img.shields.io/badge/Exports-PDF_|_Excel_|_CSV-10B981?style=for-the-badge)
![Workbox PWA](https://img.shields.io/badge/PWA-Workbox-purple?logo=pwa&style=for-the-badge)

**GastosApp** es una Progressive Web App (**PWA**) de última generación con filosofía *mobile-first*, diseñada para solucionar de manera integral los retos de la administración financiera personal y colaborativa. El sistema combina registro ágil de gastos e ingresos con conversión multidivisa en tiempo real e histórica (Bolívares, USD BCV, EUR BCV, USDT Binance P2P y USD Efectivo), un motor inteligente de presupuestos y subpresupuestos mensuales con auto-clonación, un ecosistema de herramientas financieras especializadas (gastos fijos recurrentes, deudas amortizables e incrementables, ingresos proyectados/transaccionales y metas de ahorro con aportes y retiros), una red social financiera ("Panas") con cuentas espejo automáticas y sincronización en tiempo real, un monitor de tasas de cambio con calculadora interactiva, y un completo **Centro de Resúmenes, Comparador de Periodos y Estudio de Exportaciones** a PDF corporativo, Excel multi-hoja, CSV y despacho por correo electrónico.

---

## 📑 Tabla de Contenidos

- [✨ Características Principales](#-características-principales)
- [🏗 Arquitectura del Sistema](#-arquitectura-del-sistema)
- [🛠 Stack Tecnológico Completo](#-stack-tecnológico-completo)
- [📁 Estructura del Proyecto y Directorios Clave](#-estructura-del-proyecto-y-directorios-clave)
- [🔄 Módulos Funcionales Detallados](#-módulos-funcionales-detallados)
  - [1. Autenticación, Resolución de Identidad y Perfil](#1-autenticación-resolución-de-identidad-y-perfil)
  - [2. Gastos Diarios y Motor Multidivisa Histórico](#2-gastos-diarios-y-motor-multidivisa-histórico)
  - [3. Gestión Integral de Ingresos (Proyectados y Transaccionales)](#3-gestión-integral-de-ingresos-proyectados-y-transaccionales)
  - [4. Motor de Presupuestos Mensuales y Subpresupuestos Compartidos](#4-motor-de-presupuestos-mensuales-y-subpresupuestos-compartidos)
  - [5. Herramientas Financieras (Tools Hub)](#5-herramientas-financieras-tools-hub)
  - [6. Finanzas Colaborativas ("Panas") y Compartición Unificada](#6-finanzas-colaborativas-panas-y-compartición-unificada)
  - [7. Centro de Resúmenes, Comparador y Estudio de Exportaciones](#7-centro-de-resúmenes-comparador-y-estudio-de-exportaciones)
  - [8. Monitor de Tasas Oficiales, Cripto y Calculadora](#8-monitor-de-tasas-oficiales-cripto-y-calculadora)
  - [9. Notificaciones Push (FCM), Schedulers y Bandeja In-App](#9-notificaciones-push-fcm-schedulers-y-bandeja-in-app)
  - [10. Categorías Dinámicas de Gastos e Ingresos](#10-categorías-dinámicas-de-gastos-e-ingresos)
  - [11. PWA, UX Móvil y Estrategia Antidormida en Render](#11-pwa-ux-móvil-y-estrategia-antidormida-en-render)
- [🗄 Modelo Relacional Canónico (V5 - 21 Tablas)](#-modelo-relacional-canónico-v5---21-tablas)
- [🚀 Guía de Instalación y Configuración Local](#-guía-de-instalación-y-configuración-local)
- [🔐 Variables de Entorno](#-variables-de-entorno)
- [📡 Referencia Completa de API REST](#-referencia-completa-de-api-rest)
- [☁️ Despliegue en Producción](#-despliegue-en-producción)
- [🧹 Mantenimiento, Scripts y Flujo Git](#-mantenimiento-scripts-y-flujo-git)

---

## ✨ Características Principales

1. **Control Transaccional de Gastos e Ingresos con Snapshot Multimoneda:**
   - Registro instantáneo de gastos e ingresos con importe, concepto/descripción, categoría, fecha y moneda seleccionada.
   - Cálculo y persistencia automática de valores equivalentes en `BS`, `USD_BCV`, `EUR_BCV`, `USDT` y `USD_CASH`, congelando las tasas vigentes en el instante del movimiento o aplicando la tasa histórica de la fecha seleccionada (`daily_rates`).
   - Soporte para sobrescribir la tasa con un valor manual personalizado por transacción.
   - Filtros de alta granularidad: Rangos predefinidos (Hoy, Esta Semana, Este Mes, Este Año, Todo el Historial), Rango Personalizado entre fechas y montos mínimos/máximos.

2. **Doble Módulo de Ingresos (Flujo de Caja Proyectado vs. Ejecución Real):**
   - **Ingresos Estimados:** Planificación de cobros mensuales esperados con día previsto y registro de cobros reales parciales o totales con reprogramación de saldos pendientes (`income_checks`).
   - **Ingresos Directos:** Registro transaccional diario de entradas de dinero (`incomes`) con categorías exclusivas de ingresos (`income_categories`).

3. **Motor Inteligente de Presupuestos Mensuales y Subpresupuestos:**
   - Presupuestos independientes por mes (`YYYY-MM`) con límites asignados por categoría y cálculo del gasto ejecutado en tiempo real.
   - Creación de múltiples presupuestos por mes (Presupuesto Principal y Subpresupuestos temáticos).
   - Mecanismo de **clonado automático continuo**: al iniciar un nuevo mes, se heredan automáticamente los límites del mes anterior en estado pendiente de confirmación (`is_confirmed = false`) para aceptar o ajustar en un toque.
   - Posibilidad de compartir subpresupuestos con contactos ("Panas").
   - Alertas preventivas automáticas al alcanzar el 80% y el 100% de los techos presupuestarios.

4. **Hub de Herramientas Financieras Especializadas (Tools Hub):**
   - **Gastos Fijos:** Compromisos periódicos con día de corte mensual, registro de pagos mensuales (`checks`) y opción directa de convertir el pago en un gasto ordinario del Dashboard.
   - **Deudas Nuestras (Owed) y Por Cobrar (Receivable):** Préstamos con historial de abonos parciales (`payment`), aumentos de capital adeudado (`increase`), liquidación automática al 100% y opción de registrar el abono como gasto ordinario.
   - **Metas de Ahorro:** Creación de fondos con importe objetivo, fecha meta, depósitos progresivos (`deposit`), retiros parciales de fondos (`withdrawal`), cálculo de progreso y animación con confeti al alcanzar la meta.

5. **Finanzas Colaborativas ("Panas") y Cuentas Espejo Automáticas:**
   - Conexión entre usuarios mediante solicitud por correo electrónico o identificador único.
   - Arquitectura unificada de compartición (`shares` y `share_members`) con roles `admin` y `member`.
   - Generación simétrica de cuentas espejo: si el Usuario A registra una deuda que le debe al Usuario B, el Usuario B ve automáticamente una deuda "Por Cobrar" de $X por parte del Usuario A.
   - Sincronización bidireccional inmediata de abonos, pagos de gastos fijos, depósitos de ahorro y subpresupuestos compartidos mediante `sync_id`.

6. **Centro de Resúmenes, Comparador de Periodos y Estudio de Exportaciones (`/herramientas/resumenes`):**
   - **Comparador Analítico:** Permite contrastar dos periodos de tiempo cualesquiera (mes actual vs anterior, año vs año, o rangos libres) con cálculo de variaciones absolutas (`Δ$`) y porcentuales (`Δ%`).
   - **Aviso de Integridad por Asimetría Temporal:** Alerta preventiva y normalización por Promedio Diario (`$/día`) cuando los periodos comparados tienen diferente cantidad de días.
   - **Gráficos Vectoriales SVG:** Evolución temporal acumulada, comparativa de barras agrupadas y distribución porcentual por categoría.
   - **Exportación Multi-formato:** Generación cliente a medida en **PDF Corporativo** (mediante `jspdf` y `jspdf-autotable`), libros multi-hoja en **Excel (`.xlsx`)** (mediante SheetJS `xlsx`) y **CSV** con codificación UTF-8 + BOM.
   - **Plantillas Especializadas por Entidad:** Exportación de estados de cuenta individuales o consolidados de Deudas, Metas de Ahorro, Presupuestos Mensuales, Gastos Fijos e Ingresos.
   - **Despacho Directo por Correo:** Envío seguro del reporte adjunto en PDF o Excel por email a través del backend utilizando SMTP (Gmail, etc.) o Resend API.

7. **Monitor de Tasas en Vivo y Conversor Interactivo (`/tasas`):**
   - Cotizaciones oficiales actualizadas del Banco Central de Venezuela (**USD BCV**, **EUR BCV**).
   - Tasa de **USDT** extraída en tiempo real de la API P2P de Binance.
   - Historial de tasas diarias (`daily_rates`) con selector de fecha para consultar el valor oficial de cualquier día pasado.
   - Calculadora y conversor interactivo bidireccional entre todas las monedas admitidas.

8. **Notificaciones Web Push (FCM), Schedulers y Bandeja In-App:**
   - Notificaciones Web Push nativas con Firebase Cloud Messaging (FCM) integradas en Service Worker (`sw.ts`).
   - Schedulers duales:
     - **Scheduler Interno en Backend:** Tarea en background (`_notification_scheduler_loop`) en FastAPI que evalúa cada minuto si es hora de disparar alertas y registrar las tasas del día.
     - **Vercel Cron Jobs:** Respaldo serverless programado para las 9:00 AM VET (`0 13 * * *`) y 7:00 PM VET (`0 23 * * *`).
   - Historial persistente en la tabla `notifications` con contador de no leídas en tiempo real en la barra superior.

9. **Arquitectura PWA y Gestión Eficiente de Recursos en la Nube:**
   - Instalable en Android, iOS y escritorio con soporte para orientación táctil y navegación inferior fluida (`BottomNav`).
   - **Estrategia Inteligente de Self-Ping:** Mantiene despierto el contenedor en Render Free Tier con pings cada 10 minutos, entrando automáticamente en reposo nocturno entre la **01:00 AM y las 06:30 AM VET** para ahorrar horas gratuitas de computación sin interrumpir el servicio en el día.
   - Pantalla de espera optimizada (**WakeUpLoader**) con animación suave en caso de reactivación (*cold start*).

---

## 🏗 Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Cliente Web / PWA (React 19.2+)                      │
│   Vite 8 + TypeScript + Workbox SW + Feature Folders + Lucide Icons    │
│   Contextos: Auth, Categories, Notifications, CurrencyPreference       │
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
   │  User Identity Resolver  │             │    13 Routers Modulares    │
   └──────────────────────────┘             └────────────┬───────────────┘
                                                         │
         ┌───────────────────────┬───────────────────────┼───────────────────────┐
         │                       │                       │                       │
         ▼                       ▼                       ▼                       ▼
┌──────────────────┐   ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   Supabase DB    │   │  Firebase Admin   │   │  Tasas de Cambio  │   │ Envío de Correos  │
│  PostgreSQL 15+  │   │  Cloud Messaging  │   │  BCV Scraping     │   │   SMTP (Gmail)    │
│  21 Tablas + RLS │   │ (Web Push a FCM)  │   │   Binance P2P     │   │     o Resend      │
│   daily_rates    │   │                   │   │   daily_rates     │   │ (/reports/email)  │
└──────────────────┘   └───────────────────┘   └───────────────────┘   └───────────────────┘
```

### Capas Principales:
- **Capa Cliente (PWA):** React 19.2 empaquetado con Vite 8. Enrutamiento centralizado con React Router DOM v7, modularizado por *feature folders*, exportadores client-side en segundo plano (`jspdf`, `xlsx`), contextos especializados (`AuthContext`, `CategoriesContext`, `NotificationContext`, `CurrencyPreferenceContext`) y Service Worker Workbox configurado con `injectManifest` para interceptar notificaciones push en segundo plano.
- **Capa de Seguridad e Identidad:** Peticiones HTTP autenticadas con tokens JWT emitidos por Supabase Auth. El backend FastAPI valida la firma del token mediante JWKS (`.well-known/jwks.json`) en memoria sin generar consultas a base de datos por autenticación, e hidrata la identidad y avatares con cascada resiliente en `user_resolver.py`.
- **Capa de Negocio y Controladores (FastAPI):** 13 routers especializados organizados en `backend/app/routers/` que operan con sesiones asíncronas SQLAlchemy 2.0 y `asyncpg`.
- **Capa de Persistencia (PostgreSQL en Supabase):** 21 tablas canónicas integradas con claves foráneas en cascada, índices compuestos para acelerar filtros de fecha y políticas de seguridad Row Level Security (RLS).
- **Capa de Workers y Automatización:** Tarea periódica de notificaciones matutinas y vespertinas en el backend, sincronización diaria de cotizaciones en `daily_rates`, bucle de self-ping inteligente con reposo nocturno y soporte de disparadores Vercel Cron.

---

## 🛠 Stack Tecnológico Completo

### Frontend
- **Framework:** React 19.2+
- **Lenguaje:** TypeScript 5.6+
- **Herramienta de Construcción:** Vite 8.x
- **Linter de Alta Velocidad:** Oxlint (`oxlint`)
- **Enrutamiento:** React Router DOM v7
- **Tipografía y Estilos:** Inter (`@fontsource/inter`) y Custom Modern CSS Design System (variables semánticas, paleta por herramienta, elevaciones y temas adaptativos)
- **Generación de Reportes y Exportación:**
  - `jspdf` (v4.2+) y `jspdf-autotable` (v5.0+) para generación vectorial de PDFs ejecutivos
  - `xlsx` (SheetJS v0.18+) para generación de libros Excel multi-hoja y tablas CSV con UTF-8 BOM
- **Manipulación de Fechas:** `date-fns` (v4.4+)
- **Íconos:** Lucide React (catálogo de más de 45 íconos semánticos)
- **Cliente HTTP:** Axios con interceptores para inyección del JWT Bearer y control de errores
- **PWA & Offline:** Vite Plugin PWA (`vite-plugin-pwa`) y Workbox Service Worker
- **Push Client:** Firebase JS SDK v12 (módulo Messaging)

### Backend
- **Framework:** FastAPI 0.115+
- **Servidor ASGI:** Uvicorn
- **Lenguaje:** Python 3.10+
- **ORM:** SQLAlchemy 2.0 (Motor asíncrono con `create_async_engine`)
- **Driver de BD:** `asyncpg`
- **Validación de Datos:** Pydantic v2 y `pydantic-settings`
- **Criptografía & Auth:** PyJWT y `cryptography` para validación stateless de JWKS de Supabase
- **Cliente HTTP Asíncrono:** HTTPX (para consulta de tasas BCV, Binance P2P y bucle de self-ping)
- **Servicios de Correo Electrónico:** Soporte dual para SMTP TLS/SSL (ej. Gmail) y Resend API para despacho de reportes financieros
- **Web Scraping:** BeautifulSoup4 y `pyDolarVenezuela`
- **Push Server:** Firebase Admin SDK (Python)

### Base de Datos & Servicios en la Nube
- **Base de Datos:** Supabase PostgreSQL 15+ (21 tablas canónicas con RLS habilitado)
- **Autenticación:** Supabase Auth (GoTrue con JWKS asimétrico RS256)
- **Hospedaje Backend:** Render (Web Service con contenedor Linux y Python 3)
- **Hospedaje Frontend:** Vercel (Edge Network + Serverless Functions)
- **Orquestación de Cron:** Scheduler interno en FastAPI + Vercel Cron Jobs (`vercel.json`) invocando `/api/cron/notifications.ts`
- **Servicio Push:** Firebase Cloud Messaging (FCM Web Push)

---

## 📁 Estructura del Proyecto y Directorios Clave

```
gastosapp/
├── schema.sql                    # Esquema DDL canónico de PostgreSQL (V5 - 21 tablas)
├── rls_policies.sql              # Políticas RLS para tablas personales
├── rls_connections.sql           # Políticas RLS para Panas y compartición
├── README.md                     # Documentación técnica maestra del sistema
├── DOCUMENTACION_DETALLADA.md    # Guía arquitectónica y catálogo exhaustivo de archivos
│
├── backend/
│   ├── app/
│   │   ├── auth.py               # Decodificación y validación de Supabase JWKS JWT
│   │   ├── bcv_service.py        # Tasas en vivo, histórico daily_rates, scrapers y conversor
│   │   ├── crud.py               # Operaciones BD para gastos, ingresos y categorías
│   │   ├── crud_budgets.py       # Motor de presupuestos mensuales, límites y clonación continua
│   │   ├── crud_connections.py   # Lógica de conexiones entre usuarios ("Panas")
│   │   ├── crud_debts.py         # Lógica de deudas, abonos, aumentos y cuentas espejo
│   │   ├── crud_fixed_expenses.py# Lógica de gastos fijos y comprobantes mensuales
│   │   ├── crud_incomes.py       # Lógica de ingresos estimados y cobros parciales
│   │   ├── crud_savings.py       # Lógica de fondos de ahorro, depósitos y retiros
│   │   ├── database.py           # Conexión asyncpg y generador de sesiones get_db
│   │   ├── main.py               # Inicialización FastAPI, lifespan, self-ping y schedulers
│   │   ├── models.py             # Modelos declarativos ORM de SQLAlchemy 2.0 (21 tablas)
│   │   ├── push_service.py       # Despacho de notificaciones push vía Firebase Admin
│   │   ├── schemas.py            # DTOs de entrada y salida con Pydantic v2
│   │   ├── sharing.py            # Motor unificado de compartición de entidades
│   │   ├── time_utils.py         # Utilidades de hora legal de Venezuela (UTC-4)
│   │   ├── user_resolver.py      # Resuelve nombres y avatares con cascada de metadatos
│   │   └── routers/
│   │       ├── budgets.py        # Endpoints /api/budgets (principales y subpresupuestos)
│   │       ├── categories.py     # Endpoints /api/categories (gastos e ingresos)
│   │       ├── connections.py    # Endpoints /api/connections ("Panas")
│   │       ├── debts.py          # Endpoints /api/debts (abonos y aumentos)
│   │       ├── expenses.py       # Endpoints /api/expenses (gastos y tasas en fecha)
│   │       ├── fixed_expenses.py # Endpoints /api/fixed-expenses
│   │       ├── incomes.py        # Endpoints /api/incomes y /api/estimated-incomes
│   │       ├── notifications.py  # Endpoints /api/notifications
│   │       ├── profiles.py       # Endpoints /api/profile
│   │       ├── push.py           # Endpoints /api/push y webhook /cron
│   │       ├── reports.py        # Endpoints /api/reports (análisis y envío por email)
│   │       ├── savings.py        # Endpoints /api/savings (depósitos y retiros)
│   │       └── shares.py         # Endpoints /api/shares
│   └── requirements.txt          # Dependencias de Python congeladas
│
└── frontend/
    ├── api/
    │   └── cron/
    │       └── notifications.ts  # Vercel Serverless Function disparadora de notificaciones
    ├── public/                   # Manifiesto PWA, favicon SVG y assets
    ├── src/
    │   ├── api.ts                # Cliente Axios tipado con todas las funciones API
    │   ├── App.tsx               # Enrutamiento principal, Lazy loading y layout shell
    │   ├── firebase.ts           # Inicialización cliente de Firebase FCM
    │   ├── pushManager.ts        # Registro de Service Worker y tokens FCM
    │   ├── supabaseClient.ts     # Cliente Supabase para autenticación
    │   ├── sw.ts                 # Service Worker (Workbox + Firebase Push)
    │   ├── types.ts              # Tipos canónicos e interfaces TypeScript
    │   ├── context/
    │   │   ├── AuthContext.tsx   # Estado de sesión de usuario y perfil
    │   │   ├── CategoriesContext.tsx # Caché de categorías (gastos e ingresos)
    │   │   ├── CurrencyPreferenceContext.tsx # Preferencia de moneda global (USD, BS, EUR, USDT)
    │   │   └── NotificationContext.tsx # Notificaciones no leídas y drawer
    │   ├── hooks/
    │   │   └── useReportExport.ts# Hook para configuración y generación de exportaciones
    │   ├── utils/
    │   │   ├── categoryVisuals.ts# 12 colores semánticos, 45+ íconos y mapeo heurístico
    │   │   ├── currencyFormat.ts # Formateadores de moneda y conversiones de visualización
    │   │   ├── currencySummary.ts# Helpers de sumatoria y resolución multimoneda
    │   │   ├── toolColors.ts     # Paleta semántica por herramienta financiera
    │   │   └── exporters/
    │   │       ├── entityTemplates.ts     # Plantillas normalizadas para cada módulo
    │   │       ├── pdfExporter.ts         # Generador de PDFs con jsPDF y jsPDF-AutoTable
    │   │       └── spreadsheetExporter.ts # Generador de Excel (.xlsx) y CSV con SheetJS
    │   └── components/
    │       ├── auth/             # Componentes de Login, Registro y Recuperación
    │       ├── budgets/          # Motor de presupuestos y límites por categoría
    │       ├── common/           # Selectores compartidos de categoría y tasa de cambio
    │       ├── dashboard/        # Gastos diarios, resumen hero, filtros y formulario
    │       ├── debts/            # Deudas nuestras y por cobrar, abonos y aumentos
    │       ├── fixed-expenses/   # Gastos fijos recurrentes y comprobantes mensuales
    │       ├── incomes/          # Ingresos estimados y cobros parciales
    │       ├── layout/           # BottomNav, NotificationBell, ErrorBoundary, WakeUpLoader
    │       ├── panas/            # Red de Panas, invitaciones, miembros y subpresupuestos
    │       ├── rates/            # Pantalla /tasas con cotizaciones oficiales y calculadora
    │       ├── reports/          # ReportsHub, ExportStudioPanel y ReportCharts
    │       ├── savings/          # Metas de ahorro, depósitos y retiros
    │       ├── settings/         # ProfileManager, NotificationSettings, CategoryManager
    │       ├── tools/            # Hub de acceso centralizado a herramientas financieras
    │       └── ui/               # Botones, Cards, Modales, Tabs, Skeletons y Toasts
    ├── vercel.json               # Reglas SPA y programación Vercel Cron
    └── vite.config.ts            # Configuración Vite 8 y VitePWA
```

---

## 🔄 Módulos Funcionales Detallados

### 1. Autenticación, Resolución de Identidad y Perfil
- **Supabase Auth:** Autenticación por correo y contraseña o enlace mágico (*Magic Link*). El token JWT resultante viaja en el encabezado `Authorization: Bearer <token>`.
- **Validación Criptográfica Stateless (`auth.py`):** El backend descarga las claves públicas JWKS de Supabase y las mantiene en memoria, verificando la firma de cada petición sin consultar la base de datos.
- **Resolución Resiliente de Identidad (`user_resolver.py`):** Si un usuario no ha configurado un nombre visible, el sistema extrae automáticamente la mejor opción disponible siguiendo una cascada de caídas: `display_name` -> `full_name` -> `name` -> `user_name` -> prefijo de correo -> `"Usuario"`. Para el avatar se aplica igual prioridad: `avatar_url` -> `picture` -> `None`.
- **Ajustes de Notificación en Perfil:** Banderas individuales para activar o pausar avisos de gastos fijos, deudas, ingresos, presupuestos, panas e inactividad.

### 2. Gastos Diarios y Motor Multidivisa Histórico
- **5 Divisas Admitidas:** Bolívares (`BS`), Dólar Oficial (`USD_BCV`), Euro Oficial (`EUR_BCV`), Cripto P2P (`USDT`) y Dólar Efectivo (`USD_CASH`).
- **Snapshot y Preservación Histórica:** Al registrar o editar un gasto, el sistema calcula y almacena de forma inmutable: `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, junto con las tasas `rate_usd_bs`, `rate_eur_bs` y `rate_usdt_bs`.
- **Cotizaciones por Fecha (`daily_rates`):** Si el gasto tiene una fecha pasada, el endpoint `/api/expenses/rates?target_date=YYYY-MM-DD` consulta la tasa oficial registrada en la tabla `daily_rates` para ese día específico, evitando calcular gastos antiguos con tasas actuales infladas.

### 3. Gestión Integral de Ingresos (Proyectados y Transaccionales)
- **Ingresos Directos (`incomes`):** Permite registrar entradas reales de dinero en cualquier divisa con categoría, fecha y notas desde el botón "+" o desde la pantalla de ingresos.
- **Ingresos Estimados (`estimated_incomes`):** Permite proyectar el flujo de caja del mes con día esperado de cobro.
- **Cobros Reales Parciales (`income_checks`):** Permite marcar un ingreso como cobrado totalmente o registrar cobros parciales con campo `pending_date` para reprogramar la fecha del saldo restante.
- **Categorías de Ingresos Dedicadas (`income_categories`):** Catálogo separado de categorías con colores e íconos propios para no mezclar las categorías de gastos con las fuentes de ingreso.

### 4. Motor de Presupuestos Mensuales y Subpresupuestos Compartidos
- **Archivos:** `backend/app/routers/budgets.py`, `backend/app/crud_budgets.py`, `frontend/src/components/budgets/`.
- **Modelos:** `monthly_budgets` y `budget_category_limits`.
- **Presupuesto Principal y Subpresupuestos:** Soporta crear presupuestos nombrados adicionales para proyectos específicos (ej. "Vacaciones", "Remodelación") y compartirlos con Panas.
- **Modos de Límite Global (`income_mode`):**
  1. `manual`: Cifra fija en la moneda seleccionada.
  2. `single_income`: Límite igual al monto de un ingreso estimado vinculado.
  3. `all_incomes`: Suma automática de todos los ingresos estimados del mes.
- **Clonado Automático Continuo:** Al consultar un nuevo mes (`YYYY-MM`) no configurado, el motor clona automáticamente la estructura de categorías y límites del mes previo, marcándolo como pendiente de confirmación (`is_confirmed = false`).
- **Alertas Proactivas:** El scheduler evalúa los porcentajes de consumo y emite notificaciones push preventivas al alcanzar el 80% y el 100% de los techos presupuestarios.

### 5. Herramientas Financieras (Tools Hub)
- **Gastos Fijos (`fixed_expenses`):** Gastos mensuales recurrentes con día de corte (`payment_day`), comprobantes de pago por mes (`fixed_expense_checks`) y toggle directo para insertar el pago como gasto en el Dashboard.
- **Deudas Nuestras y Por Cobrar (`debts`):** Distingue entre `owed` (deuda propia) y `receivable` (préstamo otorgado). Permite registrar tanto abonos (`payment`) que reducen el saldo, como incrementos de capital (`increase`). Al amortizar el 100%, conmuta automáticamente a `is_settled = true`.
- **Metas de Ahorro (`saving_goals`):** Fondos de ahorro con importe meta, fecha límite, depósitos progresivos (`deposit`), retiros parciales (`withdrawal`) y animación festiva de confeti al cumplir el objetivo.

### 6. Finanzas Colaborativas ("Panas") y Compartición Unificada
- **Conexiones:** Vínculo de amistad entre usuarios mediante solicitud por email o UID.
- **Modelo Unificado de Compartición (`shares` y `share_members`):**
  - Soporta 4 tipos de entidades: `debt`, `fixed_expense`, `saving_goal` y `budget`.
  - Roles: `admin` (creador o administrador con permisos completos) y `member` (integrante con permisos de visualización y abono).
  - Cuentas espejo simétricas en la base de datos sincronizadas en tiempo real mediante `sync_id`.

### 7. Centro de Resúmenes, Comparador y Estudio de Exportaciones
- **Ubicación:** Centralizado en `/herramientas/resumenes` (`ReportsHub.tsx`).
- **Pestaña 1: Resumen y Comparador:**
  - Análisis interactivo entre dos periodos (Periodo A vs. Periodo B).
  - Banner de integridad analítica y normalización por promedio diario (`$/día`) cuando los periodos tienen distinta duración.
  - 3 Gráficos vectoriales SVG dinámicos: Evolución temporal acumulada, barras comparativas y desglose por categoría.
- **Pestaña 2: Estudio de Exportaciones (Constructor Paso a Paso):**
  - Permite seleccionar el origen: Resumen de periodo, Comparativa, Deudas (individual o consolidado), Metas de ahorro, Presupuesto mensual, Gastos fijos o Ingresos.
  - Selección de moneda base (`mainCurrency` pre-seleccionada desde `CurrencyPreferenceContext`).
  - Opciones de incluir columnas multimoneda originales y tasas históricas aplicadas.
  - Salida en **PDF Corporativo**, libro **Excel (.xlsx)** multi-hoja y **CSV** con UTF-8 BOM.
  - Envío directo por correo electrónico mediante `/api/reports/send-email` soportando SMTP y Resend.

### 8. Monitor de Tasas Oficiales, Cripto y Calculadora
- **Ubicación:** Pantalla dedicada `/tasas` (`RatesPage.tsx`).
- Muestra el Dólar BCV, Euro BCV, USDT Binance P2P y efectivo.
- Selector de fecha histórica que consulta la tabla `daily_rates`.
- Calculadora y conversor interactivo bidireccional entre todas las divisas.

### 9. Notificaciones Push (FCM), Schedulers y Bandeja In-App
- **Entrega Web Push:** Firebase Cloud Messaging (FCM) integrada en Service Worker (`sw.ts`).
- **Ventana Matutina (9:00 AM VET / 13:00 UTC):** Gastos fijos por vencer hoy, deudas vencidas y cobros pendientes.
- **Ventana Vespertina (7:00 PM VET / 23:00 UTC):** Vencimientos del día siguiente y alerta de inactividad (3+ días sin registros).
- **Scheduler Interno en Backend:** Bucle asíncrono en `main.py` que no depende exclusivamente de servidores externos para disparar los recordatorios diarios.

### 10. Categorías Dinámicas de Gastos e Ingresos
- Paleta semántica de 12 colores y catálogo de más de 45 íconos semánticos Lucide.
- Mapeo heurístico inteligente por nombre (ej. "gasolina" -> `Car`, "sueldo" -> `Briefcase`).
- Reasignación segura: al eliminar una categoría, los gastos no se borran; se transfieren automáticamente a `"Sin Categoría"`.

### 11. PWA, UX Móvil y Estrategia Antidormida en Render
- Instalable como aplicación móvil nativa con Service Worker Workbox en modo `injectManifest`.
- **Reposo Nocturno Inteligente de Self-Ping:** El backend se auto-consulta cada 10 minutos para no dormirse, pero pausa los pings entre las **01:00 AM y 06:30 AM VET**, logrando que el servicio ahorre horas del plan gratuito de Render mientras duermes sin perder disponibilidad durante el día.

---

## 🗄 Modelo Relacional Canónico (V5 - 21 Tablas)

Consolidado en `schema.sql`:

1. `profiles`: Perfil de usuario vinculado a `auth.users(id)`, nombre visible, avatar y banderas de notificación.
2. `categories`: Categorías de gastos por usuario con nombre, color hexadecimal e ícono.
3. `income_categories`: Categorías de ingresos independientes por usuario con nombre, color e ícono.
4. `expenses`: Registro transaccional de gastos con fecha, moneda original, montos equivalentes calculados y tasas históricas.
5. `fixed_expenses`: Catálogo de gastos fijos recurrentes con día de pago mensual (`payment_day`) y estado activo.
6. `fixed_expense_checks`: Comprobante mensual de pago sobre gastos fijos con opción de generar gasto ordinario y sincronización espejo (`sync_id`).
7. `debts`: Deudas por pagar (`owed`) o por cobrar (`receivable`) con monto total, contraparte, vencimiento y bandera `is_settled`.
8. `debt_payments`: Movimientos de deuda: abonos amortizables (`payment`) o aumentos de deuda (`increase`), con tasas en la fecha de pago.
9. `estimated_incomes`: Proyección de ingresos del mes con monto esperado y día previsto.
10. `income_checks`: Comprobante mensual de cobro real sobre un ingreso estimado con soporte de cobros parciales y reprogramación.
11. `incomes`: Registro transaccional de ingresos directos ejecutados con categoría, moneda y fecha.
12. `push_subscriptions`: Tokens FCM únicos por usuario para envío de notificaciones Web Push.
13. `notifications`: Historial persistente in-app con campos `title`, `body`, `type`, `url`, `is_read`, `is_resolved`, `entity_type` y `entity_id`.
14. `connections`: Vínculos y solicitudes de amistad ("Panas") con estados `pending`, `accepted` o `rejected`.
15. `saving_goals`: Metas de ahorro con monto objetivo, plazo, categoría, color, ícono y estado completado.
16. `saving_deposits`: Movimientos de fondos de ahorro: depósitos (`deposit`) o retiros (`withdrawal`), con opción de generar gasto en Dashboard.
17. `shares`: Tabla maestra de compartición que define la entidad raíz (`debt`, `fixed_expense`, `saving_goal`, `budget`) y su propietario.
18. `share_members`: Membresía de usuarios en cada ítem compartido con roles (`admin`, `member`), categoría local y perspectiva.
19. `monthly_budgets`: Presupuestos mensuales (principal y subpresupuestos nombrados) con modo de cálculo, confirmación y banderas de alerta.
20. `budget_category_limits`: Límites de gasto asignados a categorías específicas dentro de un presupuesto mensual.
21. `daily_rates`: Registro histórico diario de cotizaciones de divisas (`fecha`, `usd_bs`, `eur_bs`, `usdt_bs`, `source`).

---

## 🚀 Guía de Instalación y Configuración Local

### Prerrequisitos
- **Node.js** v18+ y **npm** v9+
- **Python** 3.10+
- Cuenta en [Supabase](https://supabase.com/)
- Cuenta en [Firebase Console](https://console.firebase.google.com/)

---

### 1. Base de Datos (Supabase)
1. Crea un proyecto en Supabase.
2. Ve al **SQL Editor** y ejecuta el archivo maestro `schema.sql` (crea las 21 tablas, índices y triggers).
3. Ejecuta `rls_policies.sql` y `rls_connections.sql` para proteger el acceso directo de clientes.
4. En **Project Settings -> Database**, copia la URI de conexión en modo *Session* o *Transaction*.

---

### 2. Firebase Cloud Messaging (Web Push)
1. En Firebase Console, crea un proyecto y agrega una **Aplicación Web**.
2. En **Configuración del proyecto -> Cloud Messaging**, genera el **Par de claves VAPID**.
3. En **Cuentas de servicio**, genera una nueva clave privada en archivo JSON.
4. Guarda el archivo en `backend/firebase-adminsdk.json` o codifícalo a Base64 para producción.

---

### 3. Instalación del Backend (FastAPI)
```bash
cd backend

# Crear y activar entorno virtual
python -m venv venv
.\venv\Scripts\Activate.ps1   # En Windows PowerShell
# source venv/bin/activate    # En Linux / macOS

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno en backend/.env
# Iniciar servidor de desarrollo
python -m uvicorn app.main:app --reload --port 8000
```
*API activa en `http://localhost:8000` y documentación interactiva Swagger en `http://localhost:8000/docs`.*

---

### 4. Instalación del Frontend (React 19 + Vite 8)
```bash
cd frontend

# Instalar dependencias
npm install

# Configurar variables de entorno en frontend/.env
# Iniciar frontend de desarrollo
npm run dev
```
*Aplicación disponible en `http://localhost:5173`.*

---

## 🔐 Variables de Entorno

### Backend (`backend/.env`)

| Variable | Requerido | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Sí | Cadena asíncrona de conexión a Supabase con driver `postgresql+asyncpg://` | `postgresql+asyncpg://postgres.xxxx:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Sí | URL raíz del proyecto Supabase para verificación de firmas JWKS | `https://xyzcompany.supabase.co` |
| `FRONTEND_URL` | No | URL pública del frontend para enlaces en notificaciones | `http://localhost:5173` |
| `CRON_SECRET` | Sí | Clave secreta para autenticar peticiones a `/api/push/cron` | `clave_secreta_super_segura_32_chars` |
| `ALLOWED_ORIGINS` | No | Orígenes permitidos por CORS separados por comas | `http://localhost:5173,https://gastosapp.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | No | Clave JSON de Firebase Admin codificada en Base64 | `eyJuYW1lIjogImdhc3RvcyJ9...` |
| `SMTP_USER` | No | Correo emisor para despacho de reportes por SMTP | `notificaciones@tudominio.com` |
| `SMTP_PASSWORD` | No | Contraseña o App Password del correo emisor | `abcd efgh ijkl mnop` |
| `SMTP_HOST` | No | Servidor SMTP (por defecto `smtp.gmail.com`) | `smtp.gmail.com` |
| `SMTP_PORT` | No | Puerto SMTP (465 para SSL, 587 para TLS) | `465` |
| `RESEND_API_KEY` | No | API Key de Resend (alternativa moderna a SMTP) | `re_123456789...` |
| `RESEND_FROM_EMAIL` | No | Dirección remitente verificada en Resend | `GastosApp <reportes@tudominio.com>` |
| `PORT` | No | Puerto de Uvicorn (asignado automáticamente por Render) | `8000` |

### Frontend (`frontend/.env`)

| Variable | Requerido | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Sí | URL base del backend FastAPI (debe terminar en `/api`) | `http://localhost:8000/api` |
| `VITE_SUPABASE_URL` | Sí | URL de Supabase para inicializar el cliente Auth | `https://xyzcompany.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Sí | Clave anónima pública de Supabase | `eyJhbGciOiJIUzI1NiIsIn...` |
| `VITE_FIREBASE_API_KEY` | Sí | API Key de Firebase Web | `AIzaSyB...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Sí | Dominio de Auth de Firebase | `tu-proyecto.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Sí | ID del proyecto en Firebase | `tu-proyecto` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Sí | Bucket de almacenamiento en Firebase | `tu-proyecto.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sí | Sender ID del servicio FCM | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Sí | Identificador de aplicación web en Firebase | `1:123456789012:web:abcdef` |
| `VITE_FIREBASE_VAPID_KEY` | Sí | Clave pública VAPID para registro Web Push | `BEl62...` |
| `CRON_SECRET` | Vercel | Clave secreta para la función serverless de cron en Vercel | `clave_secreta_super_segura_32_chars` |

---

## 📡 Referencia Completa de API REST

Todas las peticiones (salvo `/health`, `/` y `/api/expenses/rates`) requieren autenticación mediante encabezado HTTP: `Authorization: Bearer <supabase_jwt>`.

### 1. Gastos Diarios y Tasas (`/api/expenses`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/expenses/` | Lista paginada y filtrada por fechas (`date_from`, `date_to`) de gastos. |
| `POST` | `/api/expenses/` | Crea un gasto y calcula equivalencias en 5 divisas según la fecha. |
| `GET` | `/api/expenses/{expense_id}` | Obtiene los detalles de un gasto específico. |
| `PUT` | `/api/expenses/{expense_id}` | Actualiza monto, categoría, notas o tasa de un gasto existente. |
| `DELETE` | `/api/expenses/{expense_id}` | Elimina un gasto del sistema. |
| `GET` | `/api/expenses/summary` | Resumen global acumulado de gastos por divisa. |
| `GET` | `/api/expenses/summary-range` | Resumen estadístico agrupado para un rango de fechas. |
| `GET` | `/api/expenses/rates` | Devuelve las tasas oficiales actuales o históricas si se envía `?target_date=YYYY-MM-DD`. |

### 2. Ingresos Directos y Estimados (`/api/incomes` y `/api/estimated-incomes`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/incomes/` | Lista transacciones de ingresos reales del usuario entre fechas. |
| `POST` | `/api/incomes/` | Registra un nuevo ingreso directo en cualquier divisa. |
| `GET` | `/api/incomes/{income_id}` | Obtiene un ingreso real por su ID. |
| `PUT` | `/api/incomes/{income_id}` | Modifica una transacción de ingreso directo. |
| `DELETE` | `/api/incomes/{income_id}` | Elimina un ingreso directo registrado. |
| `GET` | `/api/estimated-incomes/` | Lista fuentes de ingreso estimadas activas. |
| `POST` | `/api/estimated-incomes/` | Crea una proyección de cobro mensual recurrente. |
| `GET` | `/api/estimated-incomes/monthly/{month_year}` | Retorna los ingresos proyectados y su estado de cobro en el mes. |
| `PUT` | `/api/estimated-incomes/{income_id}` | Actualiza monto, concepto o día de cobro de un ingreso estimado. |
| `DELETE` | `/api/estimated-incomes/{income_id}` | Desactiva o elimina un ingreso estimado. |
| `POST` | `/api/estimated-incomes/{income_id}/checks` | Registra cobro real (total o parcial con reprogramación). |
| `DELETE` | `/api/estimated-incomes/{income_id}/checks/{month_year}` | Elimina el comprobante de cobro de un mes. |

### 3. Categorías de Gastos e Ingresos (`/api/categories`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/categories/` | Obtiene todas las categorías de gastos del usuario. |
| `POST` | `/api/categories/` | Crea una nueva categoría de gastos con nombre, color e ícono. |
| `POST` | `/api/categories/seed-defaults` | Restaura el conjunto predeterminado de categorías de gastos. |
| `PUT` | `/api/categories/{category_id}` | Modifica una categoría de gastos. |
| `DELETE` | `/api/categories/{category_id}` | Elimina una categoría de gastos (los gastos pasan a "Sin Categoría"). |
| `GET` | `/api/categories/income` | Obtiene las categorías específicas de ingresos. |
| `POST` | `/api/categories/income` | Crea una nueva categoría de ingresos con color e ícono. |
| `POST` | `/api/categories/income/seed-defaults` | Restaura categorías predeterminadas de ingresos. |
| `PUT` | `/api/categories/income/{category_id}` | Modifica una categoría de ingresos. |
| `DELETE` | `/api/categories/income/{category_id}` | Elimina una categoría de ingresos. |

### 4. Presupuestos Mensuales y Subpresupuestos (`/api/budgets`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/budgets/categories` | Lista categorías elegibles para límites presupuestarios. |
| `GET` | `/api/budgets/monthly/{month_year}` | Obtiene o auto-clona la vista de presupuestos del mes `YYYY-MM`. |
| `PUT` | `/api/budgets/monthly/{month_year}` | Actualiza la configuración global del presupuesto principal. |
| `POST` | `/api/budgets/monthly/{month_year}/confirm` | Confirma explícitamente el presupuesto clonado del mes. |
| `PUT` | `/api/budgets/monthly/{month_year}/category` | Agrega o actualiza el límite para una categoría en el mes. |
| `DELETE` | `/api/budgets/monthly/{month_year}/category/{name}` | Elimina el límite de una categoría en el presupuesto principal. |
| `POST` | `/api/budgets/monthly/{month_year}` | Crea un nuevo subpresupuesto nombrado adicional para el mes. |
| `PUT` | `/api/budgets/{budget_id}` | Actualiza un subpresupuesto por su UUID. |
| `POST` | `/api/budgets/{budget_id}/primary` | Marca el presupuesto especificado como el primario del mes. |
| `DELETE` | `/api/budgets/{budget_id}` | Elimina un subpresupuesto por su UUID. |
| `PUT` | `/api/budgets/{budget_id}/category` | Modifica un límite de categoría referenciado al ID del subpresupuesto. |
| `DELETE` | `/api/budgets/{budget_id}/category/{name}` | Elimina un límite de categoría del subpresupuesto. |

### 5. Resúmenes Analíticos y Despacho de Reportes (`/api/reports`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/reports/analysis` | Análisis comparativo entre Periodo A y Periodo B (deltas, promedios y desglose). |
| `POST` | `/api/reports/send-email` | Despacha un reporte financiero adjunto (PDF/Excel) por email vía SMTP o Resend. |

### 6. Deudas y Préstamos (`/api/debts`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/debts/?type=owed|receivable` | Lista deudas activas o saldadas según su tipo. |
| `POST` | `/api/debts/` | Crea una nueva deuda por pagar o por cobrar. |
| `GET` | `/api/debts/{debt_id}` | Detalle de la deuda e historial completo de abonos e incrementos. |
| `PUT` | `/api/debts/{debt_id}` | Modifica las condiciones originales de la deuda. |
| `DELETE` | `/api/debts/{debt_id}` | Elimina una deuda del sistema. |
| `POST` | `/api/debts/{debt_id}/payments` | Registra un abono (`payment`) o un incremento (`increase`) de deuda. |
| `PUT` | `/api/debts/payments/{payment_id}` | Modifica un abono o incremento registrado previamente. |
| `DELETE` | `/api/debts/payments/{payment_id}` | Elimina un abono/incremento y recalcula el saldo pendiente. |

### 7. Gastos Fijos (`/api/fixed-expenses`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/fixed-expenses/` | Lista gastos fijos configurados. |
| `POST` | `/api/fixed-expenses/` | Registra un gasto recurrente con día de corte mensual. |
| `GET` | `/api/fixed-expenses/summary` | Estadísticas acumuladas y porcentaje de pago del mes actual. |
| `GET` | `/api/fixed-expenses/monthly/{month_year}` | Lista gastos fijos con estado de pago en el mes indicado. |
| `PUT` | `/api/fixed-expenses/{expense_id}` | Modifica monto, concepto o día de corte del gasto fijo. |
| `DELETE` | `/api/fixed-expenses/{expense_id}` | Elimina o desactiva un gasto fijo. |
| `POST` | `/api/fixed-expenses/{expense_id}/check` | Marca como pagado en un mes con opción de crear gasto real. |
| `DELETE` | `/api/fixed-expenses/{expense_id}/check/{month_year}` | Desmarca el pago de un mes específico. |

### 8. Metas de Ahorro (`/api/savings`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/savings/` | Lista metas de ahorro activas o cumplidas. |
| `POST` | `/api/savings/` | Crea un fondo de ahorro con monto meta y plazo. |
| `GET` | `/api/savings/summary` | Estadísticas del total acumulado y porcentaje global de progreso. |
| `GET` | `/api/savings/{goal_id}` | Consulta una meta de ahorro y el desglose de depósitos/retiros. |
| `PUT` | `/api/savings/{goal_id}` | Modifica nombre, meta o fecha límite del fondo. |
| `DELETE` | `/api/savings/{goal_id}` | Elimina una meta de ahorro. |
| `POST` | `/api/savings/{goal_id}/deposits` | Registra un depósito (`deposit`) o retiro (`withdrawal`) de fondos. |
| `PUT` | `/api/savings/deposits/{deposit_id}` | Actualiza un depósito o retiro previo. |
| `DELETE` | `/api/savings/deposits/{deposit_id}` | Elimina un depósito/retiro y actualiza el saldo del fondo. |

### 9. Compartición Unificada ("Shares") (`/api/shares`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/shares/by-entity/{entity_id}` | Retorna metadatos de compartición de una entidad (`debt`, `fixed_expense`, `saving_goal`, `budget`). |
| `POST` | `/api/shares/{share_id}/members` | Añade integrantes a un ítem compartido con roles (`admin`/`member`). |
| `PATCH` | `/api/shares/{share_id}/members/{user_id}` | Actualiza el rol de un integrante. |
| `DELETE` | `/api/shares/{share_id}/members/{user_id}` | Expulsa o permite abandonar voluntariamente un ítem compartido. |
| `PATCH` | `/api/shares/entity/{entity_id}/category` | Actualiza la categoría local para la vista del integrante. |

### 10. Conexiones entre Panas (`/api/connections`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/connections/` | Lista conexiones activas y solicitudes pendientes. |
| `GET` | `/api/connections/overview` | Balance consolidado general con todos los panas. |
| `GET` | `/api/connections/partner/{partner_id}/details` | Desglose pormenorizado de finanzas compartidas con un pana específico. |
| `POST` | `/api/connections/request` | Envía solicitud de amistad por correo electrónico. |
| `POST` | `/api/connections/request-by-user/{target_id}` | Envía solicitud de amistad por UUID de usuario. |
| `PUT` | `/api/connections/{connection_id}/accept` | Acepta una solicitud de amistad recibida. |
| `PUT` | `/api/connections/{connection_id}/reject` | Rechaza una solicitud de amistad. |
| `DELETE` | `/api/connections/{connection_id}` | Elimina una conexión existente entre panas. |

### 11. Notificaciones Push y Cron Webhook (`/api/push` y `/api/notifications`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/notifications/` | Obtiene el historial de avisos in-app del usuario. |
| `PATCH` | `/api/notifications/mark-read` | Marca todas las notificaciones pendientes como leídas. |
| `POST` | `/api/push/subscribe` | Registra el token FCM del dispositivo para entrega Web Push. |
| `POST` | `/api/push/unsubscribe` | Desvincula un token FCM del usuario. |
| `POST` | `/api/push/test` | Envía una notificación push de prueba al dispositivo actual. |
| `POST` / `GET` | `/api/push/cron` | Disparador seguro del cron matutino/vespertino (requiere `CRON_SECRET`). |

### 12. Perfil de Usuario (`/api/profile`)
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/profile/` | Devuelve el perfil del usuario actual (auto-hidratado con `user_resolver.py`). |
| `PUT` | `/api/profile/` | Actualiza nombre para mostrar, avatar y preferencias de notificación. |

---

## ☁️ Despliegue en Producción

### 1. Despliegue del Backend en [Render](https://render.com/)
1. Conecta tu repositorio de GitHub en Render y crea un **Web Service**.
2. Parámetros de configuración:
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Variables de entorno en Render:
   - `DATABASE_URL`: URI asíncrona de Supabase (`postgresql+asyncpg://...`).
   - `SUPABASE_URL`: URL de tu proyecto Supabase.
   - `FRONTEND_URL`: URL pública de tu frontend en Vercel (ej. `https://gastosapp.vercel.app`).
   - `CRON_SECRET`: Clave secreta compartida con Vercel.
   - `ALLOWED_ORIGINS`: Lista de dominios permitidos.
   - `FIREBASE_SERVICE_ACCOUNT_BASE64`: Credencial JSON de Firebase codificada en Base64.
   - `SMTP_USER` y `SMTP_PASSWORD` (o `RESEND_API_KEY`) para el envío de reportes por correo.
4. El contenedor optimiza el uso del tier gratuito mediante el bucle de **Self-Ping** con reposo nocturno automático de 01:00 AM a 06:30 AM VET.

### 2. Despliegue del Frontend en [Vercel](https://vercel.com/)
1. Importa el repositorio en Vercel y asigna como **Root Directory:** `frontend`.
2. Vercel detectará el framework como **Vite** de forma nativa.
3. Configura las variables de entorno (`VITE_API_URL`, `VITE_SUPABASE_*`, `VITE_FIREBASE_*`, `CRON_SECRET`).
4. El archivo `vercel.json` se encarga automáticamente de:
   - Enrutar el tráfico de la Single Page Application (SPA) hacia `index.html`.
   - Programar los Cron Jobs serverless:
     - `0 13 * * *`: Ventana matutina (9:00 AM VET).
     - `0 23 * * *`: Ventana vespertina (7:00 PM VET).

---

## 🧹 Mantenimiento, Scripts y Flujo Git

### Verificación de Calidad y Linting
```bash
# Frontend: Oxlint ultrarrápido
cd frontend
npm run lint

# Frontend: Compilación de TypeScript y empaquetado de producción
npm run build
```

### Flujo de Trabajo Git Recomendado
```bash
# 1. Verificar estado del árbol de trabajo
git status

# 2. Agregar cambios al stage
git add .

# 3. Confirmar cambios con convención semántica
git commit -m "docs: actualizar README y DOCUMENTACION_DETALLADA con arquitectura V5, 21 tablas y Centro de Resúmenes"

# 4. Publicar en rama principal
git push origin main
```

---

*GastosApp — Gestión financiera inteligente, transparente y colaborativa.*
