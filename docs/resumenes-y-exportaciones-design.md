# Diseño de Arquitectura: Centro de Resúmenes, Comparador de Periodos y Exportaciones (`gastosapp`)

Esta especificación define la arquitectura, límites operativos, formatos de archivo, visualizaciones gráficas y plantillas de datos para la nueva herramienta centralizada de **Resúmenes, Comparación de Periodos y Exportación de Archivos** (`/herramientas/resumenes`) en `gastosapp`. La herramienta unifica en un único punto dentro del `ToolsHub` dos flujos principales: (1) un panel analítico interactivo para explorar resúmenes financieros con gráficos vectoriales y comparar dos periodos cualesquiera (simétricos o asimétricos, con avisos de integridad y normalización por promedio diario), y (2) un **Centro de Exportación configurable** capaz de generar reportes ejecutivos en **PDF (`.pdf`)**, libros multi-hoja en **Excel (`.xlsx`)** y tablas planas en **CSV (`.csv`)** tanto de resúmenes generales/comparativos como de entidades individuales o globales por herramienta (**Deudas**, **Metas de Ahorro**, **Presupuestos Mensuales**, **Gastos Fijos** e **Ingresos**), respetando la moneda principal configurada por el usuario (`USD`, `BS`, `EUR`, `USDT`) y los montos/tasas históricos de cada movimiento.

---

## Terms

- **Resumen Comparativo**
  - **Definición:** Vista interactiva y reporte exportable que contrasta métricas financieras (ingresos totales, gastos totales, balance neto, promedio diario `$/día` y desglose por categoría) entre un **Periodo A** y un **Periodo B** con cálculo de variaciones absolutas (`Δ$`) y porcentuales (`Δ%`).
  - **Evitar (`Avoid`):** *"Dashboard principal"*, *"Resumen del Home"*.
- **Exportación por Entidad / Herramienta**
  - **Definición:** Archivo descargable o compartible (`.pdf`, `.xlsx`, `.csv`) acotado a un módulo específico de la app o a un registro individual dentro de ese módulo (p. ej. Estado de Cuenta de la *Deuda X* con sus abonos, Historial de la *Meta de Ahorro Y* con sus aportes/retiros, Ejecución del *Presupuesto del Mes Z* o Checklist de *Gastos Fijos / Ingresos del Mes Z*).
  - **Evitar (`Avoid`):** *"Backup global"*, *"Volcado de base de datos"*.
- **Aviso de Integridad por Asimetría Temporal**
  - **Definición:** Alerta visual preventiva y ajuste analítico que se activa cuando el usuario compara dos periodos con diferente cantidad de días (p. ej. 15 días vs. 30 días), destacando la comparativa de **Promedio Diario (`$/día`)** junto a los totales brutos para evitar conclusiones distorsionadas.
  - **Evitar (`Avoid`):** *"Error de fechas"*, *"Bloqueo de rango"*.

---

## Why

> *"Viendo la infraestructura de la app y todo lo que se ha avanzado, creo que la única herramienta que falta por hacer es una en la cual se puedan ver y exportar resúmenes, además de comparar periodos de tiempo; además de exportar resúmenes, también quiero que esté la opción de exportar archivos por herramientas, por ejemplo de X deuda, X ahorro, etc. Ayúdame a definir los límites y ver qué archivos serán exportables, si agrego gráficos a los resúmenes, el formato, etc. Quiero que revises la infraestructura de la app por completo para ver dónde son necesarios estos archivos exportables y quiero que me des opciones de cómo implementar esta herramienta."*

---

## Locked decisions

### 1. Ubicación Arquitectónica de la Experiencia (`Q1` — Decisión: Opción B)
- **Decisión cerrada:** **Centro Único en `/herramientas/resumenes`**. Toda visualización de resúmenes avanzados, comparación de periodos y cualquier descarga/exportación de archivos (incluyendo la selección de *"Deuda X"*, *"Ahorro Y"*, *"Presupuesto Z"*, *"Gastos Fijos"* o *"Ingresos"*) se realiza desde esta nueva herramienta central accesible desde `ToolsHub.tsx` (bajo una nueva sección *"Análisis y Reportes"*).
- **Opciones descartadas y por qué perdieron:**
  - *Opción A (Híbrido: Centro de Resúmenes + Botones de exportar en el `PageHeader` de cada herramienta):* Descartada tras auditar `FixedExpenses.tsx`, `EstimatedIncomeList.tsx`, `Budgets.tsx`, `DebtList.tsx` y `SavingGoals.tsx`. En todas esas pantallas, el slot superior derecho (`rightAction` / `actionLabel` de `PageHeader.tsx`) ya está ocupado en móvil por la acción primaria de creación (`+ Nuevo`, `+ Ingreso` o el `<MonthPicker />`). Añadir botones de exportación en cada encabezado saturaría la barra superior móvil y fragmentaría el flujo de configuración.
  - *Opción C (Integrado dentro del Dashboard `/` sin nueva herramienta en `ToolsHub`):* Descartada porque el `Dashboard.tsx` principal debe mantenerse ultraligero y enfocado en el registro rápido de transacciones del día a día, sin sobrecargarlo con selectores dobles de periodos ni formularios de exportación.

