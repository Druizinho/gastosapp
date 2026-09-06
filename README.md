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

- [ ] **Despliegue (Deploy) a producción:** Subir la app a internet (Railway / Vercel) para que cualquiera pueda usarla.
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

## ☁️ Despliegue en Railway
Este proyecto está listo para ser separado en dos servicios de Railway:
1. **Backend:** Conecta la carpeta `backend` en Railway. Detectará el archivo `Procfile`. Agrega tu variable `DATABASE_URL`.
2. **Frontend:** Conecta la carpeta `frontend`. Railway detectará Vite y compilará la app automáticamente. Asegúrate de agregar la variable `VITE_API_URL` apuntando al backend en producción.
