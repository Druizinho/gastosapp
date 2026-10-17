# 💰 GastosApp — Gestión Financiera Personal y Compartida

Una aplicación web progresiva (**PWA**), moderna, intuitiva y *mobile-first*, diseñada para el control integral de finanzas personales, gastos recurrentes, control de deudas compartidas e ingresos estimados con soporte **multimoneda en tiempo real** (Bolívares, Dólares BCV, Euros BCV, USDT Binance y Efectivo).

Construida con **FastAPI (Python)**, **React 19 (TypeScript + Vite)**, **Supabase (PostgreSQL)** y **Firebase Cloud Messaging (FCM)**.

---

## 📑 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Estructura del Proyecto y Explicación de Archivos](#-estructura-del-proyecto-y-explicación-de-archivos)
  - [Raíz del Proyecto](#raíz-del-proyecto)
  - [Backend (`/backend`)](#backend-backend)
  - [Frontend (`/frontend`)](#frontend-frontend)
- [Flujo Funcional de la Aplicación](#-flujo-funcional-de-la-aplicación)
  - [1. Autenticación y Perfil](#1-autenticación-y-perfil)
  - [2. Gestión de Gastos Diarios](#2-gestión-de-gastos-diarios)
  - [3. Motor Multidivisa y Conversión en Tiempo Real](#3-motor-multidivisa-y-conversión-en-tiempo-real)
  - [4. Herramientas Financieras (Tools Hub)](#4-herramientas-financieras-tools-hub)
  - [5. Red de Contactos ("Panas") y Gastos/Deudas Compartidas](#5-red-de-contactos-panas-y-gastosdeudas-compartidas)
  - [6. Sistema de Notificaciones Push e In-App](#6-sistema-de-notificaciones-push-e-in-app)
- [Guía de Instalación y Entorno Local](#-guía-de-instalación-y-entorno-local)
  - [Prerrequisitos](#prerrequisitos)
  - [1. Base de Datos (Supabase)](#1-base-de-datos-supabase)
  - [2. Configuración de Firebase (Push)](#2-configuración-de-firebase-push)
  - [3. Backend (FastAPI)](#3-backend-fastapi)
  - [4. Frontend (React + Vite)](#4-frontend-react--vite)
- [Variables de Entorno](#-variables-de-entorno)
- [Despliegue en Producción](#-despliegue-en-producción)
- [Mantenimiento y Control de Versiones](#-mantenimiento-y-control-de-versiones)

---

## ✨ Características Principales

1. **Control de Gastos Diarios:**
   - Registro con monto, descripción, categoría, fecha y moneda seleccionada.
   - Conversión automática a BS, USD (BCV), EUR (BCV) y USDT (Binance P2P).
   - Tasa manual configurable por transacción si no se desea usar la tasa automática.
   - Filtros avanzados por rangos de fecha predefinidos (Hoy, Semana, Mes, Año, Todo, Personalizado) y montos.

2. **Herramientas Financieras Especializadas:**
   - **Gastos Fijos:** Registro de pagos recurrentes mensuales (alquiler, streaming, servicios) con día de cobro, historial mensual de pago (`checks`) y opción de convertir el pago en un gasto real automáticamente.
   - **Deudas Nuestras (Owed):** Seguimiento de lo que debes a terceros con control de abonos progresivos y liquidación total.
   - **Deudas por Cobrar (Receivable):** Registro de préstamos realizados a terceros con registro de cobros parciales.
   - **Ingresos Estimados:** Planificación de ingresos mensuales esperados vs. montos reales cobrados (pagos totales o parciales pendientes).
   - **Metas de Ahorro:** Creación de metas con monto objetivo, fecha límite y categoría personalizada, registro de aportes progresivos con opción de vincular como gasto en el Dashboard, cálculo de porcentaje alcanzado y completado automático con notificación festiva.

3. **Panas (Finanzas Colaborativas):**
   - Sistema de conexión entre usuarios registrados por correo electrónico.
   - Compartir Gastos Fijos (ej. servicios compartidos entre roomies/parejas): el pago registrado por uno actualiza el estado y notifica al otro.
   - Compartir Deudas: crea automáticamente una deuda espejo simétrica en la cuenta del destinatario ("Debes" para uno es "Te deben" para el otro), sincronizando abonos y liquidaciones.

4. **Monitor de Tasas de Cambio:**
   - Consulta en vivo del Dólar BCV y Euro BCV vía *pyDolarVenezuela*.
   - Consulta en vivo del USDT en Bolívares vía API pública P2P de Binance.
   - Calculadora y conversor interactivo entre divisas.

5. **Notificaciones Push y Centro In-App:**
   - Notificaciones Web Push vía Firebase Cloud Messaging (compatibles con Android, Windows, Mac e iOS PWA).
   - Bandeja / Historial de notificaciones in-app con contador de no leídas.
   - Tareas automáticas programadas (Cron):
     - **Mañana (9:00 AM UTC-4):** Gastos fijos, deudas e ingresos que vencen hoy o están vencidos, y recordatorios del día después.
     - **Noche (8:00 PM UTC-4):** Recordatorios preventivos de vencimientos de mañana y alerta de inactividad (3+ días sin registrar gastos).

6. **Experiencia PWA Nativa (Mobile-First):**
   - Instalable en pantalla de inicio con manifest, splash icon y Service Worker (`sw.ts`) con sincronización en segundo plano.
   - Self-ping interno en el backend para evitar que el contenedor de Render Free Tier se suspenda.

---

## 🏗 Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────┐
│             Cliente Web / PWA (React 19)              │
│       Vite + TypeScript + Workbox Service Worker       │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       Supabase Auth JWT          REST API (HTTP/JSON)
                │                        │
                ▼                        ▼
       ┌────────────────┐       ┌────────────────────────┐
       │ Supabase Auth  │       │  FastAPI Backend       │
       │ (Cuentas/Users)│       │  (Uvicorn + Python)    │
       └────────────────┘       └───────────┬────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
      ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
      │  Supabase DB    │          │ Firebase Admin  │          │ BCV & Binance   │
      │  PostgreSQL RLS │          │ Cloud Messaging │          │ Tasas en Vivo   │
      └─────────────────┘          └─────────────────┘          └─────────────────┘
```

---

## 📁 Estructura del Proyecto y Explicación de Archivos

### Raíz del Proyecto

| Archivo / Carpeta | Propósito y Explicación |
| :--- | :--- |
| `schema.sql` | Esquema DDL inicial de PostgreSQL con tablas principales (`expenses`, `categories`, `profiles`). |
| `migrate_connections.sql` | Script SQL que crea la tabla `connections` para conectar usuarios ("Panas"). |
| `migrate_currencies.sql` | Migración de compatibilidad para actualizar códigos de divisas antiguos a `'BS'`. |
| `migrate_debts.sql` | Crea las tablas `debts` y `debt_payments` con conversiones multimoneda. |
| `migrate_fixed_expense_checks.sql` | Crea `fixed_expense_checks` para el historial mensual de pagos de gastos fijos. |
| `migrate_profiles.sql` | Crea la tabla `profiles`, políticas RLS y el trigger para crearlo automáticamente al registrarse en Supabase Auth. |
| `migrate_shared_debts.sql` | Crea la tabla `shared_debts` y columnas para deudas compartidas y pagos sincronizados. |
| `migrate_shared_fixed_expenses.sql`| Crea la tabla `shared_fixed_expenses` para gastos fijos compartidos. |
| `migrate_savings.sql` | Crea las tablas `saving_goals` y `saving_deposits` para metas y aportes de ahorro con políticas RLS. |
| `migrate_tools.sql` | Crea la tabla original de `fixed_expenses`. |
| `rls_connections.sql` | Políticas de Row Level Security (RLS) para proteger las conexiones de usuarios. |
| `rls_policies.sql` | Políticas RLS generales para tablas de gastos y categorías. |
| `run_migration.py` | Script utilitario en Python para ejecutar sentencias de migración asíncronas en Supabase. |
| `add_col.py` | Script auxiliar para agregar la columna `deactivated_at` en `estimated_incomes`. |
| `.gitignore` | Reglas de exclusión de archivos temporales, credenciales, entornos virtuales y dependencias. |
| `README.md` | Documentación integral del proyecto. |

---

### Backend (`/backend`)

El backend está desarrollado con **FastAPI**, utilizando **SQLAlchemy 2.0 (Async)** y el driver **asyncpg**.

```
backend/
├── app/
│   ├── __init__.py               # Inicializador del paquete app
│   ├── auth.py                   # Verificación de JWT con JWKS de Supabase y current_user
│   ├── bcv_service.py            # Consulta de tasas BCV y Binance P2P + conversor multimoneda
│   ├── crud.py                   # Operaciones DB de gastos, resúmenes y categorías
│   ├── crud_connections.py       # Lógica de solicitudes, aceptación y lista de "Panas"
│   ├── crud_debts.py             # Lógica de deudas, abonos, liquidación y deudas espejo compartidas
│   ├── crud_fixed_expenses.py    # Lógica de gastos fijos, checks mensuales y sincronización compartida
│   ├── crud_incomes.py           # Lógica de ingresos proyectados y confirmaciones reales
│   ├── crud_savings.py           # Lógica de metas de ahorro, depósitos y autocompletado
│   ├── database.py               # Motor asyncpg, SessionLocal y dependencia get_db
│   ├── main.py                   # Entrada FastAPI, lifespan, self-ping y registro de routers
│   ├── models.py                 # Modelos ORM SQLAlchemy (Profile, Expense, Debt, SavingGoal, etc.)
│   ├── push_service.py           # Envío de notificaciones FCM y guardado en historial in-app
│   ├── schemas.py                # Esquemas y validadores Pydantic v2 (Input/Output DTOs)
│   └── routers/
│       ├── __init__.py           # Inicializador del paquete routers
│       ├── categories.py         # Endpoints CRUD de categorías personalizadas
│       ├── connections.py        # Endpoints para conectar con otros usuarios ("Panas")
│       ├── debts.py              # Endpoints para deudas (nuestras y por cobrar) y abonos
│       ├── expenses.py           # Endpoints de gastos, tasas en vivo y resúmenes estadísticos
│       ├── fixed_expenses.py     # Endpoints de gastos fijos y marcado de mes pagado
│       ├── incomes.py            # Endpoints de ingresos estimados y checks mensuales
│       ├── notifications.py      # Endpoints para consultar y marcar leídas las notificaciones in-app
│       ├── profiles.py           # Endpoints para consultar y actualizar el perfil del usuario
│       ├── push.py               # Endpoints de suscripción push, test y webhook /cron
│       └── savings.py            # Endpoints para metas de ahorro y depósitos/aportes
├── create_tables.py              # Script para generar las tablas en la BD si no existen
├── check_notifs.py               # Script CLI de diagnóstico para verificar notificaciones en BD
├── insert_notification.py        # Script CLI para insertar una notificación de prueba en BD
├── migrate_*.py                  # Scripts auxiliares de migración de esquema y datos
├── test_*.py                     # Scripts de prueba aislados (BCV, Binance, Deudas, Gastos)
├── requirements.txt              # Lista de dependencias Python
└── gastos.db                     # Archivo SQLite local histórico / pruebas
```

---

### Frontend (`/frontend`)

El frontend está desarrollado con **React 19**, **Vite** y **TypeScript**.

```
frontend/
├── api/
│   └── cron/
│       └── notifications.ts      # Serverless function en Vercel para activar el cron de notificaciones
├── public/
│   ├── apple-touch-icon-180x180.png # Ícono para dispositivos Apple iOS
│   ├── favicon.svg               # Favicon vectorial en SVG
│   ├── icons.svg                 # Sprite SVG de íconos
│   ├── pwa-192x192.png           # Ícono PWA estándar (192px)
│   └── pwa-512x512.png           # Ícono PWA de alta resolución y maskable (512px)
├── src/
│   ├── api.ts                    # Cliente Axios configurado con interceptores de Auth y endpoints
│   ├── App.css                   # Estilos específicos de la app
│   ├── App.tsx                   # Enrutamiento principal (React Router), Guards y Layout
│   ├── firebase.ts               # Inicialización del SDK de Firebase y Firebase Cloud Messaging
│   ├── index.css                 # Sistema de diseño global (variables, temas, reset y componentes)
│   ├── main.tsx                  # Punto de entrada ReactDOM
│   ├── pushManager.ts            # Gestor de permisos Web Push, tokens FCM y listener foreground
│   ├── supabaseClient.ts         # Inicialización del cliente Supabase con URL y Anon Key
│   ├── sw.ts                     # Service Worker personalizado (Workbox + Firebase Messaging SW)
│   ├── types.ts                  # Definiciones de tipos e interfaces de TypeScript
│   ├── context/
│   │   ├── AuthContext.tsx       # Proveedor de autenticación (sesión Supabase, display name, recovery)
│   │   └── NotificationContext.tsx # Proveedor global del estado y badge de notificaciones
│   ├── pages/
│   │   └── ConnectionsPage.tsx   # Pantalla de gestión de "Panas" (enviar, aceptar, rechazar amigos)
│   └── components/
│       ├── AmountRangeFilter.tsx # Filtro por rango de montos mínimo y máximo
│       ├── Auth.css              # Estilos de la pantalla de Login y Registro
│       ├── Auth.tsx              # Componente de inicio de sesión, registro y recuperación de contraseña
│       ├── BottomNav.tsx         # Barra de navegación inferior móvil
│       ├── CategoryManager.tsx   # Modal para crear, editar o eliminar categorías con colores/íconos
│       ├── ConfirmModal.tsx      # Modal genérico reutilizable de confirmación de eliminación
│       ├── Dashboard.tsx         # Vista principal de gastos, resumen, filtros y botón de agregar
│       ├── DateFilterBar.tsx     # Selector rápido de fechas (Hoy, Semana, Mes, Año, Todo, Rango)
│       ├── DebtForm.tsx          # Formulario modal para registrar o editar una deuda
│       ├── DebtList.tsx          # Lista interactiva de deudas (pendientes y liquidadas) con barra de progreso
│       ├── DebtPaymentForm.tsx   # Formulario modal para registrar un abono a una deuda
│       ├── ErrorBoundary.tsx     # Capturador de errores de renderizado en React
│       ├── EstimatedIncomeForm.tsx # Formulario para crear o editar ingresos proyectados
│       ├── EstimatedIncomeList.tsx # Listado mensual de ingresos proyectados y confirmación de cobro
│       ├── ExpenseForm.tsx       # Formulario completo de creación/edición de gasto con multidivisa
│       ├── ExpenseItem.tsx       # Tarjeta individual de gasto con desglose de tasas y opciones
│       ├── ExpenseList.tsx       # Lista paginada y filtrada de gastos
│       ├── FixedExpenseForm.tsx  # Formulario para crear o editar gastos fijos y compartirlos
│       ├── FixedExpensePayForm.tsx # Formulario para marcar pago del mes en un gasto fijo
│       ├── FixedExpenses.tsx     # Vista mensual de gastos fijos, progreso de pagos y alertas
│       ├── IncomeCheckForm.tsx   # Formulario para registrar el monto real recibido de un ingreso
│       ├── InstallPWA.tsx        # Banner interactivo para instalar la aplicación en el dispositivo
│       ├── NotificationBell.tsx  # Ícono de campana con badge de no leídas para la barra superior
│       ├── NotificationSettings.tsx # Configuración de permisos push y toggles por categoría
│       ├── NotificationSheet.tsx # Cajón desplegable (drawer) con el historial de notificaciones
│       ├── PeriodComparison.tsx  # Widget de comparación estadística respecto al periodo anterior
│       ├── PeriodSelector.tsx    # Selector de navegación por meses (anterior / siguiente)
│       ├── ProfileManager.tsx    # Modal para actualizar el nombre visible del usuario
│       ├── RatesPage.tsx         # Página de tasas en tiempo real (BCV y Binance) + calculadora
│       ├── SavingDepositForm.tsx # Formulario modal para registrar un aporte a una meta de ahorro
│       ├── SavingGoalForm.tsx    # Formulario modal para crear o editar una meta de ahorro
│       ├── SavingGoals.tsx       # Vista integral de metas de ahorro, porcentaje alcanzado e historial
│       ├── SettingsPage.tsx      # Menú de configuración general de la cuenta y la app
│       ├── Summary.tsx           # Tarjeta de resumen de montos gastados por divisa y categoría
│       ├── ToolsHub.tsx          # Hub principal de acceso a las herramientas financieras
│       └── WakeUpLoader.tsx      # Indicador de espera cuando el servidor backend está arrancando
├── generate_icons.js             # Script con `sharp` para generar íconos PWA a partir del SVG
├── index.html                    # Plantilla HTML con meta tags, PWA viewport y tema
├── package.json                  # Dependencias y scripts del frontend
├── tsconfig.json                 # Configuración del compilador TypeScript
├── vercel.json                   # Configuración de rutas y Cron jobs de Vercel
└── vite.config.ts                # Configuración de Vite y plugin VitePWA (injectManifest)
```

---

## 🔄 Flujo Funcional de la Aplicación

### 1. Autenticación y Perfil
- El usuario inicia sesión o se registra con correo y contraseña o enlace mágico mediante **Supabase Auth**.
- Al registrarse, un trigger en PostgreSQL crea automáticamente su registro en la tabla `profiles`.
- El frontend obtiene un token JWT que es enviado en el header `Authorization: Bearer <token>` a cada petición al backend.
- El backend valida el token contra el JWKS oficial de Supabase sin consultas lentas a bases de datos externas.

### 2. Gestión de Gastos Diarios
- Al crear o editar un gasto, el usuario puede indicar el monto y la divisa de origen:
  - `BS` (Bolívares)
  - `USD_BCV` (Dólares tasa oficial BCV)
  - `EUR_BCV` (Euros tasa oficial BCV)
  - `USDT` (Dólares cripto tasa Binance P2P)
  - `USD_CASH` (Dólares efectivo con tasa manual o tasa de mercado máxima)
- El backend consulta las tasas vigentes y calcula los montos equivalentes en las 4 divisas simultáneamente, guardando la foto exacta del valor en el momento del gasto.

### 3. Motor Multidivisa y Conversión en Tiempo Real
- `bcv_service.py` obtiene periódicamente las tasas de cambio:
  - **BCV:** Dólar y Euro oficial mediante web scraping seguro.
  - **Binance:** Consulta a la API P2P de Binance para obtener la mediana del precio de compra de USDT/VES.
- Las tasas se guardan en un caché en memoria con un tiempo de vida (TTL) de 30 minutos.
- En la sección **Tasas**, el usuario puede consultar los valores actuales y usar una calculadora para convertir montos al instante.

### 4. Herramientas Financieras (Tools Hub)
- **Gastos Fijos:** Permite configurar pagos recurrentes con su día de pago esperado (ej. día 5 de cada mes). Cada mes se puede marcar como pagado (`FixedExpenseCheck`), guardando la tasa de ese día e integrándolo opcionalmente como un gasto normal en el Dashboard.
- **Deudas Nuestras / Por Cobrar:** Permite llevar el balance exacto de deudas. Cada abono descuenta el monto pendiente y, al llegar al 100%, la deuda se marca automáticamente como liquidada (`is_settled = true`).
- **Ingresos Estimados:** Permite proyectar el flujo de caja del mes. Permite registrar cobros parciales con fecha de pago pendiente asignada.

### 5. Red de Contactos ("Panas") y Gastos/Deudas Compartidas
- En `/herramientas/conexiones`, los usuarios pueden buscarse por correo electrónico y enviar solicitudes de conexión.
- Una vez aceptada la conexión:
  - **Gasto Fijo Compartido:** Al crearlo, se crea un registro vinculado. Cuando uno de los dos registra el pago del mes, el sistema actualiza el estado en ambas cuentas y envía una notificación push al compañero.
  - **Deuda Compartida:** Si el usuario A registra que le debe dinero al usuario B, automáticamente se crea en la cuenta del usuario B una deuda de tipo "Por cobrar". Cualquier abono realizado por cualquiera de las partes sincroniza el balance de ambos en tiempo real.

### 6. Sistema de Notificaciones Push e In-App
- Al conceder permiso de notificaciones en el navegador o PWA, el Service Worker obtiene un token FCM y lo registra en el backend (`/api/push/subscribe`).
- El backend cuenta con un endpoint `/api/push/cron` que es activado dos veces al día:
  - Evalúa vencimientos del día, recordatorios de "ayer", vencimientos de "mañana" y alertas de inactividad de 3 días.
  - Comprueba las preferencias individuales del perfil del usuario (`notify_fixed_expenses`, `notify_debts`, `notify_incomes`, `notify_inactivity`).
  - Envía la notificación push mediante Firebase Admin SDK y añade el evento a la tabla `notifications` para consulta en la campana de la app.

---

## 🛠 Guía de Instalación y Entorno Local

### Prerrequisitos
- **Node.js** v18+ y **npm**
- **Python** 3.10+
- Cuenta en [Supabase](https://supabase.com/)
- Cuenta en [Firebase Console](https://console.firebase.google.com/)

---

### 1. Base de Datos (Supabase)
1. Crea un nuevo proyecto en Supabase.
2. Abre el **SQL Editor** en Supabase y ejecuta los archivos SQL en el siguiente orden:
   - `schema.sql`
   - `migrate_profiles.sql`
   - `migrate_tools.sql`
   - `migrate_fixed_expense_checks.sql`
   - `migrate_debts.sql`
   - `migrate_connections.sql`
   - `migrate_shared_debts.sql`
   - `migrate_shared_fixed_expenses.sql`
   - `rls_policies.sql`
   - `rls_connections.sql`
3. En **Project Settings -> Database**, copia la URI de conexión (Connection String - URI modo Transaction o Session).

---

### 2. Configuración de Firebase (Push)
1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Añade una **Aplicación Web** y copia las credenciales del cliente (`firebaseConfig`).
3. Ve a **Configuración del proyecto -> Cloud Messaging** y genera un **Par de claves VAPID** (Web Push certificates).
4. Ve a **Configuración del proyecto -> Cuentas de servicio** y haz clic en **Generar nueva clave privada**.
5. Guarda el archivo descargado como `backend/firebase-adminsdk.json`.

---

### 3. Backend (FastAPI)
1. Navega a la carpeta del backend:
   ```bash
   cd backend
   ```
2. Crea y activa un entorno virtual:
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # Linux / macOS
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Instala las dependencias:
   ```bash
   pip install -r requirements.txt
   ```
4. Crea un archivo `.env` en la carpeta `backend` con las variables correspondientes (ver sección [Variables de Entorno](#-variables-de-entorno)).
5. Inicia el servidor de desarrollo:
   ```bash
   python -m uvicorn app.main:app --reload
   ```
   *El API quedará disponible en `http://localhost:8000` con documentación interactiva en `http://localhost:8000/docs`.*

---

### 4. Frontend (React + Vite)
1. Abre otra terminal y navega a la carpeta del frontend:
   ```bash
   cd frontend
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` en la carpeta `frontend` con las credenciales de Supabase y Firebase (ver sección [Variables de Entorno](#-variables-de-entorno)).
4. Genera los íconos de la PWA (si modificas el favicon):
   ```bash
   node generate_icons.js
   ```
5. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   *Abre `http://localhost:5173` en tu navegador.*

---

## 🔐 Variables de Entorno

### Backend (`backend/.env`)

```env
# Conexión a Supabase PostgreSQL (debe usar el protocolo postgresql+asyncpg://)
DATABASE_URL="postgresql+asyncpg://postgres.xxxx:tu_password@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# URL base de tu proyecto en Supabase (necesaria para validar tokens JWT)
SUPABASE_URL="https://tu-proyecto.supabase.co"

# URL pública del frontend (para redirecciones de push notifications)
FRONTEND_URL="http://localhost:5173"

# Clave secreta para proteger la ejecución del endpoint cron (/api/push/cron)
CRON_SECRET="una_clave_secreta_segura"

# (Opcional en Render) Si no usas archivo físico firebase-adminsdk.json:
# FIREBASE_SERVICE_ACCOUNT_BASE64="ey..."
```

### Frontend (`frontend/.env`)

```env
# URL base del API Backend (debe terminar en /api)
VITE_API_URL=http://localhost:8000/api

# Credenciales de Supabase
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_publica

# Credenciales de Firebase Cloud Messaging
VITE_FIREBASE_API_KEY=tu_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_FIREBASE_VAPID_KEY=tu_vapid_key_publica
```

---

## ☁️ Despliegue en Producción

### 1. Despliegue del Backend en [Render](https://render.com/)
1. Crea un nuevo **Web Service** conectado a tu repositorio en GitHub.
2. Configuración:
   - **Root Directory:** `backend`
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Agrega las Variables de Entorno (`DATABASE_URL`, `SUPABASE_URL`, `FRONTEND_URL`, `CRON_SECRET`).
4. Para Firebase:
   - Codifica tu archivo `firebase-adminsdk.json` en Base64:
     ```bash
     # PowerShell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("firebase-adminsdk.json"))
     # Linux / Mac
     base64 -w 0 firebase-adminsdk.json
     ```
   - Agrega la variable `FIREBASE_SERVICE_ACCOUNT_BASE64` con ese valor en Render.

### 2. Despliegue del Frontend en [Vercel](https://vercel.com/)
1. Importa tu repositorio en Vercel.
2. Selecciona como **Root Directory:** `frontend`.
3. Vercel detectará automáticamente que es un proyecto **Vite**.
4. En **Environment Variables**, añade todas las variables definidas en `frontend/.env` (reemplaza `VITE_API_URL` por la URL pública generada por Render, por ejemplo: `https://gastosapp-backend.onrender.com/api`).
5. Realiza el Deploy.

### 3. Configuración de Tareas Programadas (Cron)
Para ejecutar las notificaciones automáticas y evitar que el backend de Render se suspenda:
- Puedes configurar un ping recurrente gratuito en [cron-job.org](https://cron-job.org/) que llame cada 10-14 minutos a:
  `GET https://tu-backend.onrender.com/api/push/cron?token=TU_CRON_SECRET`
- O utilizar la función programada de Vercel Cron incluida en `frontend/vercel.json`.

---

## 📦 Mantenimiento y Control de Versiones

Para guardar tus cambios y sincronizarlos con GitHub:

```bash
# 1. Agregar cambios


# 2. Confirmar con mensaje descriptivo
git commit -m "feat: descripción de los cambios realizados"

# 3. Subir a la rama principal
git push origin main
```

---

*Desarrollado para simplificar tus finanzas y las de tus panas.*