### 2. Formatos de Archivo Exportables Soportados (`Q2` — Decisión: Opciones A + B + C)
- **Decisión cerrada:** Soportar los **3 formatos orientados al usuario final**:
  1. **CSV (`.csv`)** con codificación UTF-8 + BOM (`\uFEFF`) para compatibilidad directa con Microsoft Excel, Google Sheets y Numbers sin corrupción de tildes (`á, é, í, ó, ú, ñ`) ni símbolos monetarios (`Bs.`, `€`, `$`).
  2. **PDF Ejecutivo / Estado de Cuenta (`.pdf`)** con diseño limpio, ficha de resumen superior, gráficos vectoriales opcionales e historial tabular, pensado para lectura móvil y envío inmediato por WhatsApp/Telegram mediante `navigator.share`.
  3. **Excel Nativo Multi-hoja (`.xlsx`)** estructurado en pestañas separadas (p. ej. *Hoja 1: Resumen Ejecutivo / Comparativa*, *Hoja 2: Desglose por Categorías*, *Hoja 3: Movimientos Detallados con columnas multimoneda*).
- **Opción descartada y por qué perdió:**
  - *Opción D (JSON Estructurado `.json`):* Descartada porque es un formato técnico de respaldo/desarrollo que no aporta valor legible al usuario final para revisar estados de cuenta, compartir una deuda con un tercero o analizar gastos en hojas de cálculo.

### 3. Motor de Generación de Resúmenes y Archivos (`Q3` — Decisión: Opción A)
- **Decisión cerrada:** **Arquitectura Híbrida (Agregación SQL en FastAPI + Generación de archivos en Frontend con `dynamic import()`)**.
  - **En Backend (`FastAPI` + `SQLAlchemy Async` + `PostgreSQL`):** Nuevos endpoints de lectura/agregación calculan en SQL las sumas multimoneda, promedios diarios, variaciones entre Periodo A y Periodo B (`Δ$`, `Δ%`), agrupaciones temporales para gráficos y consolidación de entidades, devolviendo un payload JSON compacto.
  - **En Frontend (`React 19` + `TypeScript`):** El navegador construye bajo demanda el archivo `.csv` (nativo con `Blob`), `.xlsx` (cargando `xlsx` / SheetJS vía `import()` dinámico solo cuando el usuario pulsa exportar, añadiendo **0 KB** al bundle inicial) y `.pdf` (renderizando los gráficos SVG y tablas con carga diferida), habilitando además el menú nativo de compartir (`navigator.share({ files })`) en dispositivos móviles.
- **Opciones descartadas y por qué perdieron:**
  - *Opción B (100% Backend en Python con `openpyxl` / `reportlab` / `weasyprint`):* Descartada porque generar PDFs con gráficos en el servidor Python exige dependencias pesadas de sistema (Cairo/Chromium/ReportLab), incrementa drásticamente el consumo de RAM/CPU por petición en producción y obliga a duplicar el diseño de los gráficos en Python en lugar de reutilizar los gráficos SVG de React.
  - *Opción C (100% Frontend sin nuevos endpoints SQL):* Descartada porque obligaría al navegador móvil a descargar miles de registros crudos de gastos e ingresos para comparar dos periodos largos (ej. Año 2025 vs. Año 2026), degradando el tiempo de respuesta y el consumo de datos.

