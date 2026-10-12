# 📘 Documentación Detallada: Arquitectura, Funcionamiento y Catálogo de Archivos de GastosApp

Este documento contiene la explicación exhaustiva de cómo funciona **GastosApp**, su arquitectura técnica, el flujo de datos entre componentes y la descripción detallada de cada archivo del proyecto.

---

# 📑 Índice

1. [Visión General de GastosApp](#1-visión-general-de-gastosapp)
2. [Arquitectura del Sistema y Flujo de Datos](#2-arquitectura-del-sistema-y-flujo-de-datos)
3. [Funcionamiento Detallado por Módulos](#3-funcionamiento-detallado-por-módulos)
   - [3.1 Autenticación y Perfil de Usuario](#31-autenticación-y-perfil-de-usuario)
   - [3.2 Motor Multidivisa y Conversiones Históricas](#32-motor-multidivisa-y-conversiones-históricas)
   - [3.3 Gastos Diarios y Balance](#33-gastos-diarios-y-balance)
   - [3.4 Hub de Herramientas Financieras](#34-hub-de-herramientas-financieras)
   - [3.5 Finanzas Colaborativas ("Panas")](#35-finanzas-colaborativas-panas)
   - [3.6 Sistema de Notificaciones Push y Alertas Programadas](#36-sistema-de-notificaciones-push-y-alertas-programadas)
   - [3.7 Progressive Web App (PWA) y Mecanismo Antidormida](#37-progressive-web-app-pwa-y-mecanismo-antidormida)
4. [Catálogo Exhaustivo de Archivos](#4-catálogo-exhaustivo-de-archivos)
   - [Raíz del Proyecto](#raíz-del-proyecto)
   - [Backend (`/backend`)](#backend-backend)
   - [Frontend (`/frontend`)](#frontend-frontend)

---

# 1. Visión General de GastosApp

**GastosApp** es una Progressive Web App (**PWA**) *mobile-first* creada para resolver dos grandes problemas de la administración financiera personal:
1. **La economía multimoneda:** En economías como la venezolana, las transacciones se realizan en Bolívares (BS), Dólares en efectivo (USD Cash), Dólares tasa oficial BCV, Euros oficiales o criptomonedas estables (USDT). La variación constante del tipo de cambio hace que los balances históricos en una sola moneda pierdan sentido. GastosApp calcula y almacena la foto de cada transacción en cuatro monedas al instante.
2. **Las finanzas compartidas en la vida real:** Parejas, roomies o familiares frecuentemente comparten deudas o gastos fijos (alquiler, servicios, salidas). GastosApp implementa el concepto de **"Panas"**, permitiendo que dos usuarios conecten sus cuentas y colaboren de manera sincronizada.

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
   - El middleware `get_current_user` valida la firma del token mediante las llaves públicas JWKS de Supabase (guardadas en memoria) y extrae el `user_id`.
   - Consulta el servicio de tasas (`bcv_service.py`), el cual tiene en caché la cotización actual del BCV y Binance P2P.
   - Calcula el equivalente del monto en `USD_BCV`, `EUR_BCV`, `USDT` y `BS`.
   - Guarda el registro en la base de datos PostgreSQL de Supabase.
   - Devuelve la respuesta serializada al cliente mediante modelos Pydantic.
4. **El cliente actualiza el estado de React**, refrescando la lista y el resumen general.

---

# 3. Funcionamiento Detallado por Módulos

## 3.1 Autenticación y Perfil de Usuario
- **Supabase Auth:** Maneja las cuentas de usuario mediante correo/contraseña o enlace mágico (*magic link*).
- **Validación JWT sin latencia:** El backend no consulta la base de datos para saber quién hace la petición. Lee el JSON Web Token (JWT) firmado criptográficamente por Supabase y valida su autenticidad usando el endpoint de JWKS (`.well-known/jwks.json`), que queda cacheado en memoria.
- **Creación automática de perfil:** En PostgreSQL, un trigger (`handle_new_user`) detecta cuando un usuario nuevo se registra y automáticamente inserta una fila en `profiles` y genera las categorías iniciales predeterminadas (*Alimentación, Transporte, Vivienda, Ocio, Salud*).

## 3.2 Motor Multidivisa y Conversiones Históricas
- **Monedas soportadas:**
  - `BS`: Bolívares venezolanos.
  - `USD_BCV`: Dólar a tasa oficial del Banco Central de Venezuela.
  - `EUR_BCV`: Euro a tasa oficial del Banco Central de Venezuela.
  - `USDT`: Dólar digital (USDT) a tasa de mercado paralelo según la mediana de compra de Binance P2P.
  - `USD_CASH`: Dólares en efectivo. Admite una tasa manual personalizada o toma la cotización de mercado más alta disponible.
- **Scraping y Caché:**
  - Las tasas oficiales se extraen mediante la librería `pyDolarVenezuela`.
  - La tasa de USDT se extrae haciendo una petición directa a la API P2P de Binance buscando órdenes de compra verificadas.
  - Se utiliza `cachetools.TTLCache` con un tiempo de expiración de 30 minutos (1800 segundos), evitando saturar los servicios externos y asegurando respuestas ultrarrápidas.
- **Preservación histórica:**
  - Cada gasto, abono o ingreso guarda columnas separadas: `amount_bs`, `amount_usd`, `amount_eur`, `amount_usdt` junto con las tasas de conversión vigentes en ese día (`rate_usd_bs`, etc.).
  - Esto garantiza que al revisar transacciones de meses pasados, el balance en dólares o bolívares refleje el poder adquisitivo exacto que tenía el dinero cuando se hizo el gasto.

## 3.3 Gastos Diarios y Balance
- **CRUD Completo:** Creación, lectura, edición y eliminación de gastos.
- **Filtros por periodos:**
  - Presets automáticos: *Hoy, Semana, Mes, Año, Todo el historial*.
  - Rango personalizado mediante selector de fechas `date_from` y `date_to`.
- **Filtro por montos:** Permite aislar gastos entre un monto mínimo y máximo.
- **Resúmenes estadísticos:** El endpoint `/expenses/summary-range` calcula sumas acumuladas por moneda, promedio de gasto diario y desglose porcentual por categoría.
- **Categorías con reasignación segura:** Si un usuario elimina una categoría, los gastos asociados no se pierden: se reasignan automáticamente a la categoría `"Sin Categoría"`.

## 3.4 Hub de Herramientas Financieras
El hub central (`/herramientas`) agrupa funciones financieras avanzadas:

1. **Gastos Fijos (`fixed_expenses`):**
   - Diseñado para pagos que ocurren cada mes (alquiler, luz, suscripciones).
   - Incluye el día de pago del mes (`payment_day`, del 1 al 31).
   - **Historial de Checks (`fixed_expense_checks`):** En lugar de un simple botón que borre el estado el mes siguiente, cada pago queda registrado con su año y mes (`YYYY-MM`).
   - Al marcarlo como pagado, el usuario puede elegir si desea que el sistema cree automáticamente un registro en la tabla de gastos diarios (`create_expense = true`).

2. **Deudas Nuestras (Owed) y Por Cobrar (Receivable):**
   - Registra préstamos o cuentas pendientes con una contraparte, concepto, monto total y fecha límite de pago.
   - Admite abonos parciales sucesivos (`debt_payments`). Cada abono reduce el saldo pendiente y queda registrado con fecha y notas.
   - Cuando la suma de los abonos cubre el 100% de la deuda, el sistema actualiza su estado a liquidada (`is_settled = true`).

3. **Ingresos Estimados (`estimated_incomes`):**
   - Permite proyectar el flujo de ingresos que se esperan recibir en el mes (sueldos, trabajos freelance, dividendos).
   - Registro de confirmación (`income_checks`): Permite indicar si el ingreso ya fue cobrado en su totalidad o de manera parcial, dejando constancia de la fecha en que se espera el saldo restante.

## 3.5 Finanzas Colaborativas ("Panas")
Permite vincular a dos usuarios de GastosApp para gestionar finanzas compartidas:
- **Flujo de Conexión:**
  1. Usuario A busca a Usuario B mediante su correo electrónico.
  2. Se crea una conexión en estado `pending` y se envía una notificación push a Usuario B.
  3. Usuario B puede aceptar (`accepted`) o rechazar (`rejected`) la solicitud.
- **Deudas Espejo Sincronizadas (`shared_debts`):**
  - Si el Usuario A registra una deuda indicando que le debe $50 a su amigo B, el backend automáticamente crea en la cuenta de B una deuda espejo de tipo "Por cobrar" de $50 asociada a A.
  - Si cualquiera de los dos registra un abono de $20, el abono se duplica simétricamente en ambas cuentas, manteniendo el saldo idéntico en tiempo real.
  - Al liquidarse la deuda por completo, ambas cuentas se marcan como saldadas y se notifica al compañero.
- **Gastos Fijos Compartidos (`shared_fixed_expenses`):**
  - Permite a dos usuarios tener el mismo gasto fijo en sus pantallas.
  - Si uno registra el pago mensual de un servicio, el check de pago se refleja en la cuenta de ambos con el nombre de quién realizó el pago.

## 3.6 Sistema de Notificaciones Push y Alertas Programadas
- **Tecnología:** Firebase Cloud Messaging (FCM) + Web Push API.
- **Registro:** El cliente solicita permisos y envía su token FCM al backend (`/api/push/subscribe`), el cual se guarda en `push_subscriptions`. Si un token queda huérfano o inválido, el backend lo detecta y lo elimina automáticamente de la base de datos.
- **Historial In-App:** Cada alerta enviada se guarda en la tabla `notifications`. El usuario puede verlas en cualquier momento desde el icono de campana en la barra superior (`NotificationSheet`), sin importar si tenía las notificaciones del teléfono apagadas.
- **Ventanas de Ejecución del Cron (`/api/push/cron`):**
  - **Ventana de la Mañana (9:00 AM UTC-4):**
    - Gastos fijos que vencen hoy (si aún no han sido pagados).
    - Recordatorio del día después: si un gasto fijo vencía ayer y no fue marcado, pregunta amablemente: *"¿Pagaste tu gasto fijo?"*.
    - Ingresos estimados previstos para hoy o pendientes de ayer.
    - Deudas que vencen hoy o que ya se encuentran vencidas.
  - **Ventana de la Noche (8:00 PM UTC-4):**
    - Recordatorio preventivo de gastos fijos, ingresos y deudas que vencen mañana.
    - Alerta de inactividad: si un usuario registrado lleva 3 días o más sin registrar ningún gasto, se le envía un mensaje: *"Te hemos extrañado 👀. Llevas varios días sin registrar gastos. ¿Registramos algo hoy?"*.
  - **Filtro de preferencias:** Cada usuario puede activar o desactivar individualmente las notificaciones de gastos fijos, deudas, ingresos o inactividad desde los ajustes de su perfil.

## 3.7 Progressive Web App (PWA) y Mecanismo Antidormida
- **Instalabilidad:** Cuenta con `manifest.json`, íconos adaptativos (maskable) de 192px y 512px, y soporte completo para ser instalada en Android, iPhone/iPad (mediante "Añadir a pantalla de inicio" de Safari) y escritorio.
- **Service Worker Avanzado (`sw.ts`):** Utiliza Workbox para precachear el frontend y scripts de Firebase Messaging Compat para interceptar y mostrar notificaciones push en segundo plano, enfocando la aplicación cuando el usuario toca la notificación.
- **Mecanismo Anti-suspensión en Render:** Los servidores gratuitos en Render se suspenden tras 15 minutos de inactividad. GastosApp incluye un bucle interno en `main.py` (`_self_ping_loop`) que realiza una petición interna cada 10 minutos al endpoint `/health`, manteniendo el servidor activo 24/7 sin depender exclusivamente de servicios externos.

---

# 4. Catálogo Exhaustivo de Archivos

## Raíz del Proyecto

| Archivo | Descripción detallada |
| :--- | :--- |
| `schema.sql` | Esquema base de PostgreSQL con las tablas iniciales `categories`, `expenses` y `profiles`. |
| `migrate_profiles.sql` | Crea la tabla `profiles`, políticas RLS y el trigger `handle_new_user` en `auth.users`. |
| `migrate_tools.sql` | Migración que crea la tabla `fixed_expenses` con soporte para tasas multimoneda. |
| `migrate_fixed_expense_checks.sql` | Crea `fixed_expense_checks` para el historial mensual de pagos de gastos fijos. |
| `migrate_debts.sql` | Crea las tablas `debts` y `debt_payments` para préstamos, abonos y deudas. |
| `migrate_connections.sql` | Crea la tabla `connections` para gestionar solicitudes de amistad entre usuarios. |
| `migrate_shared_debts.sql` | Crea `shared_debts` y agrega campos para sincronizar deudas espejo entre dos usuarios. |
| `migrate_shared_fixed_expenses.sql` | Crea `shared_fixed_expenses` para compartir gastos fijos entre usuarios conectados. |
| `migrate_currencies.sql` | Script SQL de compatibilidad para unificar códigos de divisa históricos a `'BS'`. |
| `rls_policies.sql` | Políticas de Row Level Security para aislar datos de gastos y categorías por usuario. |
| `rls_connections.sql` | Políticas de Row Level Security para permitir que solo los usuarios involucrados vean sus conexiones. |
| `run_migration.py` | Script utilitario en Python para ejecutar sentencias DDL directamente sobre la base de datos remota. |
| `add_col.py` | Script auxiliar en Python para agregar columnas puntuales a la base de datos sin borrar datos. |
| `.gitignore` | Exclusiones de control de versiones (node_modules, venv, .env, credenciales, etc.). |
| `README.md` | Guía de inicio rápido, configuración de variables de entorno y despliegue del proyecto. |
| `DOCUMENTACION_DETALLADA.md` | Este archivo con la explicación exhaustiva de código, arquitectura y funcionamiento. |

---

## Backend (`/backend`)

### Núcleo (`backend/app/`)
| Archivo | Descripción detallada |
| :--- | :--- |
| `backend/app/main.py` | Punto de entrada del API. Inicia FastAPI, gestiona el ciclo de vida (`lifespan`), inicializa Firebase Admin, lanza la tarea `_self_ping_loop` y registra todos los routers. |
| `backend/app/database.py` | Configuración del motor asíncrono de SQLAlchemy (`asyncpg`), pool de conexiones, sesión `SessionLocal` y dependencia `get_db`. |
| `backend/app/models.py` | Modelos de base de datos ORM de todas las tablas: Profile, Expense, Category, FixedExpense, Debt, Notification, Connection, etc. |
| `backend/app/schemas.py` | Esquemas de validación y respuesta de Pydantic v2 (DTOs) con tipos de datos estrictos para peticiones y respuestas. |
| `backend/app/auth.py` | Middleware de seguridad que descarga el JWKS de Supabase y valida los tokens JWT de las peticiones para obtener el `user_id`. |
| `backend/app/bcv_service.py` | Módulo encargado de obtener las tasas oficiales del BCV y Binance P2P con caché de 30 minutos y conversor multimoneda. |
| `backend/app/push_service.py` | Servicio de despacho de notificaciones Web Push vía Firebase Admin SDK, limpieza de tokens inválidos y registro in-app. |
| `backend/app/crud.py` | Consultas y operaciones de base de datos para gastos diarios, resúmenes estadísticos y categorías. |
| `backend/app/crud_debts.py` | Lógica de base de datos para crear deudas, registrar abonos, liquidarlas y sincronizar deudas espejo entre "Panas". |
| `backend/app/crud_fixed_expenses.py` | Lógica para gestionar gastos fijos, checks mensuales y sincronización de gastos fijos compartidos. |
| `backend/app/crud_incomes.py` | Lógica para gestionar ingresos proyectados del mes y confirmaciones de cobro real. |
| `backend/app/crud_connections.py` | Lógica para buscar usuarios por correo, enviar solicitudes de conexión, aceptarlas, rechazarlas o borrarlas. |

### Controladores (`backend/app/routers/`)
| Archivo | Descripción detallada |
| :--- | :--- |
| `backend/app/routers/expenses.py` | Rutas `/api/expenses` para CRUD de gastos diarios, consulta de tasas vigentes y balances. |
| `backend/app/routers/categories.py` | Rutas `/api/categories` para crear, editar y listar categorías personalizadas. |
| `backend/app/routers/profiles.py` | Rutas `/api/profile` para leer y actualizar datos del perfil y preferencias de notificación. |
| `backend/app/routers/fixed_expenses.py` | Rutas `/api/fixed-expenses` para administrar gastos fijos y checks mensuales de pago. |
| `backend/app/routers/debts.py` | Rutas `/api/debts` para registrar deudas propias o por cobrar y añadir abonos. |
| `backend/app/routers/incomes.py` | Rutas `/api/incomes` para registrar ingresos proyectados y marcar cobros reales. |
| `backend/app/routers/connections.py` | Rutas `/api/connections` para buscar y gestionar conexiones con otros usuarios. |
| `backend/app/routers/notifications.py` | Rutas `/api/notifications` para listar notificaciones in-app y marcarlas como leídas. |
| `backend/app/routers/push.py` | Rutas `/api/push` para registrar tokens de notificación, enviar pruebas y ejecutar el cron matutino/nocturno. |

### Utilidades y Pruebas del Backend
| Archivo | Descripción detallada |
| :--- | :--- |
| `backend/requirements.txt` | Lista de paquetes y dependencias de Python necesarios para ejecutar el backend. |
| `backend/create_tables.py` | Script que ejecuta la creación de todas las tablas declaradas en los modelos ORM. |
| `backend/check_notifs.py` | Script CLI para inspeccionar qué notificaciones están almacenadas en la base de datos. |
| `backend/insert_notification.py` | Script CLI para insertar manualmente una notificación de prueba en la base de datos. |
| `backend/migrate_*.py` | Scripts auxiliares de migración de base de datos para ajustes puntuales. |
| `backend/test_*.py` | Scripts unitarios para probar de forma aislada la conexión con BCV, Binance, o creación de gastos y deudas. |

---

## Frontend (`/frontend`)

### Configuración y Despliegue
| Archivo | Descripción detallada |
| :--- | :--- |
| `frontend/package.json` | Dependencias de Node.js, librerías del cliente y scripts de ejecución (`dev`, `build`, `lint`). |
| `frontend/vite.config.ts` | Configuración del empaquetador Vite con el plugin PWA y estrategia `injectManifest`. |
| `frontend/vercel.json` | Configuración de rutas para Vercel SPA y definición del cron job para notificaciones. |
| `frontend/generate_icons.js` | Script que utiliza la librería `sharp` para generar íconos PNG en varias resoluciones desde el SVG. |
| `frontend/api/cron/notifications.ts` | Función serverless de Vercel que activa las notificaciones llamando al backend en Render. |

### Lógica Central (`frontend/src/`)
| Archivo | Descripción detallada |
| :--- | :--- |
| `frontend/src/main.tsx` | Punto de entrada de React que monta la aplicación en el elemento raíz del HTML. |
| `frontend/src/App.tsx` | Enrutador principal (`react-router-dom`), definición de rutas protegidas y diseño base. |
| `frontend/src/api.ts` | Cliente Axios centralizado con interceptores para inyectar el token de Supabase en cada petición. |
| `frontend/src/types.ts` | Interfaces y tipos TypeScript compartidos para modelos de datos, divisas y respuestas del API. |
| `frontend/src/supabaseClient.ts` | Inicialización del cliente Supabase a partir de las variables de entorno. |
| `frontend/src/firebase.ts` | Inicialización de Firebase Web SDK y módulo de mensajería (FCM). |
| `frontend/src/pushManager.ts` | Administrador de notificaciones push en el cliente (permisos, token y listeners en primer plano). |
| `frontend/src/sw.ts` | Service Worker personalizado con Workbox para caché sin conexión y Firebase para notificaciones de fondo. |
| `frontend/src/index.css` | Hoja de estilos global, paleta de colores, variables CSS, glassmorphism y diseño responsivo. |
| `frontend/src/context/AuthContext.tsx` | Proveedor de contexto para la sesión del usuario, perfil y recuperación de contraseña. |
| `frontend/src/context/NotificationContext.tsx` | Proveedor de contexto para el contador de notificaciones no leídas y sincronización en tiempo real. |

### Páginas y Componentes (`frontend/src/components/` y `frontend/src/pages/`)
| Archivo | Descripción detallada |
| :--- | :--- |
| `frontend/src/pages/ConnectionsPage.tsx` | Vista para gestionar la red de contactos ("Panas"): enviar invitaciones, aceptar o rechazar solicitudes. |
| `frontend/src/components/Dashboard.tsx` | Vista principal con métricas financieras, selector de periodos, filtros y lista de gastos. |
| `frontend/src/components/Summary.tsx` | Tarjeta con el total gastado en cada una de las 4 divisas, promedio diario y desglose por categorías. |
| `frontend/src/components/ExpenseForm.tsx` | Formulario modal para registrar o editar un gasto con selector de divisa y tasa manual. |
| `frontend/src/components/ExpenseList.tsx` | Componente de lista que muestra los gastos con barra de búsqueda y paginación. |
| `frontend/src/components/ExpenseItem.tsx` | Fila o tarjeta de gasto individual con desglose de importes y acciones rápidas. |
| `frontend/src/components/ToolsHub.tsx` | Menú principal que da acceso a Gastos Fijos, Deudas, Ingresos Estimados y Panas. |
| `frontend/src/components/FixedExpenses.tsx` | Vista mensual de gastos recurrentes con barra de progreso de pagos y selector de meses. |
| `frontend/src/components/FixedExpenseForm.tsx` | Formulario para crear un gasto fijo, asignar su día de corte y compartirlo con un Pana. |
| `frontend/src/components/FixedExpensePayForm.tsx` | Formulario para marcar el pago mensual de un gasto fijo con opción de reflejarlo en gastos diarios. |
| `frontend/src/components/DebtList.tsx` | Vista de deudas (propias o por cobrar) con estados "Pendientes" y "Liquidadas", y barra de avance de abonos. |
| `frontend/src/components/DebtForm.tsx` | Formulario para registrar una deuda con contraparte, concepto, monto y opción de compartirla. |
| `frontend/src/components/DebtPaymentForm.tsx` | Formulario modal para registrar un abono a una deuda existente. |
| `frontend/src/components/EstimatedIncomeList.tsx` | Vista de ingresos proyectados mensuales con seguimiento de cobros reales recibidos. |
| `frontend/src/components/EstimatedIncomeForm.tsx` | Formulario para registrar una fuente de ingresos esperada recurrente. |
| `frontend/src/components/IncomeCheckForm.tsx` | Formulario para marcar el cobro real de un ingreso estimado (total o saldo parcial). |
| `frontend/src/components/RatesPage.tsx` | Pantalla de consulta de cotizaciones en tiempo real (BCV y Binance P2P) con calculadora de conversión. |
| `frontend/src/components/SettingsPage.tsx` | Pantalla de ajustes: perfil, gestión de categorías, configuración de alertas y cerrar sesión. |
| `frontend/src/components/CategoryManager.tsx` | Modal para crear, modificar o borrar categorías personalizadas de gastos. |
| `frontend/src/components/ProfileManager.tsx` | Modal para cambiar el nombre que ven los demás usuarios en la plataforma. |
| `frontend/src/components/NotificationSettings.tsx` | Pantalla para activar notificaciones push en el teléfono, enviar push de prueba y configurar toggles. |
| `frontend/src/components/NotificationBell.tsx` | Icono de campana en el header con indicador numérico de alertas no leídas. |
| `frontend/src/components/NotificationSheet.tsx` | Cajón desplegable lateral con el historial de alertas recibidas y enlace a cada sección. |
| `frontend/src/components/BottomNav.tsx` | Barra de navegación inferior móvil para cambiar entre Gastos, Herramientas, Tasas y Ajustes. |
| `frontend/src/components/InstallPWA.tsx` | Mensaje flotante que guía al usuario para instalar GastosApp como app nativa en su teléfono. |
| `frontend/src/components/WakeUpLoader.tsx` | Indicador visual de espera cuando el servidor gratuito de Render se está despertando. |
| `frontend/src/components/DateFilterBar.tsx` | Selector horizontal de filtros rápidos de tiempo (Hoy, Semana, Mes, Año, Todo, Rango). |
| `frontend/src/components/PeriodSelector.tsx` | Flechas de navegación para saltar de mes en mes en el Dashboard. |
| `frontend/src/components/PeriodComparison.tsx` | Indicador que muestra si has gastado más o menos porcentaje respecto al mes anterior. |
| `frontend/src/components/AmountRangeFilter.tsx` | Filtro deslizante o por inputs para buscar gastos por rango de dinero. |
| `frontend/src/components/ConfirmModal.tsx` | Modal de confirmación para prevenir borrados accidentales de gastos, deudas o categorías. |
| `frontend/src/components/Auth.tsx` | Pantalla de Login, Registro y Restablecimiento de contraseña. |
| `frontend/src/components/ErrorBoundary.tsx` | Componente de protección en React que captura errores visuales evitando cierres inesperados. |
