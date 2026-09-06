# GastosApp - Registro de Gastos Personales

Una aplicación moderna para el seguimiento de gastos personales, diseñada para móviles ("mobile-first"), construida con FastAPI (Python), React (Vite + TypeScript) y Supabase (PostgreSQL).

## 🚀 Cómo probar la aplicación en tu computadora (Guía fácil)

Si quieres correr la aplicación y probarla localmente, solo tienes que seguir estos dos pasos. Asegúrate de tener **Python** y **Node.js** instalados en tu computadora.

### Paso 1: Encender el Backend (El cerebro de la app)
El backend guarda los datos y procesa las peticiones.
1. Abre tu terminal (Símbolo del sistema o PowerShell).
2. Ve a la carpeta del proyecto y luego a la carpeta `backend`.
3. Activa el entorno virtual. Si estás en Windows, escribe:
   ```bash
   .\venv\Scripts\activate
   ```
4. Escribe el siguiente comando para encender el servidor:
   ```bash
   uvicorn app.main:app --reload
   ```
   *¡Listo! Verás que el servidor arranca y se queda escuchando.*

### Paso 2: Encender el Frontend (La interfaz gráfica)
El frontend es lo que ves en pantalla (botones, listas, diseño).
1. Abre **otra** ventana nueva de terminal (deja la anterior abierta corriendo el backend).
2. Ve a la carpeta `frontend`.
3. Escribe el siguiente comando:
   ```bash
   npm run dev
   ```
4. Te aparecerá un enlace (normalmente `http://localhost:5173`). Haz Ctrl+Clic o cópialo en tu navegador de internet. ¡Ya puedes usar la aplicación!

---

## 🛠️ Funciones Actuales
- **Agregar, Editar, Eliminar Gastos**: Operaciones CRUD completas.
- **Panel de Resumen (Dashboard)**: Total gastado y desglose mensual por categoría.
- **Diseño Moderno**: Tema oscuro, efecto "glassmorphism" (vidrio), diseño adaptable a celulares.

---

## 🗺️ Siguientes pasos por hacer (Roadmap)
Aún hay muchas funciones planeadas para mejorar la aplicación. Estos son los siguientes pasos que vamos a implementar:

- [ ] **Despliegue (Deploy) a producción:** Subir la app a internet (Vercel para Frontend / Render para Backend) para que cualquiera pueda usarla.
- [ ] **Sistema de Autenticación:** Permitir que los usuarios se registren e inicien sesión (usando Supabase Auth).
- [ ] **Filtros avanzados:** Filtrar los gastos por fechas específicas, etiquetas o montos.
- [ ] **Gráficos interactivos:** Mostrar gráficas (de pastel o barras) para visualizar mejor en qué se gasta el dinero.
- [ ] **Presupuestos mensuales:** Establecer un límite de gastos por categoría y recibir alertas si se supera.
- [ ] **Exportar datos:** Poder descargar un Excel (CSV) con el historial de gastos.

---

## ⚙️ Guía de Instalación para Desarrolladores (Setup completo)

### 1. Base de Datos (Supabase)
1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Ve al SQL Editor y corre el contenido del archivo `schema.sql`.
3. En Configuración del Proyecto -> Database, copia el enlace de conexión (URI).

### 2. Backend
1. Navega a la carpeta `backend`: `cd backend`
2. Crea un entorno virtual y actívalo:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   ```
3. Instala dependencias: `pip install -r requirements.txt`
4. Crea un archivo `.env` en la carpeta `backend` y pon la URL de tu base de datos (debe usar `postgresql+asyncpg://...`):
   ```
   DATABASE_URL="postgresql+asyncpg://user:password@host:port/database"
   ```

### 3. Frontend
1. Navega a la carpeta `frontend`: `cd frontend`
2. Instala los paquetes: `npm install`
3. Crea un archivo `.env` en la carpeta `frontend` y pon el link al backend:
   ```
   VITE_API_URL=http://localhost:8000/api
   ```

## ☁️ Despliegue en Producción (Vercel y Render)
Este proyecto está preparado para ser desplegado en dos servicios separados para mayor eficiencia y menor costo.

### 1. Despliegue del Backend (Render)
1. Inicia sesión en [Render](https://render.com/) y conecta tu cuenta de GitHub.
2. Haz clic en **New +** y selecciona **Web Service**.
3. Conecta tu repositorio `gastosapp`.
4. En **Root Directory**, escribe `backend`.
5. Asegúrate de que el entorno o **Runtime** sea **Python**.
6. En **Build Command**, escribe `pip install -r requirements.txt`.
7. En **Start Command**, escribe `python -m app.main`.
8. Expande la sección **Advanced** y haz clic en **Add Environment Variable**:
   - `DATABASE_URL` (la misma URI de Supabase que usas en local).
   - Render inyecta la variable `PORT` automáticamente al arrancar el servidor.

### 2. Despliegue del Frontend (Vercel)
1. Inicia sesión en [Vercel](https://vercel.com/) y conecta tu cuenta de GitHub.
2. Haz clic en **Add New...** -> **Project** e importa tu repositorio `gastosapp`.
3. En la configuración del proyecto, Vercel suele detectar que es un proyecto Vite automáticamente.
4. En **Root Directory**, haz clic en Edit y selecciona la carpeta `/frontend`.
5. Abre la pestaña **Environment Variables** y agrega:
   - Nombre: `VITE_API_URL`
   - Valor: La URL pública que te dio Render al desplegar el backend (asegúrate de que termine en `/api`, por ejemplo: `https://tu-app-backend.onrender.com/api`).
6. Haz clic en **Deploy**. ¡Tu frontend ahora se comunicará exitosamente con tu backend en Render!