### 4. Alcance de Exportaciones por Herramienta (`Q4` — Decisión: Opciones A + B + C + D)
- **Decisión cerrada:** El selector de exportación en `/herramientas/resumenes` cubre las **4 familias de herramientas** de la aplicación además del Resumen General y Comparativo:
  - **A. Deudas (`Debt` + `DebtPayment`):** Permite exportar el *Estado de Cuenta de una deuda individual* (ej. *"Deuda X"*) o el *Consolidado de todas las deudas* (filtrable por *Por Pagar* / *Por Cobrar* / *Saldadas* / *Activas*).
  - **B. Metas de Ahorro (`SavingGoal` + `SavingDeposit`):** Permite exportar la *Cartola/Historial de una meta de ahorro individual* (ej. *"Ahorro Y"*) o el *Consolidado de todas las metas de ahorro*.
  - **C. Presupuestos Mensuales y Subpresupuestos (`MonthlyBudgetResponse` / `SingleBudgetOut` + `BudgetCategoryLimit`):** Permite exportar para un mes (`YYYY-MM`) ya sea el **Plan Maestro completo con todos sus Subpresupuestos** o **un Subpresupuesto específico** (propio o compartido conmigo), incluyendo el techo asignado, monto real gastado, saldo disponible, semáforo (`ok`, `warning`, `exceeded`) por categoría, gastos fuera de presupuesto (`unbudgeted`) y la lista de gastos reales del mes imputados a esas categorías.
  - **D. Gastos Fijos e Ingresos Mensuales (`FixedExpense` + `FixedExpenseCheck` / `EstimatedIncome` + `Income`):** Permite exportar el *Control Mensual de Gastos Fijos* (pagados vs. pendientes en el mes) y el *Reporte de Ingresos del Periodo* (estimados vs. reales percibidos).
- **Opciones descartadas:** Ninguna; se aprobó la cobertura completa de los módulos financieros para evitar herramientas huérfanas.

### 5. Manejo de Multimoneda (`USD`, `BS`, `EUR`, `USDT`) (`Q6` — Decisión: Opción B)
- **Decisión cerrada:** **Pre-selección inteligente de la Moneda Principal del usuario (`mainCurrency` desde `CurrencyPreferenceContext`) + Selector explícito en el Configurador + Columnas multimoneda originales en tablas**.
  - Al abrir `/herramientas/resumenes` o configurar una exportación, la moneda del reporte se inicializa automáticamente con `mainCurrency` (`'USD' | 'BS' | 'EUR' | 'USDT'` guardado en `localStorage['gastosapp_main_currency']` desde `/ajustes`).
  - El usuario puede cambiar en cualquier momento la moneda activa del resumen o del archivo a exportar (`USD`, `BS`, `EUR`, `USDT`).
  - En las tablas detalladas de movimientos/abonos exportadas (`.csv`, `.xlsx`, `.pdf`), el usuario puede activar el switch para mostrar, junto al monto convertido a la moneda del reporte, las columnas de **Monto Original Pagado**, **Moneda Original** y **Tasa de Cambio Histórica aplicada (`exchange_rate`)**.
- **Opciones descartadas y por qué perdieron:**
  - *Opción A (Totales fijos exclusivamente en USD sin selector):* Descartada porque ignora la preferencia `mainCurrency` que el usuario ya configura en `/ajustes` y limita a quienes llevan su contabilidad o deudas en `EUR`, `USDT` o `BS`.
  - *Opción C (Exclusivamente USD sin detalle multimoneda):* Descartada porque elimina la trazabilidad bancaria de cuánto se transfirió exactamente en Bolívares o USDT el día del pago.

### 6. Reglas, Flexibilidad y Límites del Comparador de Periodos (`Q7` — Decisión: Atajos Simétricos + Selección Libre con Avisos de Integridad)
- **Decisión cerrada:**
  1. **Atajos Simétricos de 1 toque:**
     - *Este Mes vs. Mes Anterior*
     - *Este Mes vs. Mismo Mes del Año Pasado*
     - *Esta Semana vs. Semana Anterior*
     - *Este Año vs. Año Anterior*
  2. **Selección Libre de Periodo A vs. Periodo B (Igual o Diferente Duración):**
     - El usuario puede elegir cualquier `date_from` y `date_to` para el Periodo A y cualquier `date_from` y `date_to` para el Periodo B (hasta un límite técnico máximo de **366 días por periodo** para proteger el renderizado de gráficos).
  3. **Aviso de Integridad de Datos y Normalización cuando la duración difiere (`days_A !== days_B`):**
     - Si el usuario compara dos periodos de distinta duración (ej. una quincena de 15 días contra un mes de 30 días, o febrero de 28 días contra marzo de 31 días), la interfaz y el documento exportado muestran un **Banner de Integridad Analítica**: *"Atención: Estás comparando periodos de distinta duración (X días vs. Y días). Para una comparación proporcional justa, revisa la variación del Promedio Diario ($/día)."*
     - Las tarjetas comparativas destacan lado a lado tanto la variación del **Total Bruto (`Δ% Total`)** como la variación del **Promedio Diario (`Δ% Promedio/día`)**.
  4. **Agrupación Temporal Automática en Gráficos:**
     - Periodos `≤ 31 días`: agrupación por **Día**.
     - Periodos de `32 a 92 días`: agrupación por **Semana**.
     - Periodos `> 92 días` (hasta 366 días): agrupación por **Mes**.
