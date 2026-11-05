# 📘 Documentación Detallada: Arquitectura, Funcionamiento y Catálogo de GastosApp (V5)

Este documento contiene la especificación técnica exhaustiva y definitiva de **GastosApp**: su visión de diseño, arquitectura de capas, flujo de datos transaccional, modelos de base de datos relacional (PostgreSQL V5 - 21 tablas), desglose funcional de cada módulo de negocio, catálogo completo de archivos del proyecto y matriz de endpoints de la API REST.

---

# 📑 Índice

1. [Visión General y Filosofía de GastosApp](#1-visión-general-y-filosofía-de-gastosapp)
2. [Arquitectura del Sistema y Flujo de Datos](#2-arquitectura-del-sistema-y-flujo-de-datos)
   - [2.1 Diagrama de Arquitectura Global](#21-diagrama-de-arquitectura-global)
   - [2.2 Capa de Presentación (PWA Mobile-First)](#22-capa-de-presentación-pwa-mobile-first)
   - [2.3 Capa de Identidad y Seguridad Stateless (JWKS)](#23-capa-de-identidad-y-seguridad-stateless-jwks)
   - [2.4 Capa de Lógica de Negocio (FastAPI 0.115+ Asíncrono)](#24-capa-de-lógica-de-negocio-fastapi-0115-asíncrono)
   - [2.5 Capa de Persistencia y Políticas RLS (PostgreSQL en Supabase)](#25-capa-de-persistencia-y-políticas-rls-postgresql-en-supabase)
   - [2.6 Flujo de Vida de una Transacción Típica](#26-flujo-de-vida-de-una-transacción-típica)
3. [Funcionamiento Detallado por Módulos de Negocio](#3-funcionamiento-detallado-por-módulos-de-negocio)
   - [3.1 Autenticación, Resolución de Identidad y Perfil](#31-autenticación-resolución-de-identidad-y-perfil)
   - [3.2 Motor Multidivisa, Snapshot Histórico y `daily_rates`](#32-motor-multidivisa-snapshot-histórico-y-daily_rates)
   - [3.3 Gastos Diarios y Balance Transaccional](#33-gastos-diarios-y-balance-transaccional)
   - [3.4 Gestión Integral de Ingresos: Estimaciones vs. Transacciones Directas](#34-gestión-integral-de-ingresos-estimaciones-vs-transacciones-directas)
   - [3.5 Motor de Presupuestos Mensuales y Subpresupuestos Compartidos](#35-motor-de-presupuestos-mensuales-y-subpresupuestos-compartidos)
   - [3.6 Hub de Herramientas Financieras (Tools Hub)](#36-hub-de-herramientas-financieras-tools-hub)
   - [3.7 Finanzas Colaborativas ("Panas") y Cuentas Espejo](#37-finanzas-colaborativas-panas-y-cuentas-espejo)
   - [3.8 Centro de Resúmenes, Comparador y Estudio de Exportaciones](#38-centro-de-resúmenes-comparador-y-estudio-de-exportaciones)
   - [3.9 Monitor de Tasas Oficiales, Cripto y Calculadora Interactiva](#39-monitor-de-tasas-oficiales-cripto-y-calculadora-interactiva)
   - [3.10 Sistema de Notificaciones Push (FCM), Schedulers y Bandeja In-App](#310-sistema-de-notificaciones-push-fcm-schedulers-y-bandeja-in-app)
   - [3.11 Sistema de Categorías Dinámicas de Gastos e Ingresos](#311-sistema-de-categorías-dinámicas-de-gastos-e-ingresos)
   - [3.12 Resiliencia en la Nube y Bucle de Self-Ping Inteligente](#312-resiliencia-en-la-nube-y-bucle-de-self-ping-inteligente)
4. [Modelo Relacional Canónico (PostgreSQL V5 - 21 Tablas)](#4-modelo-relacional-canónico-postgresql-v5---21-tablas)
5. [Catálogo Exhaustivo de Archivos del Proyecto](#5-catálogo-exhaustivo-de-archivos-del-proyecto)
   - [5.1 Archivos en la Raíz del Repositorio](#51-archivos-en-la-raíz-del-repositorio)
   - [5.2 Backend (`backend/app/`)](#52-backend-backendapp)
   - [5.3 Frontend (`frontend/src/`) y Feature Folders](#53-frontend-frontendsrc-y-feature-folders)
6. [Matriz Completa de Endpoints de la API REST (13 Routers)](#6-matriz-completa-de-endpoints-de-la-api-rest-13-routers)
7. [Configuración de Entorno y Despliegue](#7-configuración-de-entorno-y-despliegue)

---

# 1. Visión General y Filosofía de GastosApp

**GastosApp** es una Progressive Web App (**PWA**) concebida bajo la filosofía *mobile-first*, diseñada para resolver de raíz los desafíos financieros presentes en economías bimonetarias o de alta inflación (particularmente Venezuela), donde las operaciones cotidianas conviven entre múltiples monedas con fluctuación continua:

1. **La Realidad Multimoneda:** Los ciudadanos y comercios transaccionan simultáneamente en Bolívares (`BS`), Dólares oficiales del Banco Central de Venezuela (`USD_BCV`), Euros oficiales (`EUR_BCV`), Criptomonedas estables (`USDT` en Binance P2P) y Dólares en efectivo (`USD_CASH`). Un café puede pagarse en bolívares, un servicio técnico en dólares en efectivo y un trabajo remoto cobrarse en USDT. GastosApp no solo permite registrar en cualquiera de estas monedas, sino que congela las equivalencias de las 5 monedas en la fecha del movimiento.
2. **Snapshot Inmutable y Tasas Históricas:** Si registraste un gasto de 100 Bs en febrero, recalcularlo con la tasa de noviembre distorsionaría tu historial. GastosApp almacena el valor equivalente calculado en el momento del gasto y mantiene una tabla histórica de cotizaciones (`daily_rates`) para garantizar que cualquier gasto registrado retroactivamente use la tasa real de ese día exacto.
3. **Flujo de Caja Real vs. Proyecciones:** Muchos usuarios necesitan planificar los ingresos que esperan recibir en el mes (sueldos, comisiones, alquileres) y conciliar cobros reales parciales con reprogramación de saldos, al tiempo que registran cobros eventuales directos.
4. **Finanzas Colaborativas Transparentes ("Panas"):** Parejas, amigos, compañeros de piso o socios que comparten un alquiler, un préstamo o un fondo de ahorro requieren visibilidad mutua sin duplicar el trabajo administrativo. Al registrar una deuda con un pana, el sistema crea automáticamente una cuenta espejo simétrica en el perfil del amigo y sincroniza cada abono en tiempo real.
5. **Auditoría, Comparativa y Exportación Profesional:** Los datos no quedan atrapados en la aplicación: el usuario puede comparar cualquier periodo contra otro, ver gráficos SVG y generar reportes ejecutivos en PDF de alta fidelidad, libros de Excel multi-hoja (`.xlsx`) y archivos CSV, o despacharlos automáticamente por correo electrónico vía SMTP o Resend.

---

# 2. Arquitectura del Sistema y Flujo de Datos

## 2.1 Diagrama de Arquitectura Global

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Cliente Web / PWA (React 19.2+)                      │
│     Vite 8 + TypeScript + Workbox Service Worker + Tailwind-free CSS   │
│   Contextos: Auth, Categories, Notifications, CurrencyPreference       │
│   Módulos: Dashboard, Budgets, Tools, Panas, Rates, Reports, Settings  │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │                                        │
      Supabase Auth JWT                           REST API (HTTP/JSON)
   (Bearer en Authorization)                 (Endpoints /api/* vía Axios)
                │                                        │
                ▼                                        ▼
   ┌──────────────────────────┐             ┌────────────────────────────┐
   │    Supabase Auth JWKS    │             │      FastAPI Backend       │
   │  Validación asíncrona    │             │   SQLAlchemy 2.0 (Async)   │
   │   en memoria sin BD      │             │    asyncpg Connection Pool │
   │  User Identity Resolver  │             │    13 Routers Modulares    │
   └──────────────────────────┘             └────────────┬───────────────┘
                                                         │
         ┌───────────────────────┬───────────────────────┼───────────────────────┐
         │                       │                       │                       │
         ▼                       ▼                       ▼                       ▼
┌──────────────────┐   ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│   Supabase DB    │   │  Firebase Admin   │   │  Tasas de Cambio  │   │  Servidor Correo  │
│  PostgreSQL 15+  │   │  Cloud Messaging  │   │  BCV Scraping     │   │   SMTP (Gmail)    │
│  21 Tablas + RLS │   │ (Web Push a FCM)  │   │   Binance P2P     │   │     o Resend      │
│   daily_rates    │   │                   │   │   daily_rates     │   │ (/reports/email)  │
└──────────────────┘   └───────────────────┘   └───────────────────┘   └───────────────────┘
```

## 2.2 Capa de Presentación (PWA Mobile-First)
- **Framework:** React 19.2 configurado con TypeScript y empaquetado ultrarrápido con Vite 8.
- **Enrutamiento:** React Router DOM v7 con división de código mediante `React.lazy()` y `Suspense`, utilizando componentes de carga contextuales (`SkeletonHeroCard`, `ToolsHubSkeleton`, `SettingsSkeleton`).
- **Arquitectura de Carpetas por Funcionalidad (*Feature Folders*):** Cada dominio funcional reside en su propio subdirectorio dentro de `frontend/src/components/` (`budgets/`, `dashboard/`, `debts/`, `fixed-expenses/`, `incomes/`, `panas/`, `rates/`, `reports/`, `savings/`, `settings/`, `tools/`, `ui/`, `layout/`, `common/`, `auth/`), exponiendo interfaces limpias a través de archivos de barril (`index.ts`).
- **Service Worker Workbox (`sw.ts`):** Modo `injectManifest` que gestiona el precacheo de recursos estáticos de la aplicación, el soporte de navegación offline y la interceptación en segundo plano de eventos push de Firebase Cloud Messaging con redirección profunda (`NOTIFICATION_CLICK`).

## 2.3 Capa de Identidad y Seguridad Stateless (JWKS)
- **Identidad en el Cliente:** Supabase Auth gestiona el registro, login con contraseña y recuperación mediante Magic Links.
- **Validación en Backend (`auth.py`):** Cada petición HTTP incluye el encabezado `Authorization: Bearer <jwt>`. El middleware `get_current_user` valida criptográficamente la firma del token contra las claves públicas expuestas en el endpoint JWKS del proyecto Supabase (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`). Estas claves se almacenan en caché en memoria con un TTL de 1 hora. La autenticación es 100% *stateless* y no genera lecturas en la base de datos.
- **Resolución Resiliente de Usuario (`user_resolver.py`):** Cuando el sistema necesita mostrar nombres y avatares (por ejemplo en finanzas compartidas con Panas o reportes), consulta la tabla `profiles` y, de ser necesario, `auth.users`, resolviendo la identidad mediante una cascada inteligente: `display_name` -> `raw_user_meta_data.full_name` -> `name` -> `user_name` -> prefijo del email -> `"Usuario"`.

## 2.4 Capa de Lógica de Negocio (FastAPI 0.115+ Asíncrono)
- **Punto de Entrada (`backend/app/main.py`):** Configura el ciclo de vida asíncrono (`lifespan`), CORS con lista blanca y regex para dominios Vercel (`^https:\/\/.*\.vercel\.app$`), inicialización de Firebase Admin SDK, ejecución de migraciones idempotentes de esquema y montaje de los **13 routers modulares**.
- **Sesiones Asíncronas:** Utiliza SQLAlchemy 2.0 con el driver `asyncpg` mediante la función generadora `get_db()`, garantizando alta concurrencia y liberación inmediata de conexiones al finalizar cada petición.
- **Schedulers Internos en Background:**
  - `_notification_scheduler_loop`: Bucle que corre cada 60 segundos en el backend, disparando el resumen matutino a las 9:00 AM VET y el vespertino a las 7:00 PM (19:00) VET, además de sincronizar las tasas en `daily_rates`.
  - `_self_ping_loop`: Bucle que mantiene despierto el contenedor en Render Free Tier realizando un ping a `/health` cada 10 minutos, con reposo nocturno entre 01:00 AM y 06:30 AM VET.

## 2.5 Capa de Persistencia y Políticas RLS (PostgreSQL en Supabase)
- **Esquema Relacional Canónico (V5 - 21 Tablas):** Consolidado en `schema.sql`.
- **Integridad Referencial:** Claves foráneas con eliminación en cascada (`ON DELETE CASCADE`) para entidades hijas dependientes (abonos, límites, depósitos, comprobantes) y preservación de auditoría (`ON DELETE SET NULL`) para referencias históricas cruzadas.
- **Row Level Security (RLS):** Todas las tablas cuentan con RLS activo (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). Si un cliente intenta realizar consultas directas desde el navegador con la clave anónima de Supabase, las políticas restringen el acceso exclusivamente a filas donde `auth.uid() = user_id`. Las conexiones del backend FastAPI utilizan la clave del rol `postgres`, ejecutando *bypass* transparente de RLS con máxima velocidad.

## 2.6 Flujo de Vida de una Transacción Típica

1. **Interacción:** El usuario pulsa el botón flotante `+` en la barra inferior (`BottomNav.tsx`) y completa el formulario (`ExpenseForm.tsx`) indicando un gasto de `50` en moneda `BS` fechado hace dos días.
2. **Petición Cliente:** Axios intercepta la llamada en `api.ts`, adjunta el token JWT de Supabase y realiza un `POST /api/expenses/`.
3. **Autenticación Stateless:** FastAPI extrae el `user_id` decodificando el token contra el JWKS cacheado.
4. **Resolución de Tasas (`bcv_service.py`):** Como la fecha es anterior a hoy, el backend consulta la tabla `daily_rates` buscando la tasa oficial registrada en esa fecha exacta. Si el gasto fuera del día presente, consulta la cotización en vivo (BCV + Binance P2P con caché TTL de 30 min).
5. **Cálculo de Equivalencias:** Se calculan y persisten los montos equivalentes en las 5 monedas (`amount_bs`, `amount_usd`, `amount_eur`, `amount_usdt`) y las tasas de referencia congeladas.
6. **Persistencia SQL:** Se inserta el registro en la tabla `expenses` y se actualiza cualquier límite de categoría presupuestaria asociado.
7. **Respuesta y UI React:** FastAPI retorna el DTO `ExpenseResponse`. El frontend emite el evento global `gastosapp:data-changed`, refrescando el Dashboard, el resumen financiero y las barras de presupuesto en tiempo real sin recargar la página.

---

# 3. Funcionamiento Detallado por Módulos de Negocio

## 3.1 Autenticación, Resolución de Identidad y Perfil
- **Registro y Acceso:** Manejado mediante Supabase Auth con soporte para contraseñas cifradas y Magic Links.
- **Creación Automática de Perfil:** Un trigger de PostgreSQL (`handle_new_user`) crea de inmediato una fila en `public.profiles` ante cualquier alta en `auth.users`. De forma complementaria, el endpoint `/api/profile/` efectúa *lazy provisioning* si encuentra un usuario sin perfil creado.
- **Preferencias Granulares:** La tabla `profiles` almacena booleanos individuales:
  - `notify_fixed_expenses`: Recordatorios de gastos fijos próximos a vencer o vencidos.
  - `notify_debts`: Alertas de deudas por cobrar o por pagar vencidas.
  - `notify_incomes`: Recordatorios de cobros pendientes del mes.
  - `notify_inactivity`: Aviso tras 3 o más días sin registrar gastos.
  - `notify_budgets`: Alertas preventivas al consumir el 80% o 100% del presupuesto.
  - `notify_panas`: Notificaciones de solicitudes de amistad y movimientos compartidos.

## 3.2 Motor Multidivisa, Snapshot Histórico y `daily_rates`
- **5 Divisas del Sistema:**
  - `BS`: Bolívares de curso legal.
  - `USD_BCV`: Dólar estadounidense a tasa oficial del Banco Central de Venezuela.
  - `EUR_BCV`: Euro oficial del Banco Central de Venezuela.
  - `USDT`: Criptomoneda estable Binance P2P (mediana de órdenes verificadas de compra).
  - `USD_CASH`: Dólar estadounidense en efectivo (permite tasa manual personalizada).
- **Servicio de Cotizaciones (`bcv_service.py`):**
  - Scraping automatizado de la web oficial del BCV mediante `pyDolarVenezuela` y BeautifulSoup.
  - Consulta asíncrona a la API pública P2P de Binance mediante HTTPX.
  - Memoria caché en servidor con TTL de 30 minutos (`cachetools.TTLCache`) para evitar bloqueos por exceso de peticiones.
- **Historial Diario (`daily_rates`):** Cada día a las 9:00 AM y 7:00 PM VET (y durante el arranque), el servidor guarda las tasas vigentes en la tabla `daily_rates`. Si la tabla contiene menos de 100 registros, la rutina `seed_historical_rates()` siembra cotizaciones históricas previas.
- **Soporte de Tasa Manual:** Si el usuario negoció una tasa de cambio particular para una transacción en efectivo o transferencia, puede activarla y el sistema calculará las conversiones basándose en dicho valor manual.

## 3.3 Gastos Diarios y Balance Transaccional
- **Componentes:** `frontend/src/components/dashboard/` (`Dashboard.tsx`, `ExpenseForm.tsx`, `ExpenseList.tsx`, `Summary.tsx`, `PeriodSelector.tsx`, `AmountRangeFilter.tsx`).
- **Filtros de Rango Temporal:**
  - *Hoy*, *Esta Semana*, *Este Mes*, *Este Año*, *Todo el Historial*.
  - *Rango Personalizado* con selector visual de fecha inicial y final.
- **Filtro por Monto:** Permite acotar transacciones por importe mínimo y máximo.
- **Eliminación y Reasignación Segura:** Si se borra una categoría, los gastos no se eliminan en cascada; se reasignan a `"Sin Categoría"`, salvaguardando la integridad histórica.

## 3.4 Gestión Integral de Ingresos: Estimaciones vs. Transacciones Directas
El módulo de ingresos aborda dos dimensiones financieras complementarias:
1. **Ingresos Directos (`incomes`):**
   - Transacciones reales ejecutadas de dinero que entra a la cuenta del usuario.
   - Cuenta con endpoints dedicados `/api/incomes/` (GET, POST, PUT, DELETE).
   - Se categoriza mediante `income_categories` (categorías exclusivas de ingresos).
2. **Ingresos Estimados (`estimated_incomes`):**
   - Proyecciones de ingresos periódicos o eventuales para planificar el flujo de caja.
   - Cada ingreso estimado cuenta con un `expected_amount` y un día previsto de cobro (`payment_day`).
   - Soporta comprobantes mensuales (`income_checks`): el usuario puede registrar que cobró el 100% o marcar un cobro parcial (`is_partial = true`) asignando una nueva fecha tentativa (`pending_date`) para la fracción restante.

## 3.5 Motor de Presupuestos Mensuales y Subpresupuestos Compartidos
- **Archivos:** `backend/app/routers/budgets.py`, `backend/app/crud_budgets.py`, `frontend/src/components/budgets/`.
- **Estructura Jerárquica:**
  - `MonthlyBudget`: Presupuesto mensual por usuario y mes (`month_year`). Puede existir un Presupuesto Principal (`is_primary = true`) y múltiples subpresupuestos o presupuestos adicionales nombrados (ej. "Negocio", "Remodelación").
  - `BudgetCategoryLimit`: Límites monetarios asignados a categorías específicas dentro de un presupuesto.
- **Modos de Techo Global (`income_mode`):**
  - `manual`: Cifra límite fija en la moneda seleccionada (`manual_global_limit`).
  - `single_income`: Vinculado dinámicamente al monto de un ingreso estimado específico (`linked_income_id`).
  - `all_incomes`: Techo calculado como la suma automática de todos los ingresos estimados activos del mes.
- **Clonación Automática Continua:** Al consultar un nuevo mes (`YYYY-MM`) no configurado, el backend localiza el presupuesto del mes anterior, clona íntegramente sus categorías y límites, y lo marca como no confirmado (`is_confirmed = false`). El usuario ve un aviso amigable y puede confirmarlo o modificarlo con un clic.
- **Subpresupuestos Compartidos con Panas:** Mediante el modal `ShareSubBudgetModal.tsx`, un usuario puede compartir un subpresupuesto con un pana conectado para controlar presupuestos de gastos comunes (ej. viajes o proyectos compartidos).
- **Alertas Preventivas de Consumo:** El scheduler evalúa los gastos ejecutados y despacha alertas automáticas al 80% y 100% del límite global y de cada categoría individual, utilizando banderas booleanas (`notified_80`, `notified_100`) para deduplicar envíos.

## 3.6 Hub de Herramientas Financieras (Tools Hub)
- **Gastos Fijos (`fixed_expenses`):**
  - Registro de suscripciones, servicios y pagos recurrentes mensuales con día de corte (`payment_day`).
  - Comprobantes mensuales en `fixed_expense_checks`. Al marcar un mes como pagado, el toggle `create_expense = true` crea de forma inmediata el gasto ordinario correspondiente en el Dashboard.
- **Deudas Propias y Por Cobrar (`debts`):**
  - Distinción clara entre `owed` (lo que debo) y `receivable` (lo que me deben).
  - Historial de movimientos con soporte para:
    - **Abonos (`payment`):** Reducen el saldo pendiente. Al liquidar el 100%, el sistema conmuta automáticamente `is_settled = true`.
    - **Aumentos de Deuda (`increase`):** Incrementan el capital adeudado en caso de nuevos préstamos o refinanciamientos sobre la misma obligación.
    - Opción de registrar el abono como un gasto del Dashboard (`create_expense = true`).
- **Metas de Ahorro (`saving_goals`):**
  - Fondos para compras futuras o colchón de emergencia con importe meta, fecha límite, categoría, color e ícono.
  - Historial de depósitos y retiros en `saving_deposits`:
    - **Depósito (`deposit`):** Incrementa el fondo acumulado. Opción de imputar el aporte como gasto del Dashboard.
    - **Retiro (`withdrawal`):** Desembolso parcial o total de los fondos acumulados para utilizarlos en su objetivo.
  - Al completar el 100% del objetivo, la interfaz despliega una animación festiva de confeti y marca `is_completed = true`.

## 3.7 Finanzas Colaborativas ("Panas") y Cuentas Espejo
- **Vínculo entre Usuarios:** Solicitud de amistad enviada por correo electrónico (`/api/connections/request`) o por UID (`/api/connections/request-by-user/`). El receptor puede aceptar o rechazar.
- **Modelo Unificado de Compartición (`shares` y `share_members`):**
  - Soporta 4 entidades: `debt`, `fixed_expense`, `saving_goal` y `budget`.
  - Roles jerárquicos: `admin` (creador o usuario con permisos administrativos) y `member` (integrante con permisos de visualización y aportes).
- **Cuentas Espejo Automáticas:** Al registrar una deuda con un pana (ej. Usuario A le debe 50$ a Usuario B):
  1. Se crea la deuda en la cuenta de Usuario A como `owed` (por pagar).
  2. El backend genera de forma simétrica una deuda en la cuenta de Usuario B como `receivable` (por cobrar).
  3. Los pagos o abonos efectuados por cualquiera de los dos generan un comprobante espejo enlazado por un identificador único `sync_id`, manteniendo los balances perfectamente sincronizados.
- **Panel de Detalle con Panas (`PanaDetailModal.tsx`):** Permite ver en una sola pantalla todo lo que tienes en común con un amigo: deudas mutuas, balance neto (quién le debe a quién), gastos fijos compartidos y metas conjuntas.

## 3.8 Centro de Resúmenes, Comparador y Estudio de Exportaciones
Ubicado en `/herramientas/resumenes` (`ReportsHub.tsx`), unifica el análisis financiero avanzado y la generación de documentos exportables:

### Pestaña 1: Resumen y Comparador Analítico
- **Comparación Flexible de Periodos:**
  - Atajos simétricos de 1 toque: *Este Mes vs. Mes Anterior*, *Este Mes vs. Mismo Mes del Año Anterior*, *Esta Semana vs. Semana Anterior*, *Este Año vs. Año Anterior*.
  - Selección libre de fechas para Periodo A y Periodo B (hasta un máximo técnico de 366 días por periodo).
- **Banner de Integridad por Asimetría Temporal:** Si el usuario compara dos periodos con distinta cantidad de días (ej. una quincena de 15 días contra un mes de 30 días), la interfaz muestra una advertencia analítica y destaca lado a lado tanto la variación absoluta como la del **Promedio Diario (`$/día`)**.
- **Gráficos Vectoriales SVG Dinámicos (`ReportCharts.tsx`):**
  - Gráfico de línea/área de evolución temporal acumulada (agrupación automática por día si ≤ 31 días, por semana si 32-92 días, o por mes si > 92 días).
  - Gráfico de barras comparativas agrupadas de ingresos vs. gastos.
  - Gráfico de barras o dona con distribución porcentual del gasto por categoría.

### Pestaña 2: Estudio de Exportaciones (Constructor Paso a Paso)
- **Orígenes de Datos Soportados:**
  1. *Resumen de un Periodo* (Gastos, Ingresos y Balance neto).
  2. *Comparativa de dos Periodos* (Periodo A vs. Periodo B con deltas `Δ$`, `Δ%` y promedios diarios).
  3. *Deudas* (Consolidado de todas las deudas o Estado de Cuenta de una **Deuda Específica** con desglose de abonos e incrementos).
  4. *Metas de Ahorro* (Consolidado de metas o Cartola de un **Fondo Específico** con depósitos y retiros).
  5. *Presupuestos Mensuales* (Plan Maestro completo o un **Subpresupuesto Específico**, con límites, gasto real, remanente y semáforo).
  6. *Gastos Fijos e Ingresos Mensuales* (Control de compromisos y cobros del mes).
- **Preferencia de Moneda Inteligente:** Se pre-selecciona automáticamente con `mainCurrency` desde `CurrencyPreferenceContext` (`USD`, `BS`, `EUR`, `USDT`), permitiendo conmutar la moneda de exportación en cualquier momento.
- **Detalle Multimoneda y Tasas Históricas:** Switch para incluir en las tablas el monto original pagado, la moneda original y la tasa de cambio histórica aplicada.
- **Formatos de Exportación:**
  - **PDF Corporativo (`.pdf`):** Generado en cliente con `jspdf` y `jspdf-autotable`, incluye encabezado ejecutivo, tarjetas resumen, gráficos y tablas tabulares profesionales.
  - **Excel Nativo Multi-hoja (`.xlsx`):** Generado con SheetJS (`xlsx`), estructurado con pestañas separadas (Resumen, Categorías, Movimientos detallados).
  - **CSV Tabular (`.csv`):** Con codificación UTF-8 + BOM (`\uFEFF`) para compatibilidad directa con Excel en español sin dañar caracteres acentuados ni símbolos monetarios.
- **Despacho Directo por Correo Electrónico:** El modal permite enviar el archivo generado (PDF o Excel) directamente al email del usuario mediante el endpoint `POST /api/reports/send-email`, con plantilla HTML personalizada y soporte de servidores SMTP (Gmail, Zoho) o Resend API.

## 3.9 Monitor de Tasas Oficiales, Cripto y Calculadora Interactiva
- **Ubicación:** `/tasas` (`RatesPage.tsx`).
- Muestra tarjetas en vivo para el Dólar BCV, Euro BCV y USDT Binance P2P.
- Selector de fecha para consultar la tasa histórica oficial almacenada en `daily_rates`.
- Calculadora y conversor interactivo bidireccional entre todas las divisas admitidas, actualizándose en tiempo real mientras el usuario escribe.

## 3.10 Sistema de Notificaciones Push (FCM), Schedulers y Bandeja In-App
- **Entrega Web Push:** Integración nativa con Firebase Cloud Messaging (FCM). Al iniciar sesión, el frontend solicita permiso de notificaciones, obtiene el token del Service Worker y lo registra en `/api/push/subscribe`.
- **Ventanas de Alerta Dual:**
  - **Ventana Matutina (9:00 AM VET / 13:00 UTC):** Gastos fijos que vencen hoy, deudas vencidas y cobros pendientes del mes.
  - **Ventana Vespertina (7:00 PM VET / 23:00 UTC):** Vencimientos del día siguiente y aviso de inactividad (3+ días sin registros).
- **Ejecución de Schedulers:**
  - **Scheduler Interno en Backend:** Bucle en segundo plano en `main.py` (`_notification_scheduler_loop`) que ejecuta las alertas a las horas fijadas y sincroniza las tasas del día en `daily_rates`.
  - **Vercel Cron Jobs:** Tareas programadas en `vercel.json` (`0 13 * * *` y `0 23 * * *`) que invocan de forma externa el webhook `/api/push/cron` mediante token Bearer (`CRON_SECRET`).
- **Bandeja In-App (`NotificationSheet.tsx`):** Cada notificación enviada se persiste en la tabla `notifications`. El usuario puede revisarlas en cualquier momento desde la campana en la barra superior, con contador de no leídas y marcado individual o masivo.

## 3.11 Sistema de Categorías Dinámicas de Gastos e Ingresos
- **Catálogos Separados:**
  - `categories`: Categorías de gastos (Alimentación, Transporte, Vivienda, Ocio, Salud, etc.).
  - `income_categories`: Categorías de ingresos (Sueldo, Ventas, Rendimientos, Freelance, etc.).
- **Paleta de 12 Colores Semánticos:** Ámbar (`#F59E0B`), Azul (`#3B82F6`), Morado (`#8B5CF6`), Cian (`#06B6D4`), Rojo (`#EF4444`), Rosa (`#EC4899`), Esmeralda (`#10B981`), Índigo (`#6366F1`), Turquesa (`#14B8A6`), Naranja (`#F97316`), Verde (`#22C55E`) y Pizarra (`#64748B`).
- **Catálogo de más de 45 Íconos Lucide:** Representación visual clara para cada concepto.
- **Mapeo Heurístico Inteligente (`NAME_TO_ICON`):** Infiere el ícono apropiado automáticamente cuando se crea una categoría a partir de palabras clave (ej. "gasolina" -> `Car`, "médico" -> `HeartPulse`, "salario" -> `Briefcase`).

## 3.12 Resiliencia en la Nube y Bucle de Self-Ping Inteligente
- **El Desafío de Render Free Tier:** Los servicios web gratuitos entran en suspensión tras 15 minutos sin tráfico entrante, causando esperas de 30 a 50 segundos (*cold start*) en la siguiente petición.
- **Bucle de Self-Ping Asíncrono (`_self_ping_loop`):** Cada 10 minutos, una tarea interna en FastAPI consulta el endpoint `/health` de su propia URL pública (`RENDER_EXTERNAL_URL`), manteniendo el contenedor activo.
- **Ventana de Reposo Nocturno:** Para no consumir todas las horas gratuitas mensuales que ofrece Render, la función `is_self_ping_allowed` suspende los pings deliberadamente entre la **01:00 AM y las 06:30 AM VET**. Durante esas horas de la madrugada el contenedor duerme, reanudándose automáticamente en la mañana.
- **WakeUpLoader:** Componente visual en el frontend que detecta si el backend está despertando y muestra una animación suave con mensaje explicativo, evitando que el usuario crea que la aplicación falló.

---

# 4. Modelo Relacional Canónico (PostgreSQL V5 - 21 Tablas)

A continuación se detalla la estructura canónica de las 21 tablas definidas en `schema.sql`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ESQUEMA RELACIONAL (V5)                                │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│ 1. profiles                   │ 8. debt_payments              │ 15. saving_goals       │
│ 2. categories (Gastos)        │ 9. estimated_incomes          │ 16. saving_deposits    │
│ 3. income_categories (Ingresos)│ 10. income_checks             │ 17. shares             │
│ 4. expenses                   │ 11. incomes                   │ 18. share_members      │
│ 5. fixed_expenses             │ 12. push_subscriptions        │ 19. monthly_budgets    │
│ 6. fixed_expense_checks       │ 13. notifications             │ 20. budget_category_lim│
│ 7. debts                      │ 14. connections               │ 21. daily_rates        │
└───────────────────────────────┴───────────────────────────────┴────────────────────────┘
```

### 1. `profiles`
- **Propósito:** Perfil de usuario extendido, vinculado 1:1 a `auth.users(id)`.
- **Columnas:** `id` (UUID PK), `display_name` (String), `avatar_url` (String), `notify_fixed_expenses` (Boolean), `notify_debts` (Boolean), `notify_incomes` (Boolean), `notify_inactivity` (Boolean), `notify_budgets` (Boolean), `notify_panas` (Boolean), `updated_at` (Timestamp).

### 2. `categories`
- **Propósito:** Catálogo de categorías para gastos transaccionales, fijos y presupuestos.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `name` (String), `color` (String), `icon` (String), `created_at` (Timestamp).
- **Restricción:** `UNIQUE(user_id, name)`.

### 3. `income_categories`
- **Propósito:** Catálogo de categorías independientes para ingresos directos y estimados.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `name` (String), `color` (String), `icon` (String), `created_at` (Timestamp).
- **Restricción:** `UNIQUE(user_id, name)`.

### 4. `expenses`
- **Propósito:** Registro transaccional de gastos diarios y equivalencias congeladas en 5 divisas.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `amount` (Numeric), `currency` (String), `description` (String), `category` (String), `date` (Date), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs`, `rate_usdt_bs`, `created_at` (Timestamp).
- **Índices:** `ix_expenses_user_id_date (user_id, date)`.

### 5. `fixed_expenses`
- **Propósito:** Catálogo de compromisos de gastos fijos recurrentes mensuales.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `name` (String), `amount` (Numeric), `currency` (String), `category` (String), `payment_day` (Numeric 1-31), `is_active` (Boolean), `notes` (String), `created_at`, `deactivated_at`.

### 6. `fixed_expense_checks`
- **Propósito:** Comprobante mensual de pago de un gasto fijo (`month_year`, ej. '2026-10').
- **Columnas:** `id` (UUID PK), `fixed_expense_id` (UUID FK -> `fixed_expenses.id` CASCADE), `month_year` (String 7), `paid_amount` (Numeric), `currency` (String), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs`, `rate_usdt_bs`, `paid_date` (Date), `create_expense` (Boolean), `expense_id` (UUID FK -> `expenses.id` SET NULL), `paid_by_name`, `paid_by_user_id` (UUID FK -> `profiles.id`), `sync_id` (UUID), `mirror_check_id` (UUID), `created_at`.
- **Restricción:** `UNIQUE(fixed_expense_id, month_year)`.

### 7. `debts`
- **Propósito:** Deudas contraídas (`owed`) o préstamos concedidos (`receivable`).
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `type` (String 'owed'|'receivable'), `counterpart` (String), `concept` (String), `total_amount` (Numeric), `currency` (String), `category` (String), `start_date` (Date), `due_date` (Date), `is_settled` (Boolean), `notes` (String), `created_at`.

### 8. `debt_payments`
- **Propósito:** Movimientos de amortización o incremento sobre una deuda.
- **Columnas:** `id` (UUID PK), `debt_id` (UUID FK -> `debts.id` CASCADE), `amount` (Numeric), `currency` (String), `transaction_type` (String 'payment'|'increase'), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs`, `rate_usdt_bs`, `payment_date` (Date), `note` (String), `category` (String), `create_expense` (Boolean), `expense_id` (UUID FK -> `expenses.id` SET NULL), `income_id` (UUID FK -> `incomes.id` SET NULL), `paid_by_name`, `paid_by_user_id` (UUID FK -> `profiles.id`), `sync_id` (UUID), `mirror_payment_id` (UUID), `created_at`.

### 9. `estimated_incomes`
- **Propósito:** Planificación de ingresos recurrentes o eventuales esperados en el mes.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `name` (String), `expected_amount` (Numeric), `currency` (String), `category` (String), `payment_day` (Numeric), `is_active` (Boolean), `notes` (String), `created_at`, `deactivated_at`.

### 10. `income_checks`
- **Propósito:** Comprobante mensual de cobro real sobre un ingreso estimado.
- **Columnas:** `id` (UUID PK), `income_id` (UUID FK -> `estimated_incomes.id` CASCADE), `month_year` (String 7), `real_amount` (Numeric), `currency` (String), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs`, `rate_usdt_bs`, `payment_date` (Date), `is_partial` (Boolean), `pending_date` (Date), `notes` (String), `created_at`.
- **Restricción:** `UNIQUE(income_id, month_year)`.

### 11. `incomes`
- **Propósito:** Registro transaccional de ingresos directos ejecutados.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `amount` (Numeric), `currency` (String), `description` (String), `category` (String), `date` (Date), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs`, `rate_usdt_bs`, `income_check_id` (UUID FK -> `income_checks.id` CASCADE), `created_at`.
- **Índices:** `ix_incomes_user_id_date (user_id, date)`.

### 12. `push_subscriptions`
- **Propósito:** Registro de tokens FCM únicos para envío de notificaciones Web Push.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `fcm_token` (String UNIQUE), `created_at`.

### 13. `notifications`
- **Propósito:** Historial in-app de notificaciones para la campana de alertas.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `title` (String), `body` (String), `type` (String), `is_read` (Boolean), `url` (String), `is_resolved` (Boolean), `entity_type` (String), `entity_id` (UUID), `created_at`.

### 14. `connections`
- **Propósito:** Solicitudes y vínculos de amistad ("Panas") entre dos usuarios.
- **Columnas:** `id` (UUID PK), `requester_id` (UUID FK -> `profiles.id` CASCADE), `receiver_id` (UUID FK -> `profiles.id` CASCADE), `status` (String 'pending'|'accepted'|'rejected'), `created_at`, `updated_at`.
- **Restricción:** `UNIQUE(requester_id, receiver_id)`.

### 15. `saving_goals`
- **Propósito:** Metas y fondos de ahorro.
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `name` (String), `type` (String 'saving'), `target_amount` (Numeric), `currency` (String), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `target_date` (Date), `category` (String), `color` (String), `icon` (String), `is_completed` (Boolean), `completed_at` (Timestamp), `is_active` (Boolean), `notes` (String), `created_at`.

### 16. `saving_deposits`
- **Propósito:** Movimientos sobre fondos de ahorro (depósitos o retiros).
- **Columnas:** `id` (UUID PK), `goal_id` (UUID FK -> `saving_goals.id` CASCADE), `amount` (Numeric), `currency` (String), `transaction_type` (String 'deposit'|'withdrawal'), `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt`, `rate_usd_bs`, `rate_eur_bs`, `rate_usdt_bs`, `deposit_date` (Date), `note` (String), `category` (String), `create_expense` (Boolean), `expense_id` (UUID FK -> `expenses.id` SET NULL), `paid_by_name`, `paid_by_user_id` (UUID FK -> `profiles.id`), `sync_id` (UUID), `mirror_deposit_id` (UUID), `created_at`.

### 17. `shares`
- **Propósito:** Tabla maestra de compartición unificada.
- **Columnas:** `id` (UUID PK), `entity_type` (String 'debt'|'fixed_expense'|'saving_goal'|'budget'), `owner_id` (UUID FK -> `profiles.id` CASCADE), `created_at`.

### 18. `share_members`
- **Propósito:** Membresías y roles de usuarios dentro de un recurso compartido.
- **Columnas:** `share_id` (UUID FK -> `shares.id` CASCADE PK), `user_id` (UUID FK -> `profiles.id` CASCADE PK), `entity_id` (UUID), `role` (String 'admin'|'member'), `added_by` (UUID FK -> `profiles.id`), `joined_at`, `local_category` (String), `perspective_type` (String), `counterpart_label` (String).

### 19. `monthly_budgets`
- **Propósito:** Cabecera de presupuestos mensuales (principal y subpresupuestos adicionales).
- **Columnas:** `id` (UUID PK), `user_id` (UUID FK -> `profiles.id` CASCADE), `month_year` (String 7), `name` (String default 'Presupuesto Principal'), `currency` (String), `income_mode` (String 'manual'|'single_income'|'all_incomes'), `linked_income_id` (UUID FK -> `estimated_incomes.id` SET NULL), `manual_global_limit` (Numeric), `effective_global_limit` (Numeric), `is_confirmed` (Boolean), `is_primary` (Boolean), `notified_month_start` (Boolean), `notified_global_80` (Boolean), `notified_global_100` (Boolean), `created_at`, `updated_at`.
- **Restricción:** `UNIQUE(user_id, month_year, name)`.

### 20. `budget_category_limits`
- **Propósito:** Límites de gasto asignados por categoría dentro de un presupuesto mensual.
- **Columnas:** `id` (UUID PK), `budget_id` (UUID FK -> `monthly_budgets.id` CASCADE), `category_name` (String), `limit_amount` (Numeric), `currency` (String), `notified_80` (Boolean), `notified_100` (Boolean), `created_at`, `updated_at`.
- **Restricción:** `UNIQUE(budget_id, category_name)`.

### 21. `daily_rates`
- **Propósito:** Registro histórico y caché de cotizaciones diarias oficiales BCV y Binance P2P.
- **Columnas:** `fecha` (Date PK), `usd_bs` (Numeric), `eur_bs` (Numeric), `usdt_bs` (Numeric), `source` (String), `updated_at` (Timestamp).

---

# 5. Catálogo Exhaustivo de Archivos del Proyecto

## 5.1 Archivos en la Raíz del Repositorio

| Archivo | Propósito |
| :--- | :--- |
| `schema.sql` | Esquema DDL canónico de PostgreSQL con la definición completa de las 21 tablas, triggers de perfil, índices de fecha y RLS. |
| `rls_policies.sql` | Políticas de seguridad Row Level Security para aislamiento estricto de tablas de usuario personal. |
| `rls_connections.sql` | Políticas de seguridad Row Level Security para la red social financiera de Panas y compartición. |
| `README.md` | Documentación maestra de bienvenida, stack, instalación, despliegue y referencia de API. |
| `DOCUMENTACION_DETALLADA.md` | Este documento de referencia técnica profunda, arquitectura y catálogo integral. |
| `.gitignore` | Reglas de exclusión para Git (node_modules, venv, .env, archivos temporales y builds). |
| `.antigravityignore` | Reglas de exclusión de indexación para asistentes de inteligencia artificial. |

## 5.2 Backend (`backend/app/`)

| Archivo | Propósito y Responsabilidades |
| :--- | :--- |
| `backend/app/main.py` | Entrada de FastAPI, configuración de CORS, ciclo de vida `lifespan`, bucle de `_self_ping_loop` con pausa nocturna, scheduler de notificaciones, registro de los 13 routers y `/health`. |
| `backend/app/database.py` | Configuración del motor asíncrono SQLAlchemy (`create_async_engine`), pool de conexiones `asyncpg`, clase base declarativa `Base` y generador de sesiones `get_db`. |
| `backend/app/models.py` | Definición de modelos ORM de SQLAlchemy 2.0 para las 21 tablas canónicas del sistema. |
| `backend/app/schemas.py` | Esquemas DTO de Pydantic v2 para validación estricta de tipos de entrada y serialización de salida. |
| `backend/app/auth.py` | Middleware de autenticación asíncrona mediante validación de claves JWKS de Supabase en memoria. |
| `backend/app/bcv_service.py` | Motor de cotizaciones: scraping de BCV oficial, consulta P2P a Binance, conversiones multimoneda, persistencia en `daily_rates` y sembrado histórico. |
| `backend/app/user_resolver.py` | Resolución de identidad: cascada de nombres y avatares con caídas resilientes desde `profiles` y `auth.users`. |
| `backend/app/push_service.py` | Despacho de notificaciones Web Push hacia Firebase Cloud Messaging mediante Firebase Admin SDK. |
| `backend/app/sharing.py` | Motor unificado de compartición de entidades (`debt`, `fixed_expense`, `saving_goal`, `budget`) y roles de Panas. |
| `backend/app/time_utils.py` | Utilidades de fecha y hora sincronizadas con la Hora Legal de Venezuela (UTC-4 / VET). |
| `backend/app/crud.py` | Operaciones de base de datos para gastos diarios, transacciones de ingresos y categorías. |
| `backend/app/crud_budgets.py` | Lógica de presupuestos mensuales, límites por categoría, clonado automático continuo y cálculo de alertas. |
| `backend/app/crud_debts.py` | Lógica de deudas, historial de abonos/incrementos y generación de cuentas espejo simétricas. |
| `backend/app/crud_fixed_expenses.py` | Lógica de gastos fijos recurrentes, comprobantes mensuales y conversión automática a gastos. |
| `backend/app/crud_incomes.py` | Lógica de ingresos estimados proyectados y comprobantes mensuales de cobro parcial/total. |
| `backend/app/crud_savings.py` | Lógica de fondos de ahorro, depósitos y retiros de capital. |
| `backend/app/crud_connections.py` | Lógica de conexiones entre usuarios ("Panas"), solicitudes, aceptación y balance general. |
| `backend/app/routers/expenses.py` | Router REST para `/api/expenses`: CRUD de gastos, resúmenes agrupados y tasas en fecha (`target_date`). |
| `backend/app/routers/incomes.py` | Router REST para `/api/incomes` y `/api/estimated-incomes`: cobros proyectados y transacciones directas. |
| `backend/app/routers/categories.py` | Router REST para `/api/categories`: categorías de gastos y categorías de ingresos (`/income`). |
| `backend/app/routers/budgets.py` | Router REST para `/api/budgets`: presupuestos principales y subpresupuestos mensuales. |
| `backend/app/routers/reports.py` | Router REST para `/api/reports`: análisis comparativo entre periodos y envío de reportes adjuntos por correo (SMTP/Resend). |
| `backend/app/routers/debts.py` | Router REST para `/api/debts`: deudas por pagar y cobrar, abonos e incrementos. |
| `backend/app/routers/fixed_expenses.py` | Router REST para `/api/fixed-expenses`: catálogo y pagos mensuales. |
| `backend/app/routers/savings.py` | Router REST para `/api/savings`: metas, depósitos y retiros. |
| `backend/app/routers/connections.py` | Router REST para `/api/connections`: solicitudes de amistad y balance consolidado. |
| `backend/app/routers/shares.py` | Router REST para `/api/shares`: membresías, roles y administración de ítems compartidos. |
| `backend/app/routers/notifications.py`| Router REST para `/api/notifications`: historial in-app y marcado de leídas. |
| `backend/app/routers/push.py` | Router REST para `/api/push`: registro de tokens FCM y webhook disparador `/cron`. |
| `backend/app/routers/profiles.py` | Router REST para `/api/profile`: lectura auto-hidratada y actualización de preferencias. |
| `backend/requirements.txt` | Lista congelada de dependencias Python de producción. |

## 5.3 Frontend (`frontend/src/`) y Feature Folders

| Archivo / Directorio | Propósito y Contenido |
| :--- | :--- |
| `frontend/src/main.tsx` | Punto de entrada que monta la aplicación React 19 en el DOM. |
| `frontend/src/App.tsx` | Enrutamiento principal con React Router DOM v7, lazy loading, layout shell y protección de rutas. |
| `frontend/src/index.css` | Sistema de diseño global CSS: tokens, temas claro/oscuro, paleta por herramienta y tipografía Inter. |
| `frontend/src/api.ts` | Cliente Axios centralizado con interceptores automáticos de autenticación Bearer y catálogo de llamadas API. |
| `frontend/src/types.ts` | Definiciones canónicas de TypeScript: interfaces de modelos, payloads de entrada, respuestas y enumeraciones de divisa. |
| `frontend/src/firebase.ts` | Inicialización de Firebase JS SDK v12 y exportación del objeto `messaging`. |
| `frontend/src/pushManager.ts` | Registro del Service Worker y solicitud interactiva del token FCM al navegador. |
| `frontend/src/supabaseClient.ts` | Inicialización del cliente Supabase JS para operaciones de autenticación de usuario. |
| `frontend/src/sw.ts` | Service Worker PWA con Workbox (estrategias de caché) e interceptor de notificaciones push de Firebase en segundo plano. |
| `frontend/src/context/AuthContext.tsx` | Proveedor del estado de autenticación de usuario, sesión activa y perfil hidratado. |
| `frontend/src/context/CategoriesContext.tsx` | Proveedor y caché en memoria de categorías (tanto de gastos como de ingresos). |
| `frontend/src/context/CurrencyPreferenceContext.tsx` | Proveedor de la divisa principal de visualización del usuario (`USD`, `BS`, `EUR`, `USDT`) con persistencia en `localStorage`. |
| `frontend/src/context/NotificationContext.tsx` | Proveedor de alertas: contador en tiempo real de notificaciones no leídas y control del drawer. |
| `frontend/src/hooks/useReportExport.ts` | Hook personalizado que orquesta la configuración, normalización y generación de reportes exportables. |
| `frontend/src/utils/categoryVisuals.ts` | Mapeo de 12 colores semánticos, 45+ íconos Lucide y motor heurístico `NAME_TO_ICON`. |
| `frontend/src/utils/currencyFormat.ts` | Formateador internacional de cifras monetarias y conversiones de visualización. |
| `frontend/src/utils/currencySummary.ts` | Funciones auxiliares para sumatorias multimoneda, resolución de totales y promedios diarios. |
| `frontend/src/utils/toolColors.ts` | Paleta de colores distintiva para cada herramienta financiera (`budgets`, `fixedExpenses`, `income`, `debts`, `savings`, `panas`, `reports`). |
| `frontend/src/utils/exporters/entityTemplates.ts` | Plantillas de normalización que convierten cualquier entidad (deuda, ahorro, presupuesto, etc.) en un documento exportable estándar. |
| `frontend/src/utils/exporters/pdfExporter.ts` | Generador de PDFs ejecutivos de alta fidelidad utilizando `jspdf` y `jspdf-autotable`. |
| `frontend/src/utils/exporters/spreadsheetExporter.ts` | Generador de libros de cálculo multi-hoja en Excel (`.xlsx`) y tablas planas CSV UTF-8 BOM con SheetJS. |
| `frontend/src/components/auth/` | `Auth.tsx`, `ResetPassword.tsx` y estilos de inicio de sesión y registro. |
| `frontend/src/components/budgets/` | `Budgets.tsx`, `BudgetFormModal.tsx`, `CategoryLimitModal.tsx` y constantes del motor de presupuestos. |
| `frontend/src/components/common/` | Componentes transversales: `CategorySelect.tsx` y `ExchangeRateField.tsx`. |
| `frontend/src/components/dashboard/` | `Dashboard.tsx`, `ExpenseForm.tsx`, `ExpenseList.tsx`, `ExpenseItem.tsx`, `Summary.tsx`, `PeriodSelector.tsx` y `AmountRangeFilter.tsx`. |
| `frontend/src/components/debts/` | `DebtList.tsx`, `DebtForm.tsx` y `DebtPaymentForm.tsx` (con soporte de abonos e incrementos). |
| `frontend/src/components/fixed-expenses/` | `FixedExpenses.tsx`, `FixedExpenseForm.tsx` y `FixedExpensePayForm.tsx`. |
| `frontend/src/components/incomes/` | `EstimatedIncomeList.tsx`, `EstimatedIncomeForm.tsx` e `IncomeCheckForm.tsx`. |
| `frontend/src/components/layout/` | `BottomNav.tsx`, `NotificationBell.tsx`, `NotificationSheet.tsx`, `InstallPWA.tsx`, `WakeUpLoader.tsx` y `ErrorBoundary.tsx`. |
| `frontend/src/components/panas/` | `PanasPage.tsx`, `PanaDetailModal.tsx`, `InvitePanaModal.tsx`, `MemberAvatars.tsx`, `ParticipantPicker.tsx`, `ShareMembersModal.tsx`, `ShareSubBudgetModal.tsx`, `LocalCategoryModal.tsx` y `LeaveShareModal.tsx`. |
| `frontend/src/components/rates/` | `RatesPage.tsx`: Pantalla de cotizaciones oficiales en vivo, historial con selector de fecha y calculadora interactiva. |
| `frontend/src/components/reports/` | `ReportsHub.tsx` (Centro de Resúmenes), `ExportStudioPanel.tsx` (Estudio de Exportaciones) y `ReportCharts.tsx` (Gráficos vectoriales SVG). |
| `frontend/src/components/savings/` | `SavingGoals.tsx`, `SavingGoalForm.tsx` y `SavingDepositForm.tsx` (con soporte de aportes y retiros). |
| `frontend/src/components/settings/` | `SettingsPage.tsx`, `ProfileManager.tsx`, `NotificationSettings.tsx` y `CategoryManager.tsx`. |
| `frontend/src/components/tools/` | `ToolsHub.tsx`: Panel principal de acceso rápido a todas las herramientas financieras. |
| `frontend/src/components/ui/` | Primitivas UI: `PageHeader`, `ListCard`, `ListCardBottomSheet`, `SummaryHeroCard`, `CurrencyBreakdownCard`, `MonthPicker`, `SegmentedTabs`, `ConfirmModal`, `EmptyState`, `Skeleton` y `Toast`. |
| `frontend/api/cron/notifications.ts` | Vercel Serverless Function que recibe la llamada de Vercel Cron y despacha el push seguro a `/api/push/cron`. |
| `frontend/vercel.json` | Configuración de Vercel: reescrituras de SPA y programación de los cron jobs (9:00 AM y 7:00 PM VET). |
| `frontend/vite.config.ts` | Configuración de Vite 8, optimización de bundles, alias y plugin VitePWA. |

---

# 6. Matriz Completa de Endpoints de la API REST (13 Routers)

Todas las rutas (excepto `/`, `/health` y `/api/expenses/rates`) exigen el encabezado HTTP: `Authorization: Bearer <supabase_jwt>`.

### 1. Router de Gastos Diarios y Tasas (`/api/expenses`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/expenses/` | Lista paginada de gastos del usuario | Query: `date_from`, `date_to` |
| `POST` | `/api/expenses/` | Crea un nuevo gasto con snapshot multimoneda | Body: `ExpenseCreate` |
| `GET` | `/api/expenses/{expense_id}` | Obtiene los detalles de un gasto | Path: `expense_id` |
| `PUT` | `/api/expenses/{expense_id}` | Actualiza monto, categoría, notas o tasa | Body: `ExpenseUpdate` |
| `DELETE` | `/api/expenses/{expense_id}` | Elimina un gasto del sistema | Path: `expense_id` |
| `GET` | `/api/expenses/summary` | Resumen global acumulado de gastos | Ninguno |
| `GET` | `/api/expenses/summary-range` | Resumen estadístico agrupado por periodo | Query: `date_from`, `date_to` |
| `GET` | `/api/expenses/rates` | Devuelve tasas oficiales (actuales o históricas) | Query opcional: `target_date=YYYY-MM-DD` |

### 2. Router de Ingresos Directos y Estimados (`/api/incomes` y `/api/estimated-incomes`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/incomes/` | Lista transacciones de ingresos reales del usuario | Query opcional: `from`, `to` |
| `POST` | `/api/incomes/` | Registra una nueva entrada de ingreso real | Body: `IncomeCreate` |
| `GET` | `/api/incomes/{income_id}` | Detalle de un ingreso real | Path: `income_id` |
| `PUT` | `/api/incomes/{income_id}` | Actualiza un ingreso real existente | Body: `IncomeUpdate` |
| `DELETE` | `/api/incomes/{income_id}` | Elimina un ingreso real | Path: `income_id` |
| `GET` | `/api/estimated-incomes/` | Lista de fuentes de ingreso estimadas | Query: `active_only` |
| `POST` | `/api/estimated-incomes/` | Crea una proyección de ingreso mensual recurrente | Body: `EstimatedIncomeCreate` |
| `GET` | `/api/estimated-incomes/monthly/{month_year}` | Retorna proyecciones y estado de cobro en el mes | Path: `month_year` (YYYY-MM) |
| `GET` | `/api/estimated-incomes/{income_id}` | Detalle de un ingreso estimado | Path: `income_id` |
| `PUT` | `/api/estimated-incomes/{income_id}` | Modifica monto, concepto o día de cobro | Body: `EstimatedIncomeUpdate` |
| `DELETE` | `/api/estimated-incomes/{income_id}` | Desactiva o elimina una proyección de ingreso | Path: `income_id` |
| `POST` | `/api/estimated-incomes/{income_id}/checks` | Registra cobro real (total o parcial con reprogramación)| Body: `IncomeCheckCreate` |
| `DELETE` | `/api/estimated-incomes/{income_id}/checks/{month_year}`| Elimina el comprobante de cobro de un mes | Path: `income_id`, `month_year` |

### 3. Router de Categorías de Gastos e Ingresos (`/api/categories`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories/` | Obtiene todas las categorías de gastos del usuario | Ninguno |
| `POST` | `/api/categories/` | Crea una nueva categoría de gastos | Body: `CategoryCreate` |
| `POST` | `/api/categories/seed-defaults` | Restaura el conjunto predeterminado de gastos | Ninguno |
| `PUT` | `/api/categories/{category_id}` | Modifica una categoría de gastos | Body: `CategoryCreate` |
| `DELETE` | `/api/categories/{category_id}` | Elimina categoría de gastos (los gastos van a "Sin Categoría") | Path: `category_id` |
| `GET` | `/api/categories/income` | Obtiene todas las categorías de ingresos | Ninguno |
| `POST` | `/api/categories/income` | Crea una nueva categoría de ingresos | Body: `CategoryCreate` |
| `POST` | `/api/categories/income/seed-defaults` | Restaura categorías predeterminadas de ingresos | Ninguno |
| `PUT` | `/api/categories/income/{category_id}` | Modifica una categoría de ingresos | Body: `CategoryCreate` |
| `DELETE` | `/api/categories/income/{category_id}` | Elimina una categoría de ingresos | Path: `category_id` |

### 4. Router de Presupuestos Mensuales (`/api/budgets`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/budgets/categories` | Lista categorías elegibles para presupuestos | Ninguno |
| `GET` | `/api/budgets/monthly/{month_year}` | Obtiene o auto-clona la vista de presupuestos del mes | Path: `month_year` |
| `PUT` | `/api/budgets/monthly/{month_year}` | Actualiza la configuración del presupuesto principal | Body: `MonthlyBudgetUpsert` |
| `POST` | `/api/budgets/monthly/{month_year}/confirm` | Confirma explícitamente el presupuesto clonado | Path: `month_year` |
| `PUT` | `/api/budgets/monthly/{month_year}/category` | Agrega o modifica el límite para una categoría | Body: `BudgetCategoryLimitInput` |
| `DELETE` | `/api/budgets/monthly/{month_year}/category/{name}`| Elimina el límite de una categoría del mes | Path: `month_year`, `name` |
| `POST` | `/api/budgets/monthly/{month_year}` | Crea un subpresupuesto nombrado adicional | Body: `MonthlyBudgetCreate` |
| `PUT` | `/api/budgets/{budget_id}` | Modifica un subpresupuesto por su UUID | Body: `MonthlyBudgetUpdate` |
| `POST` | `/api/budgets/{budget_id}/primary` | Marca el presupuesto especificado como principal | Path: `budget_id` |
| `DELETE` | `/api/budgets/{budget_id}` | Elimina un subpresupuesto por su UUID | Path: `budget_id` |
| `PUT` | `/api/budgets/{budget_id}/category` | Modifica un límite referenciado al ID de presupuesto | Body: `BudgetCategoryLimitInput` |
| `DELETE` | `/api/budgets/{budget_id}/category/{name}` | Elimina un límite del presupuesto por su ID | Path: `budget_id`, `name` |

### 5. Router de Resúmenes Analíticos y Exportaciones (`/api/reports`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/analysis` | Análisis comparativo entre Periodo A y Periodo B | Query: `date_from_a`, `date_to_a`, `date_from_b`, `date_to_b` |
| `POST` | `/api/reports/send-email` | Envía reporte adjunto (PDF/Excel) por correo (SMTP/Resend) | Body: `SendReportEmailRequest` |

### 6. Router de Deudas y Préstamos (`/api/debts`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/debts/` | Lista deudas según tipo y estado | Query: `type`, `is_settled` |
| `POST` | `/api/debts/` | Crea una nueva deuda por pagar o por cobrar | Body: `DebtCreate` |
| `GET` | `/api/debts/{debt_id}` | Detalle de la deuda e historial de pagos e incrementos | Path: `debt_id` |
| `PUT` | `/api/debts/{debt_id}` | Modifica las condiciones originales de la deuda | Body: `DebtUpdate` |
| `DELETE` | `/api/debts/{debt_id}` | Elimina una deuda del sistema | Path: `debt_id` |
| `POST` | `/api/debts/{debt_id}/payments` | Registra un abono (`payment`) o aumento (`increase`)| Body: `DebtPaymentCreate` |
| `PUT` | `/api/debts/payments/{payment_id}` | Modifica un abono o incremento registrado | Body: `DebtPaymentUpdate` |
| `DELETE` | `/api/debts/payments/{payment_id}` | Elimina un abono o incremento | Path: `payment_id` |

### 7. Router de Gastos Fijos (`/api/fixed-expenses`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/fixed-expenses/` | Lista los gastos fijos configurados | Query: `active_only` |
| `POST` | `/api/fixed-expenses/` | Crea un gasto recurrente con día de corte mensual | Body: `FixedExpenseCreate` |
| `GET` | `/api/fixed-expenses/summary` | Estadísticas acumuladas y porcentaje de pago del mes | Query opcional: `month` |
| `GET` | `/api/fixed-expenses/monthly/{month_year}` | Lista gastos fijos indicando si ya fueron pagados | Path: `month_year` |
| `PUT` | `/api/fixed-expenses/{expense_id}` | Modifica monto, concepto o día de corte | Body: `FixedExpenseUpdate` |
| `DELETE` | `/api/fixed-expenses/{expense_id}` | Desactiva o elimina un gasto fijo | Path: `expense_id` |
| `POST` | `/api/fixed-expenses/{expense_id}/check` | Marca como pagado con opción de crear gasto real | Body: `FixedExpenseCheckCreate` |
| `DELETE` | `/api/fixed-expenses/{expense_id}/check/{month_year}`| Desmarca el pago de un mes específico | Path: `expense_id`, `month_year` |

### 8. Router de Metas de Ahorro (`/api/savings`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/savings/` | Lista metas de ahorro del usuario | Query: `is_completed`, `is_active` |
| `POST` | `/api/savings/` | Crea un nuevo fondo de ahorro con monto y plazo | Body: `SavingGoalCreate` |
| `GET` | `/api/savings/summary` | Estadísticas del total acumulado y porcentaje global | Ninguno |
| `GET` | `/api/savings/{goal_id}` | Detalle de la meta y desglose de movimientos | Path: `goal_id` |
| `PUT` | `/api/savings/{goal_id}` | Modifica nombre, meta o fecha límite | Body: `SavingGoalUpdate` |
| `DELETE` | `/api/savings/{goal_id}` | Elimina una meta de ahorro | Path: `goal_id` |
| `POST` | `/api/savings/{goal_id}/deposits` | Registra un depósito (`deposit`) o retiro (`withdrawal`)| Body: `SavingDepositCreate` |
| `PUT` | `/api/savings/deposits/{deposit_id}` | Actualiza un depósito o retiro previo | Body: `SavingDepositUpdate` |
| `DELETE` | `/api/savings/deposits/{deposit_id}` | Elimina un depósito o retiro | Path: `deposit_id` |

### 9. Router de Compartición Unificada ("Shares") (`/api/shares`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/shares/by-entity/{entity_id}` | Retorna metadatos de compartición de una entidad | Path: `entity_id` |
| `POST` | `/api/shares/{share_id}/members` | Añade integrantes a un ítem compartido | Body: `{ user_ids, admin_ids }` |
| `PATCH` | `/api/shares/{share_id}/members/{user_id}`| Modifica el rol de un integrante (`admin`|`member`)| Body: `{ role }` |
| `DELETE` | `/api/shares/{share_id}/members/{user_id}`| Expulsa o permite abandonar un ítem compartido | Path: `share_id`, `user_id` |
| `PATCH` | `/api/shares/entity/{entity_id}/category`| Actualiza la categoría local para el miembro | Body: `{ category_name }` |

### 10. Router de Conexiones entre Panas (`/api/connections`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/connections/` | Lista conexiones activas y solicitudes pendientes | Ninguno |
| `GET` | `/api/connections/overview` | Balance financiero consolidado con todos los panas | Ninguno |
| `GET` | `/api/connections/partner/{partner_id}/details`| Desglose pormenorizado de finanzas con un pana | Path: `partner_id` |
| `POST` | `/api/connections/request` | Envía solicitud de amistad por correo electrónico | Body: `{ email }` |
| `POST` | `/api/connections/request-by-user/{target_id}`| Envía solicitud de amistad por UUID de usuario | Path: `target_id` |
| `PUT` | `/api/connections/{connection_id}/accept`| Acepta una solicitud de amistad recibida | Path: `connection_id` |
| `PUT` | `/api/connections/{connection_id}/reject`| Rechaza una solicitud de amistad recibida | Path: `connection_id` |
| `DELETE` | `/api/connections/{connection_id}` | Elimina una conexión existente entre panas | Path: `connection_id` |

### 11. Router de Notificaciones e Historial In-App (`/api/notifications`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications/` | Obtiene el historial de avisos in-app | Query opcional: `unread_only` |
| `PATCH` | `/api/notifications/mark-read` | Marca todas las notificaciones como leídas | Ninguno |
| `PATCH` | `/api/notifications/{notification_id}/read`| Marca una notificación individual como leída | Path: `notification_id` |

### 12. Router de Suscripciones Push y Cron (`/api/push`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/push/subscribe` | Registra el token FCM del dispositivo para Web Push | Body: `{ fcm_token }` |
| `POST` | `/api/push/unsubscribe` | Desvincula un token FCM de la cuenta del usuario | Body: `{ fcm_token }` |
| `POST` | `/api/push/test` | Envía una notificación push de diagnóstico al usuario | Ninguno |
| `POST` / `GET` | `/api/push/cron` | Disparador seguro del cron matutino/vespertino | Header: `Authorization: Bearer <CRON_SECRET>` |

### 13. Router de Perfil de Usuario (`/api/profile`)
| Método | Ruta | Descripción | Payload / Parámetros |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/profile/` | Devuelve el perfil del usuario actual (auto-hidratado)| Ninguno |
| `PUT` | `/api/profile/` | Actualiza nombre para mostrar, avatar y preferencias | Body: `ProfileUpdate` |

---

# 7. Configuración de Entorno y Despliegue

### Entorno Backend (`backend/.env`)
```env
# Conexión asíncrona a Supabase PostgreSQL (Modo Session o Transaction con asyncpg)
DATABASE_URL=postgresql+asyncpg://postgres.xxxx:tu_password@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# URL raíz del proyecto Supabase para verificación asimétrica de firmas JWKS
SUPABASE_URL=https://tu-proyecto.supabase.co

# URL pública de tu aplicación Frontend en Vercel
FRONTEND_URL=https://gastosapp.vercel.app

# Clave secreta compartida con Vercel para autorizar el webhook /api/push/cron
CRON_SECRET=super_secret_cron_token_32chars

# Lista blanca de orígenes permitidos por CORS
ALLOWED_ORIGINS=http://localhost:5173,https://gastosapp.vercel.app

# Credencial JSON de Firebase Admin SDK codificada en Base64 (ideal para Render)
FIREBASE_SERVICE_ACCOUNT_BASE64=eyJuYW1lIjogImdhc3RvcyJ9...

# Configuración de Correo para despacho de reportes (SMTP o Resend)
SMTP_USER=notificaciones@tudominio.com
SMTP_PASSWORD=tu_app_password_de_16_caracteres
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
# Opcional (Alternativa a SMTP):
# RESEND_API_KEY=re_123456789...
# RESEND_FROM_EMAIL=GastosApp <reportes@tudominio.com>
```

### Entorno Frontend (`frontend/.env`)
```env
# URL base de la API backend (debe terminar en /api)
VITE_API_URL=http://localhost:8000/api

# Credenciales de Supabase Auth
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_publica

# Credenciales de Firebase Cloud Messaging (Web Push)
VITE_FIREBASE_API_KEY=tu_api_key_firebase
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef
VITE_FIREBASE_VAPID_KEY=tu_vapid_key_publica

# Token secreto para la función serverless de Vercel Cron
CRON_SECRET=super_secret_cron_token_32chars
```

### Programación del Cron en `frontend/vercel.json`
```json
{
  "rewrites": [
    {
      "source": "/((?!api/|sw\\.js|workbox-.*\\.js|manifest\\.webmanifest).*)",
      "destination": "/index.html"
    }
  ],
  "crons": [
    {
      "path": "/api/cron/notifications?window=morning",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/notifications?window=evening",
      "schedule": "0 23 * * *"
    }
  ]
}
```
- `0 13 * * *`: 13:00 UTC = **9:00 AM VET** (Resumen matutino).
- `0 23 * * *`: 23:00 UTC = **7:00 PM VET** (Resumen vespertino).

---

*Documentación técnica de referencia para GastosApp — Diseñado y construido con precisión para el control financiero moderno.*
