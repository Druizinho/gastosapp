# GastosApp - Registro de Finanzas Personales

Una aplicación moderna y completa para la gestión de finanzas personales, diseñada para móviles ("mobile-first"), instalable como PWA y construida con **FastAPI (Python)**, **React (Vite + TypeScript)**, **Supabase (PostgreSQL)** y **Firebase (Push Notifications)**.

## 🚀 Funcionalidades Actuales
- **Control de Gastos e Ingresos:** Operaciones CRUD completas para registrar todas tus transacciones.
- **Gestión de Gastos Fijos y Deudas:** Sistema integrado para llevar el control de compromisos recurrentes y préstamos/deudas.
- **Panel de Resumen (Dashboard):** Visualización del total gastado, balances generales y un desglose detallado por categoría.
- **Consultas de Tasas de Cambio:** Integración automática para consultar el precio del dólar (Vía BCV y Binance).
- **Perfiles y Categorías Personalizables:** Soporte para múltiples perfiles y la posibilidad de crear/editar categorías a tu medida.
- **PWA (Progressive Web App):** Instalable en teléfonos móviles y computadoras como si fuera una aplicación nativa.
- **Notificaciones Push:** Alertas configurables impulsadas por Firebase Cloud Messaging.

---

## 🗺️ Siguientes pasos por hacer (Roadmap)
- [ ] **Gráficos interactivos:** Mostrar gráficas detalladas (de pastel o barras) para análisis visuales más profundos.
- [ ] **Presupuestos mensuales:** Establecer un límite de gastos por categoría y recibir alertas si se supera.
- [ ] **Exportación de datos:** Poder descargar reportes con el historial en formatos como Excel (CSV).

---

## ⚙️ Guía de Instalación para Desarrolladores (Setup local)

Si quieres correr la aplicación y probarla en tu computadora, sigue estos pasos:

### 1. Base de Datos (Supabase)
1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Ve al SQL Editor y corre el contenido de los scripts SQL del proyecto (como `schema.sql` y las migraciones para generar las tablas).
3. En Configuración del Proyecto -> Database, copia el enlace de conexión (URI).

### 2. Configurar Firebase (Para Notificaciones Push)
1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Configura una aplicación Web para obtener tus credenciales del cliente (API Keys).
3. Ve a Configuración del Proyecto -> Cuentas de Servicio y genera una nueva clave privada. Descarga el archivo JSON y renómbralo a `firebase-adminsdk.json`.

### 3. Backend (FastAPI - El cerebro de la app)
1. Abre tu terminal y navega a la carpeta del backend: 
   ```bash
   cd backend
   ```
2. Crea un entorno virtual y actívalo:
   ```bash
   python -m venv venv
   # En Windows:
   venv\Scripts\activate
   # En Mac/Linux:
   source venv/bin/activate
   ```
3. Instala dependencias necesarias: 
   ```bash
   pip install -r requirements.txt
   ```
4. Coloca el archivo `firebase-adminsdk.json` en la raíz de tu proyecto o dentro de la carpeta `backend`.
5. Crea un archivo `.env` en la carpeta `backend` y añade el link de tu base de datos (debe iniciar con `postgresql+asyncpg://`):
   ```env
   DATABASE_URL="postgresql+asyncpg://user:password@host:port/database"
   ```
6. **Encender el servidor:** Escribe este comando:
   ```bash
   python -m uvicorn app.main:app --reload
   ```
   *El backend quedará escuchando en `http://localhost:8000`.*

### 4. Frontend (React + Vite - La interfaz gráfica)
1. Abre **otra** ventana nueva de terminal y ve a la carpeta del frontend: 
   ```bash
   cd frontend
   ```
2. Instala los paquetes y librerías: 
   ```bash
   npm install
   ```
3. Crea un archivo `.env` en la carpeta `frontend` y llena las variables con tus datos de Supabase y Firebase:
   ```env
   VITE_API_URL=http://localhost:8000/api
   VITE_SUPABASE_URL=tu_url_supabase
   VITE_SUPABASE_ANON_KEY=tu_anon_key_supabase

   VITE_FIREBASE_API_KEY=tu_api_key
   VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
   VITE_FIREBASE_PROJECT_ID=tu_project_id
   VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
   VITE_FIREBASE_APP_ID=tu_app_id
   VITE_FIREBASE_MEASUREMENT_ID=tu_measurement_id
   VITE_FIREBASE_VAPID_KEY=tu_vapid_key
   ```
4. **Encender el frontend:** Escribe el comando:
   ```bash
   npm run dev
   ```
   *Abre el enlace que aparece (ej. `http://localhost:5173`) en tu navegador para ver la app.*

---

## ☁️ Despliegue en Producción (Render y Vercel)

Este proyecto está diseñado para funcionar de manera óptima en la nube utilizando Render (Backend) y Vercel (Frontend).

### 1. Despliegue del Backend (Render)
1. En [Render](https://render.com/), crea un nuevo **Web Service** y conecta tu repositorio.
2. Root Directory: `backend` | Runtime: `Python`.
3. Build Command: `pip install -r requirements.txt`.
4. Start Command: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. En la sección de Environment Variables, agrega `DATABASE_URL`. Para la inicialización de Firebase, añade `FIREBASE_SERVICE_ACCOUNT_BASE64` con el texto de tu JSON codificado en base64 para que sea inyectado de forma segura.

### 2. Despliegue del Frontend (Vercel)
1. En [Vercel](https://vercel.com/), crea un nuevo proyecto e importa tu repositorio.
2. Root Directory: `frontend` (Vercel normalmente autodetecta que es Vite).
3. En la sección Environment Variables, copia TODAS las variables que tienes en tu `.env` local.
   * IMPORTANTE: Cambia el valor de `VITE_API_URL` por la URL pública que generó Render (asegúrate de que termine en `/api`, por ejemplo: `https://tu-backend.onrender.com/api`).*
4. Haz clic en Deploy.

---

## 💾 ¿Cómo guardar mis cambios y subirlos a GitHub?

Cuando hagamos cambios en el código (ya sea tú o yo) y quieras guardarlos en tu repositorio de GitHub para no perderlos, sigue estos sencillos pasos:

1. **Abre una terminal nueva** (puedes usar PowerShell o el Símbolo del sistema).
2. **Asegúrate de estar en la carpeta raíz de tu proyecto** (`gastosapp`), no dentro de `frontend` ni `backend`. Deberías ver algo como: `C:\Users\diegu\Desktop\gastosapp>`.
3. Ejecuta los siguientes tres comandos, uno por uno:

   ```bash
   # Paso 1: Prepara todos los archivos que cambiaron
   git add .

   # Paso 2: Guarda los cambios localmente con un mensaje descriptivo
   # (Puedes cambiar el texto entre comillas por algo que describa lo que hicimos)
   git commit -m "Actualización: añadir nuevas funciones y mejoras"

   # Paso 3: Sube los cambios guardados a GitHub
   git push origin main
   ```

**¡Y listo!** Con esto, todos tus cambios estarán seguros en la nube.