- **Opciones descartadas y por qué perdieron:**
  - *Opción B (Solo meses o años cerrados de calendario):* Descartada porque impide comparar quincenas, semanas o rangos personalizados (ej. vacaciones o proyectos).
  - *Opción C (Rango libre sin avisos de integridad ni agrupación dinámica):* Descartada porque comparar 10 días contra 90 días sin advertencia ni promedio diario induce a errores financieros, y graficar 300 días individuales rompe la legibilidad en móvil y PDF.

### 7. Flujo del Configurador ("¿Qué quieres y cómo lo quieres?") y Límites de Filas (`Q8` — Decisión: Opción A)
- **Decisión cerrada:** **Vista con 2 Pestañas en `/herramientas/resumenes` (`"Resumen y Comparador"` | `"Exportar Archivos"`) con Configurador Interactivo Paso a Paso**:
  - **Pestaña 1 — `Resumen y Comparador`:** Exploración visual en pantalla de un periodo o comparación de dos periodos (tarjetas de resumen, deltas `Δ%`, los 3 gráficos interactivos y desglose por categorías), con un botón rápido *"Exportar esta vista"* que pre-rellena la Pestaña 2.
  - **Pestaña 2 — `Exportar Archivos` (Constructor a medida):** Le pregunta al usuario paso a paso qué quiere y cómo lo quiere:
    1. **¿Qué deseas exportar? (Origen):**
       - *Resumen de un Periodo* (Gastos, Ingresos y Balance)
       - *Comparativa de dos Periodos (Periodo A vs. Periodo B)*
       - *Deudas* -> Selector: *"Todas las deudas"* o elegir una **Deuda específica (`Deuda X`)**
       - *Metas de Ahorro* -> Selector: *"Todas las metas"* o elegir una **Meta específica (`Ahorro Y`)**
       - *Presupuesto Mensual* -> Selector de Mes (`YYYY-MM`)
       - *Gastos Fijos / Ingresos Mensuales* -> Selector de Mes (`YYYY-MM`)
    2. **¿En qué moneda y rango?:** Selector de Moneda (`USD` | `BS` | `EUR` | `USDT`, pre-seleccionado en `mainCurrency`) y selector de fechas/mes cuando aplique.
    3. **¿Qué secciones incluir? (Checkboxes de personalización):**
       - `[x]` Resumen ejecutivo / Ficha de cabecera
       - `[x]` Gráficos visuales *(aplicable cuando el formato es PDF y el origen es Resumen/Comparativa)*
       - `[x]` Desglose por categorías / Estado de semáforos
       - `[x]` Tabla detallada de movimientos / abonos individuales
       - `[x]` Mostrar columnas de moneda y tasa original por transacción
    4. **¿En qué formato y cómo entregarlo?:** Tarjetas de selección para **PDF Ejecutivo (`.pdf`)**, **Excel Multi-hoja (`.xlsx`)** o **CSV (`.csv`)**, con 3 acciones de entrega: **Descargar archivo**, **Compartir (`navigator.share`)** y **Enviar por Correo Electrónico (`POST /api/reports/send-email`, pre-rellenando el correo del usuario autenticado desde `useAuth().user?.email` con opción de editarlo)**.
  - **Límites de Seguridad de Filas:**
    - **PDF (`.pdf`):** Máximo **2,000 filas** de movimientos detallados por documento (si el rango supera 2,000 filas, el PDF incluye el Resumen Ejecutivo, los Gráficos, el Desglose por Categorías y los primeros 2,000 movimientos con una nota indicando que para el volcado de más de 2,000 filas se recomienda Excel/CSV).
    - **Excel (`.xlsx`) y CSV (`.csv`):** Máximo **10,000 filas** por exportación para evitar bloqueos de memoria (`Out of Memory`) en navegadores móviles.
- **Opciones descartadas y por qué perdieron:**
  - *Opción B (Solo un modal emergente sin pestaña dedicada):* Descartada porque oculta la capacidad de exportar herramientas individuales (`Deuda X`, `Ahorro Y`) detrás de un modal secundario.
  - *Opción C (Descarga directa en 1 toque sin configurador):* Descartada porque no le permite al usuario elegir moneda, entidad específica ni qué secciones incluir o excluir del documento.

---

## Routine choices

- **Gráficos en Resúmenes, Comparativas y PDF (`Q5` → Opciones A + B + C + D):**
  - Se implementarán **3 gráficos vectoriales (SVG)** adaptados al sistema de diseño de `gastosapp` y se incrustarán también en el PDF Ejecutivo cuando el usuario marque *"Incluir gráficos"*:
    1. **Distribución por Categorías (Donut / Barras horizontales proporcionales):** Peso porcentual (`%`) y monto de cada categoría sobre el total.
    2. **Tendencia Temporal de Flujo de Caja (Barras/Líneas de Ingresos vs. Gastos):** Evolución agrupada automáticamente por día, semana o mes según la duración del periodo.
    3. **Gráfico Comparativo Lado a Lado (Periodo A vs. Periodo B):** Barras pareadas contrastando Ingresos, Gastos, Balance Neto y Top 5 Categorías entre ambos periodos con indicadores `Δ%` y `Δ$`.
- **Estructura de Datos de los Archivos por Herramienta (`Q9` → Opción A):**
  - Cada exportación por herramienta utiliza una **Plantilla de Estado de Cuenta Completa (Ficha de Resumen Arriba + Tabla de Movimientos Abajo)** en lugar de una lista huérfana de transacciones:
    - **Deuda Individual (`Deuda X`):** Cabecera con *Nombre/Detalle, Contraparte, Tipo (Por Pagar / Por Cobrar), Fecha de creación/vencimiento, Monto Inicial Total, Total Abonado, Saldo Pendiente Actual y % de Avance*, seguida de la tabla cronológica de abonos/aumentos (`DebtPayment`).
    - **Meta de Ahorro Individual (`Ahorro Y`):** Cabecera con *Nombre de la Meta, Fecha Objetivo, Monto Meta, Total Depositado, Total Retirado, Saldo Actual Ahorrado y % de Cumplimiento*, seguida de la tabla cronológica de aportes y retiros (`SavingDeposit`).
    - **Presupuesto Mensual (`Mes Z`):** Cabecera con *Mes, Límite Global, Gasto Total Ejecutado, Saldo Restante y Estado del Semáforo Global*, seguida de la tabla de categorías (`BudgetCategoryLimit`) con *Categoría, Límite Asignado, Gastado, Diferencia, % Consumido y Estado (`ok` / `warning` / `exceeded`)*.
    - **Gastos Fijos e Ingresos Mensuales (`Mes Z`):** Cabecera con *Total Estimado/Comprometido, Total Pagado/Percibido y Pendiente del Mes*, seguida del checklist detallado de cada compromiso indicando estado (*Pagado/Cobrado* vs. *Pendiente*), fecha de ejecución y monto.

---

## Verified facts

1. **Dependencias actuales (`frontend/package.json` y `backend/requirements.txt`):**
   - El frontend utiliza **React 19 (`^19.0.0`)**, **React Router v7 (`^7.5.0`)**, **`date-fns` (`^4.1.0`)** y **`lucide-react` (`^1.16.0`)**. Actualmente **no** tiene ninguna librería de gráficos ni de exportación instalada.
   - El backend utiliza **FastAPI**, **SQLAlchemy 2.0 Async (`asyncpg`)** y **Pydantic v2**. Actualmente **no** tiene `pandas`, `openpyxl` ni `reportlab`.
2. **Infraestructura Multimoneda existente (`frontend/src/context/CurrencyPreferenceContext.tsx` y `frontend/src/utils/`):**
   - `useCurrencyPreference()` expone `mainCurrency: MainCurrencyPreference` (`'USD' | 'BS' | 'EUR' | 'USDT'`), persistido en `localStorage` bajo la clave `'gastosapp_main_currency'`.
   - `frontend/src/utils/currencySummary.ts` (`resolveCurrencyTotal`, `resolveIncomeTotal`, `resolveBalanceTotal`) y `frontend/src/utils/currencyFormat.ts` (`convertItemAmountToMainCurrency`, `formatCurrencyAmount`) ya resuelven la conversión y visualización multimoneda usando los campos `amount_usd`, `amount_bs`, `amount_eur`, `amount_usdt` y `exchange_rate` almacenados en todos los modelos de PostgreSQL (`backend/app/models.py`).
3. **Endpoints de resumen existentes (`backend/app/routers/expenses.py` y `backend/app/crud.py`):**
   - Ya existen `GET /api/expenses/summary` y `GET /api/expenses/summary-range?date_from=...&date_to=...` que devuelven `RangeSummaryResponse` con `total_spent_usd/bs/eur/usdt`, `total_income_usd/bs/eur/usdt`, `balance_usd/bs/eur/usdt`, `daily_average` y `by_category`.
4. **Punto de inserción en navegación (`frontend/src/components/ToolsHub.tsx` y `frontend/src/App.tsx`):**
   - `ToolsHub.tsx` (líneas 22–98) organiza las herramientas en `toolSections` (*Planificación Mensual*, *Patrimonio y Compromisos*, *Comunidad*). La nueva ruta `/herramientas/resumenes` encaja limpiamente en `App.tsx` y en una nueva sección *"Análisis y Reportes"* dentro de `ToolsHub.tsx`, añadiendo su token de color en `frontend/src/utils/toolColors.ts`.

---

## Especificación Técnica y Opciones de Implementación

### A. Mapa de Archivos Exportables por Herramienta (Qué contiene cada formato)

| Origen / Herramienta | Qué incluye en **PDF Ejecutivo (`.pdf`)** | Qué incluye en **Excel Multi-hoja (`.xlsx`)** | Qué incluye en **CSV (`.csv`)** |
| :--- | :--- | :--- | :--- |
| **1. Resumen de Periodo** | Portada/Cabecera con KPIs (Ingresos, Gastos, Balance, Promedio/día en moneda elegida) + Gráfico Donut de Categorías + Gráfico de Tendencia Temporal + Tabla de Categorías + Tabla de Movimientos (opcional, máx. 2,000 filas). | **Hoja 1:** Resumen Ejecutivo y KPIs.<br>**Hoja 2:** Desglose por Categorías.<br>**Hoja 3:** Serie Temporal.<br>**Hoja 4:** Movimientos Detallados (con columnas multimoneda originales). | Tabla plana de Movimientos del periodo (o Categorías si desmarca movimientos) con filas de totales al inicio/final. |
| **2. Comparador (Periodo A vs. B)** | Cabecera con Banner de Integridad (si `días A != días B`), Tarjetas Comparativas (`Periodo A`, `Periodo B`, `Δ$`, `Δ% Total`, `Δ% Promedio/día`), Gráfico de Barras Pareadas + Tabla Comparativa por Categoría. | **Hoja 1:** Comparativa General (KPIs A vs. B, Deltas y Promedios Diarios).<br>**Hoja 2:** Comparativa por Categoría (Monto A, Monto B, `Δ$`, `Δ%`).<br>**Hoja 3:** Movimientos Periodo A.<br>**Hoja 4:** Movimientos Periodo B. | Tabla comparativa consolidada por Categoría y Métrica (`Concepto`, `Periodo A`, `Periodo B`, `Diferencia`, `Variación %`). |
| **3. Deudas (`Deuda X` o `Todas`)** | **Si es `Deuda X`:** Ficha de Estado de Cuenta (Acreedor/Deudor, Monto Inicial, Abonado, Saldo Pendiente, Barra de Progreso %) + Tabla cronológica de Abonos/Aumentos.<br>**Si es `Todas`:** Resumen Global (Total Por Pagar vs. Por Cobrar) + Tabla de todas las deudas y su saldo actual. | **Si es `Deuda X`:** *Hoja 1:* Ficha de la Deuda; *Hoja 2:* Historial de Abonos (`DebtPayment`).<br>**Si es `Todas`:** *Hoja 1:* Cartera de Deudas; *Hoja 2:* Todos los Abonos registrados. | **Si es `Deuda X`:** Filas de cabecera con el resumen de la deuda seguidas de la tabla de abonos.<br>**Si es `Todas`:** Listado tabular de todas las deudas con montos iniciales, abonados y pendientes. |
| **4. Metas de Ahorro (`Ahorro Y` o `Todas`)** | **Si es `Ahorro Y`:** Ficha de la Meta (Objetivo, Ahorrado, Retirado, Neto Actual, % Progreso, Fecha Meta) + Tabla de Aportes y Retiros.<br>**Si es `Todas`:** Resumen Patrimonial de Ahorros + Tabla de Metas. | **Si es `Ahorro Y`:** *Hoja 1:* Ficha de Meta; *Hoja 2:* Depósitos y Retiros (`SavingDeposit`).<br>**Si es `Todas`:** *Hoja 1:* Resumen de Metas; *Hoja 2:* Movimientos de Ahorro. | **Si es `Ahorro Y`:** Ficha superior + tabla de depósitos/retiros.<br>**Si es `Todas`:** Tabla consolidada de todas las metas de ahorro. |
| **5. Presupuesto Mensual (`Mes Z`)** | Ficha de Ejecución Mensual (Límite Total, Gastado, Disponible, Semáforo) + Gráfico de Barras de Consumo vs. Límite + Tabla de Categorías del Presupuesto. | **Hoja 1:** Resumen del Presupuesto y Categorías (`Límite`, `Gastado`, `Disponible`, `%`, `Estado`).<br>**Hoja 2:** Gastos imputados al mes. | Tabla de ejecución por categoría (`Categoría`, `Límite`, `Gastado`, `Disponible`, `Porcentaje`, `Semáforo`). |
| **6. Gastos Fijos e Ingresos (`Mes Z`)** | Resumen de Compromisos del Mes (Pagados vs. Pendientes, Ingresos Estimados vs. Reales) + Tablas separadas con estado de check mensual. | **Hoja 1:** Checklist de Gastos Fijos del Mes.<br>**Hoja 2:** Ingresos Estimados vs. Reales del Mes. | Tabla unificada del mes con columna `Tipo` (`Gasto Fijo` / `Ingreso`), `Concepto`, `Monto Estimado`, `Estado` (`Pagado`/`Pendiente`), `Fecha Pago` y `Monto Real`. |

---

### B. Opciones de Implementación Técnica (Librerías y Estrategia de Construcción)

Para materializar las decisiones cerradas (`Q1`–`Q9`), existen **3 opciones técnicas de implementación** para el motor de gráficos y generación de archivos en el Frontend + Backend:

#### Opción 1 (Recomendada — Equilibrio Ideal Peso/Calidad): Gráficos SVG Nativos + `xlsx` (Dynamic Import) + Generador PDF Vectorial con Ventana de Impresión / `jspdf` bajo demanda
1. **Gráficos en UI y PDF:** Construir 3 componentes SVG puros en React (`CategoryDonutChart.tsx`, `CashflowTrendChart.tsx`, `PeriodComparisonBarChart.tsx`) sin instalar `recharts` (ahorra ~150 KB de bundle). Al ser SVG puros con variables CSS/colores explícitos, escalan con nitidez infinita en pantalla y se serializan directo al PDF.
2. **Motor CSV (`.csv`):** Utilidad propia en `frontend/src/utils/exporters/csvExporter.ts` (~60 líneas, 0 dependencias) con soporte de BOM UTF-8 (`\uFEFF`) y escape RFC 4180.
3. **Motor Excel (`.xlsx`):** Utilidad en `frontend/src/utils/exporters/excelExporter.ts` usando `xlsx` (SheetJS) cargado con `await import('xlsx')` únicamente cuando el usuario pulsa descargar Excel.
4. **Motor PDF (`.pdf`):** Utilidad en `frontend/src/utils/exporters/pdfExporter.ts` usando `jspdf` + `jspdf-autotable` (cargados vía `await import('jspdf')`) que dibuja la cabecera ejecutiva de GastosApp, rasteriza en alta resolución (2x) los SVGs de los gráficos activos y formatea las tablas con paginación automática y pie de página (*"Generado por GastosApp — Página X de Y"*).
5. **Backend (`backend/app/routers/reports.py`):** Un nuevo router ligero con `GET /api/reports/timeseries-and-compare` que extiende `crud.get_summary_range` devolviendo la serie temporal agrupada (`day`/`week`/`month`) y las métricas de `period_a`, `period_b` y `deltas`. Para Deudas, Ahorros, Presupuestos, Gastos Fijos e Ingresos se reutilizan los endpoints ya existentes en `api.ts`.

#### Opción 2 (Ultra-Ligera / Cero Dependencias NPM Nuevas): Gráficos SVG Nativos + CSV Nativo + Excel vía XML SpreadsheetML + PDF vía `@media print` Nativo
1. No instala ninguna librería nueva en `package.json`.
2. Para el PDF, abre una vista de impresión estilizada con `@media print` y ejecuta `window.print()` para que el usuario elija *"Guardar como PDF"* en su teléfono o PC.
3. **Ventaja:** 0 KB de dependencias externas.
4. **Desventaja:** En móviles Android/iOS, `window.print()` es incómodo, no descarga un archivo `.pdf` directo ni permite compartirlo en un toque por WhatsApp con `navigator.share({ files })`, y el archivo Excel XML suele mostrar una alerta de formato al abrirse en versiones modernas de Microsoft Excel.

#### Opción 3 (Full Suite con Librerías Dedicadas): `recharts` + `exceljs` + `@react-pdf/renderer`
1. Instala `recharts` para los gráficos en pantalla, `exceljs` para hojas de cálculo con estilos avanzados (colores de celdas, bordes, negritas) y `@react-pdf/renderer` para componer el PDF con componentes React.
2. **Ventaja:** Permite colorear celdas dentro del archivo `.xlsx` (ej. pintar de rojo/verde el semáforo de presupuestos dentro de Excel).
3. **Desventaja:** Añade más de ~1.2 MB (aun con code-splitting) y obliga a mantener dos árboles de componentes separados (uno en HTML/SVG para la pantalla y otro con primitivas `<View>/<Text>/<Svg>` de `@react-pdf/renderer` para el PDF).

---

### C. Plan de Partición Modular para Implementación (`/druizinhoskill` L3 Ready)

Cuando decidas pasar a la implementación del código, el trabajo queda particionado en **4 bloques disjuntos ($\le 4$ archivos por builder)**:

1. **Workstream A (Backend — Agregación de Series Temporales y Comparador):**
   - `backend/app/schemas.py` (esquemas `TimeSeriesPoint`, `PeriodComparisonResponse`)
   - `backend/app/crud.py` (función `get_period_comparison_and_series`)
   - `backend/app/routers/reports.py` + montaje en `backend/app/main.py`
   - `backend/tests/test_reports.py` (pruebas unitarias/integración con `unittest.IsolatedAsyncioTestCase`)
2. **Workstream B (Frontend — Gráficos SVG y Vista de Resúmenes/Comparador):**
   - `frontend/src/components/reports/ReportCharts.tsx` (Donut de Categorías, Tendencia Temporal y Barras Comparativas A vs. B)
   - `frontend/src/components/reports/PeriodComparisonView.tsx` (Atajos simétricos, selector libre A/B, Banner de Integridad por Asimetría y tarjetas `Δ% Total` / `Δ% Promedio/día`)
   - `frontend/src/types.ts` + `frontend/src/api.ts` (tipos y llamada al endpoint de reportes)
3. **Workstream C (Frontend — Motores de Exportación CSV, Excel `.xlsx` y PDF `.pdf`):**
   - `frontend/src/utils/exporters/csvExporter.ts`
   - `frontend/src/utils/exporters/excelExporter.ts`
   - `frontend/src/utils/exporters/pdfExporter.ts`
   - `frontend/src/utils/exporters/entityTemplates.ts` (formateadores de Estado de Cuenta para Deudas, Ahorros, Presupuestos, Gastos Fijos e Ingresos con soporte multimoneda)
4. **Workstream D (Frontend — Contenedor `/herramientas/resumenes`, Configurador y Navegación):**
   - `frontend/src/components/reports/ReportsHub.tsx` (contenedor con las 2 pestañas: *Resumen y Comparador* | *Exportar Archivos* y el configurador interactivo)
   - `frontend/src/components/ToolsHub.tsx` + `frontend/src/utils/toolColors.ts` + `frontend/src/App.tsx` (registro de ruta `/herramientas/resumenes` e ícono en el Hub)

---

## Risks

1. **Consumo de memoria en móviles al generar PDFs o Excels muy grandes:**
   - *Mitigación:* Se aplican los límites cerrados en `Q8` (**2,000 filas máximo** en tablas detalladas de PDF y **10,000 filas máximo** en Excel/CSV), mostrando un aviso previo si el rango supera ese volumen.
2. **Distorsión analítica al comparar periodos de distinta longitud o con alta inflación en Bs:**
   - *Mitigación:* Cerrado en `Q6` y `Q7`: el comparador detecta automáticamente cuando `days_A !== days_B`, despliega el **Banner de Integridad** y muestra la variación del **Promedio Diario (`$/día`)** junto al total, operando en la moneda elegida por el usuario (pre-seleccionada desde `mainCurrency`).
3. **Impacto en el tiempo de carga inicial de la app (`Bundle Size`):**
   - *Mitigación:* Las librerías de generación de `.xlsx` y `.pdf` se importarán exclusivamente mediante `await import(...)` dentro de la función del botón *"Descargar / Compartir"*, garantizando **0 KB adicionales** en la carga inicial del `Dashboard`.

---

## Deferred

- Ninguna pregunta quedó diferida (`0 deferred`). Todas las decisiones de alcance, límites, formatos y arquitectura fueron cerradas durante la sesión.

---

## Open threads

- Ningún hilo quedó abierto sin decisión. Las dudas planteadas en `Q1` (ubicación del botón de exportar), `Q3` (flujo híbrido de generación de archivos), `Q6` (selector de moneda basado en la preferencia del usuario y configurador previo), `Q7` (comparación de periodos de igual o diferente duración con avisos de integridad) y `Q9` (estructura de estado de cuenta con ficha de resumen + tabla de movimientos) fueron resueltas e incorporadas en las decisiones finales.
