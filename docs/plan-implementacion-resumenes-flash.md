# Plan de Implementación: Centro de Resúmenes, Comparador de Periodos y Exportaciones (`/herramientas/resumenes`)

> [!IMPORTANT]
> Este documento contiene el **contrato técnico completo, esquemas de datos, firmas de funciones, lógica de negocio y partición en 4 bloques ($\le 4$ archivos por bloque)** para que **Gemini 3.8 Flash** lo implemente de principio a fin sin necesidad de adivinar nada de la arquitectura de `gastosapp`.

---

## 1. ¿Cómo va a funcionar exactamente la herramienta? (Flujo Funcional de Extremo a Extremo)

### A. Entrada y Navegación
1. El usuario entra a **Herramientas** (`/herramientas` en `frontend/src/components/ToolsHub.tsx`) y ve una nueva sección **"Análisis y Reportes"** con la tarjeta **"Resúmenes y Exportación"** (`/herramientas/resumenes`).
2. Al abrir `/herramientas/resumenes`, el componente principal `ReportsHub.tsx` carga la moneda preferida del usuario desde `useCurrencyPreference()` (`mainCurrency: 'USD' | 'BS' | 'EUR' | 'USDT'` en `frontend/src/context/CurrencyPreferenceContext.tsx`), pero muestra un selector de moneda en la cabecera de controles para cambiar entre `USD`, `BS`, `EUR` y `USDT` en caliente para ese reporte.
3. La pantalla tiene un selector superior de **2 Pestañas**:
   - **Pestaña 1: `Resumen y Comparador`**
   - **Pestaña 2: `Exportar Archivos`**

### B. Pestaña 1: `Resumen y Comparador`
1. **Conmutador de Modo:**
   - **Modo "Resumen de Periodo"**: Analiza un único rango de fechas (*Este Mes*, *Mes Anterior*, *Esta Semana*, *Este Año* o *Personalizado*).
   - **Modo "Comparar Periodos (A vs. B)"**:
     - Ofrece **4 atajos simétricos de 1 toque**:
       1. *Este mes vs. Mes anterior*
       2. *Este mes vs. Mismo mes del año pasado*
       3. *Esta semana vs. Semana pasada*
       4. *Este año vs. Año pasado*
     - Ofrece **Selección Libre (`Personalizado`)**: El usuario elige `date_from_a` / `date_to_a` y `date_from_b` / `date_to_b` (pueden ser de igual o diferente duración, con un tope máximo de **366 días** por periodo).
2. **Validación y Aviso de Integridad por Asimetría (`days_A !== days_B`):**
   - Si el Periodo A tiene $N$ días y el Periodo B tiene $M$ días ($N \neq M$, por ejemplo comparar 15 días contra 30 días, o febrero de 28 días contra marzo de 31 días), se renderiza un **Banner de Integridad Analítica** amarillo/ámbar:
     > *"Aviso de integridad: Estás comparando un periodo de X días contra uno de Y días. Además del total bruto, revisa la variación del Promedio Diario (Δ% / día) para una comparación proporcional."*
   - Las tarjetas de KPIs muestran para **Ingresos**, **Gastos**, **Balance Neto** y **Promedio Diario**:
     - Valor en Periodo A vs. Valor en Periodo B (en la moneda elegida).
     - Variación absoluta (`Δ$`) y porcentual del total (`Δ% Total`).
     - Variación porcentual del promedio diario (`Δ% Promedio/día`).
3. **Los 3 Gráficos Vectoriales (SVG Puros en `ReportCharts.tsx`):**
   - **Gráfico 1 — `CategoryDonutChart` (Distribución por Categoría):** Anillo SVG interactivo + barras horizontales proporcionales con el `%` y monto de cada categoría sobre el gasto total.
   - **Gráfico 2 — `CashflowTrendChart` (Evolución Temporal de Ingresos vs. Gastos):** Barras dobles/líneas agrupadas automáticamente por el backend según la duración del periodo:
     - `<= 31` días -> agrupación por **Día** (`YYYY-MM-DD`).
     - `32 a 92` días -> agrupación por **Semana** (inicio de semana ISO `YYYY-MM-DD`).
     - `> 92` días (hasta `366`) -> agrupación por **Mes** (`YYYY-MM`).
   - **Gráfico 3 — `PeriodComparisonBarChart` (Comparativa Lado a Lado Periodo A vs. Periodo B):** Barras pareadas para Ingresos, Gastos, Balance y el Top 6 de Categorías entre el Periodo A y el Periodo B.
4. **CTA Directo:** Un botón *"Exportar este análisis"* al pie o en los controles cambia a la Pestaña 2 pre-rellenando automáticamente el origen, las fechas y la moneda.

### C. Pestaña 2: `Exportar Archivos` (El Configurador "¿Qué quieres y cómo lo quieres?")
El usuario configura su archivo en 4 bloques claros antes de descargarlo, compartirlo o enviarlo por correo:
1. **Paso 1 — ¿Qué quieres exportar? (`ExportSource`):**
   - `summary`: Resumen de un Periodo (Gastos + Ingresos + Balance).
   - `comparison`: Comparativa de Periodos (Periodo A vs. Periodo B).
   - `debts`: Deudas -> Sub-selector: **"Todas las deudas"** (con filtro opcional Todas / Por Pagar / Por Cobrar) O **"Una deuda específica"** (dropdown con las deudas cargadas de `getDebts()`, ej. *"Préstamo Carro - Carlos"*).
   - `savings`: Metas de Ahorro -> Sub-selector: **"Todas las metas"** O **"Una meta específica"** (dropdown con las metas de `getSavingGoals()`, ej. *"Fondo de Emergencia"*).
   - `budgets`: Presupuestos Mensuales -> Selector de Mes (`YYYY-MM`, por defecto el mes actual) + **Sub-selector de Presupuesto (`selectedBudgetId`)**:
     - **"Plan Maestro + Todos los Subpresupuestos (`all`)"**: Incluye el techo global del mes, la tabla resumen de todos los subpresupuestos (propios y compartidos conmigo), la tabla de todas las categorías con su Límite vs. Gastado + Gastos sin presupuestar (`unbudgeted`), y los movimientos del mes.
     - **"Un Subpresupuesto específico (propio o compartido)"** (dropdown cargado desde `getMonthlyBudget(monthYear)` combinando `budgets` donde `!is_primary` y `shared_with_me_budgets`): Exporta únicamente ese subpresupuesto (su techo grupal, cuánto se gastó, cuánto queda, la tabla de sus categorías con Límite vs. Gastado y los gastos individuales del mes que pertenecen a las categorías de ese subpresupuesto).
   - `fixed_and_income`: Gastos Fijos e Ingresos Mensuales -> Selector de Mes (`YYYY-MM`).
2. **Paso 2 — ¿En qué moneda y fechas?:**
   - Selector de Moneda (`USD`, `BS`, `EUR`, `USDT`), inicializado con `mainCurrency` de Ajustes.
   - Selector de rango de fechas (si el origen es `summary` o `comparison`) o selector de mes (`YYYY-MM` si es `budgets` o `fixed_and_income`).
3. **Paso 3 — ¿Cómo lo quieres? (Checkboxes de Contenido):**
   - `[x] includeHeaderCard`: **Incluir Ficha de Estado de Cuenta / Resumen Superior** (ej. en Deuda X: Monto original, Total abonado, Saldo pendiente y % pagado; en Ahorro Y: Meta objetivo, Total ahorrado, Retiros y % completado; en Presupuesto: Límite global vs. Gastado).
   - `[x] includeCharts`: **Incluir Gráficos Visuales** *(activo cuando formato = `PDF` y origen = `summary` o `comparison`)*.
   - `[x] includeCategories`: **Incluir Desglose por Categorías / Semáforos**.
   - `[x] includeTransactions`: **Incluir Tabla de Movimientos / Abonos individuales**.
   - `[x] includeOriginalCurrency`: **Mostrar columnas de Monto Original Pagado (`Bs`/`USD`/`EUR`/`USDT`) y Tasa aplicada (`exchange_rate`)** en la tabla de movimientos.
4. **Paso 4 — Formato, Descarga y Envío por Correo (`PDF` | `Excel .xlsx` | `CSV .csv`):**
   - Selección de formato con descripción de cómo saldrá estructurado.
   - **Límites de seguridad automáticos:**
     - Si el formato es **PDF** y hay más de **2,000 movimientos**, trunca la tabla detallada a los primeros 2,000 registros y añade una nota en el PDF indicando que para el listado completo se utilice Excel/CSV.
     - Si el formato es **Excel o CSV**, soporta hasta **10,000 movimientos**.
   - **3 Acciones de Entrega:**
     1. **"Generar y Descargar"**: Descarga inmediata al dispositivo.
     2. **"Compartir"**: Abre el menú nativo del teléfono (`navigator.share({ files })` para WhatsApp, Telegram, etc.).
     3. **"Enviar por Correo"**: Muestra un campo de correo **pre-rellenado automáticamente con `user?.email`** (obtenido de `useAuth()` en `frontend/src/context/AuthContext.tsx`, igual que en `SettingsPage.tsx:85-88`), permitiendo dejar el correo propio o escribir otro (ej. el correo de un contador o de un "pana"), genera el archivo (`.pdf`, `.xlsx` o `.csv`) y lo envía adjunto vía `POST /api/reports/send-email` (con límite de tamaño de archivo adjunto de **10 MB**).

---

## 2. Qué se tiene que hacer exactamente (Contratos por Archivo)

El trabajo está dividido en **4 Workstreams disjuntos (<= 4 archivos cada uno)**.

---

### Workstream A: Backend FastAPI (Series Temporales, Comparador SQL y Envío por Correo)

#### Archivos a tocar/crear (4 archivos):
1. `backend/app/schemas.py` *(Modificar — añadir esquemas de reportes y de envío por correo después de `RangeSummaryResponse` en línea 205)*
2. `backend/app/crud.py` *(Modificar — añadir funciones de serie temporal y comparación después de `get_summary_range` en línea 254)*
3. `backend/app/routers/reports.py` *(Crear nuevo router con `/analysis` y `/send-email`)* y montar en `backend/app/main.py` (línea 274)
4. `backend/tests/test_reports.py` *(Crear tests unitarios/integración de análisis y envío de email)*

#### Especificación exacta para Workstream A:

1. **En `backend/app/schemas.py` (después de `RangeSummaryResponse` en la línea 205):**
   ```python
   class TimeSeriesBucket(BaseModel):
       bucket_label: str  # 'YYYY-MM-DD' (day/week) o 'YYYY-MM' (month)
       start_date: date
       end_date: date
       expense_bs: Decimal = Decimal("0")
       expense_usd: Decimal = Decimal("0")
       expense_eur: Decimal = Decimal("0")
       expense_usdt: Decimal = Decimal("0")
       income_bs: Decimal = Decimal("0")
       income_usd: Decimal = Decimal("0")
       income_eur: Decimal = Decimal("0")
       income_usdt: Decimal = Decimal("0")

   class CategoryComparisonItem(BaseModel):
       category: str
       period_a_bs: Decimal = Decimal("0")
       period_a_usd: Decimal = Decimal("0")
       period_a_eur: Decimal = Decimal("0")
       period_a_usdt: Decimal = Decimal("0")
       period_b_bs: Decimal = Decimal("0")
       period_b_usd: Decimal = Decimal("0")
       period_b_eur: Decimal = Decimal("0")
       period_b_usdt: Decimal = Decimal("0")
       delta_pct_usd: Optional[float] = None  # ((B - A) / A) * 100 si A > 0

   class PeriodComparisonResponse(BaseModel):
       granularity_a: str  # 'day' | 'week' | 'month'
       granularity_b: Optional[str] = None
       is_asymmetric: bool = False  # True si period_a.days_in_range != period_b.days_in_range
       period_a: RangeSummaryResponse
       series_a: List[TimeSeriesBucket]
       period_b: Optional[RangeSummaryResponse] = None
       series_b: Optional[List[TimeSeriesBucket]] = None
       category_comparison: List[CategoryComparisonItem] = []

   class SendReportEmailRequest(BaseModel):
       recipient_email: str  # Validado con regex básico de email
       subject: str
       report_title: str
       report_subtitle: Optional[str] = None
       summary_highlights: List[str] = []  # Ej. ["Ingresos: $1,200.00", "Gastos: $800.00"]
       filename: str  # Ej. "resumen-gastosapp-2026-11.pdf"
       mime_type: str  # 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'text/csv'
       file_base64: str  # Contenido binario del archivo en Base64 (máx ~10MB)
   ```

2. **En `backend/app/crud.py`:**
   - Crear `async def get_report_comparison(db: AsyncSession, user_id: UUID, date_from_a: date, date_to_a: date, date_from_b: Optional[date] = None, date_to_b: Optional[date] = None) -> schemas.PeriodComparisonResponse`:
     - Validar que `(date_to_a - date_from_a).days + 1 <= 366` (y lo mismo para B si está presente).
     - Reutilizar `await get_summary_range(db, user_id, date_from_a, date_to_a)` para `period_a` (y para `period_b` si se envían `date_from_b` y `date_to_b`).
     - Determinar la granularidad automáticamente según `days_in_range`:
       - `<= 31`: `'day'`
       - `<= 92`: `'week'`
       - `> 92`: `'month'`
     - Construir `series_a` (y `series_b`) agrupando en memoria de Python (o SQL) las filas de `Expense` e `Income` del rango en los buckets correspondientes para que todos los buckets del rango existan ordenados cronológicamente (incluso días/semanas/meses con `0` gastos).
     - Si `period_b` está presente:
       - Calcular `is_asymmetric = (period_a.days_in_range != period_b.days_in_range)`.
       - Unir las categorías de `period_a.by_category` y `period_b.by_category` en `category_comparison`, ordenadas de mayor a menor peso en `period_b_usd + period_a_usd`.

3. **En `backend/app/routers/reports.py` y `backend/app/main.py`:**
   - **Endpoint 1:** `GET /api/reports/analysis` con query params `date_from_a`, `date_to_a`, `date_from_b`, `date_to_b`.
     - Si `(date_to_a - date_from_a).days > 366` o `date_from_a > date_to_a` (igual para B), devolver `HTTPException(status_code=400, detail="El rango debe ser válido y no superar 366 días.")`.
   - **Endpoint 2:** `POST /api/reports/send-email` (recibe `SendReportEmailRequest`):
     - Validar formato de `recipient_email` y que `len(file_base64)` no supere 14,000,000 caracteres (~10 MB decodificado).
     - Construir un cuerpo HTML limpio de correo con el título del reporte (`report_title`), subtítulo (`report_subtitle`) y viñetas con `summary_highlights`, indicando que el archivo solicitado (`filename`) se encuentra adjunto.
     - **Soporte Dual Sin Dependencias Externas en `requirements.txt` (usando librería estándar de Python en `asyncio.to_thread`):**
       - **Modo 1 (SMTP estándar / Gmail App Password):** Si están configuradas las variables de entorno `SMTP_HOST` (por defecto `smtp.gmail.com`), `SMTP_PORT` (por defecto `465`), `SMTP_USER` y `SMTP_PASSWORD`, envía el correo con adjunto usando `smtplib.SMTP_SSL` (o `SMTP` + `starttls` si puerto es `587`) y `email.message.EmailMessage`.
       - **Modo 2 (API HTTP Resend):** Si en su lugar está configurada `RESEND_API_KEY` (y `RESEND_FROM_EMAIL`), envía petición `POST https://api.resend.com/emails` con `urllib.request` incluyendo `attachments: [{"filename": req.filename, "content": req.file_base64}]`.
       - Si ninguna credencial (`SMTP_USER`/`SMTP_PASSWORD` ni `RESEND_API_KEY`) está configurada en el entorno, devuelve `HTTPException(status_code=503, detail="El servicio de correo no está configurado en el servidor (configura SMTP_USER y SMTP_PASSWORD en el archivo .env).")`.
   - Montar en `backend/app/main.py`: `app.include_router(reports.router, prefix="/api/reports", tags=["reports"])`.

4. **Comando de Verificación (Windows Sandbox Guardrail):**
   - Ejecutar: `rtk .\backend\venv\Scripts\python.exe -m unittest backend/tests/test_reports.py` (NO usar `asyncio.WindowsSelectorEventLoopPolicy()`, usar `unittest.IsolatedAsyncioTestCase` y mockear `smtplib.SMTP_SSL` en el test de envío de correo).

---

### Workstream B: Tipos Frontend, Cliente API y Gráficos SVG (`ReportCharts.tsx`)

#### Archivos a tocar/crear (3 archivos):
1. `frontend/src/types.ts` *(Modificar — añadir tipos de reportes y exportaciones después de `RangeSummaryResponse` en línea 195)*
2. `frontend/src/api.ts` *(Modificar — añadir `getReportAnalysis` y `sendReportEmail` después de `getSummaryRange` en línea 95)*
3. `frontend/src/components/reports/ReportCharts.tsx` *(Crear — los 3 gráficos vectoriales SVG)*

#### Especificación exacta para Workstream B:

1. **En `frontend/src/types.ts`:**
   - Añadir las interfaces espejo del backend (`TimeSeriesBucket`, `CategoryComparisonItem`, `PeriodComparisonResponse`) y los tipos del configurador de exportación:
     ```ts
     export type ExportSourceType =
       | 'summary'
       | 'comparison'
       | 'debts'
       | 'savings'
       | 'budgets'
       | 'fixed_and_income';

     export type ExportFormatType = 'pdf' | 'xlsx' | 'csv';

     export interface ExportConfig {
       source: ExportSourceType;
       format: ExportFormatType;
       currency: MainCurrencyPreference;
       dateFromA: string;
       dateToA: string;
       dateFromB?: string;
       dateToB?: string;
       monthYear: string; // 'YYYY-MM'
       selectedDebtId: string; // 'all' o UUID
       debtFilterType?: 'all' | 'owed' | 'receivable';
       selectedSavingId: string; // 'all' o UUID
       selectedBudgetId: string; // 'all' (Plan Maestro + Subpresupuestos) o UUID de un SingleBudgetOut (Subpresupuesto específico)
       includeHeaderCard: boolean;
       includeCharts: boolean;
       includeCategories: boolean;
       includeTransactions: boolean;
       includeOriginalCurrency: boolean;
     }
     ```
2. **En `frontend/src/api.ts`:**
   - Añadir:
     ```ts
     export const getReportAnalysis = async (params: {
       date_from_a: string;
       date_to_a: string;
       date_from_b?: string;
       date_to_b?: string;
     }): Promise<PeriodComparisonResponse> => {
       const response = await api.get<PeriodComparisonResponse>('/reports/analysis', { params });
       return response.data;
     };

     export const sendReportEmail = async (payload: {
       recipient_email: string;
       subject: string;
       report_title: string;
       report_subtitle?: string;
       summary_highlights: string[];
       filename: string;
       mime_type: string;
       file_base64: string;
     }): Promise<{ status: string; message: string }> => {
       const response = await api.post<{ status: string; message: string }>('/reports/send-email', payload);
       return response.data;
     };
     ```
3. **En `frontend/src/components/reports/ReportCharts.tsx`:**
   - Implementar **3 componentes SVG puros** con `forwardRef` en los `<svg>` (para que el exportador PDF pueda serializarlos cuando `includeCharts: true`):
     1. **`CategoryDonutChart`**: Renderiza un gráfico de anillo SVG (`stroke-dasharray` / `stroke-dashoffset`) con el total en el centro en la moneda seleccionada (`currency`) + lista de categorías con barra de progreso proporcional, porcentaje (`%`) y monto formateado con `formatCurrencyAmount`.
     2. **`CashflowTrendChart`**: Renderiza barras agrupadas de Ingresos (verde `#10B981`) vs. Gastos (coral/rojo `#F43F5E`) por cada `TimeSeriesBucket` (`day`, `week` o `month`), con ejes claros, etiquetas de fecha abreviadas y leyenda.
     3. **`PeriodComparisonBarChart`**: Renderiza barras pareadas comparando `Periodo A` (gris/azul `#64748B`) vs. `Periodo B` (violeta/índigo `#6366F1`) tanto en los KPIs globales (Ingresos, Gastos, Balance) como en el Top 6 de Categorías (`category_comparison`), mostrando insignias de variación `Δ%`.

---

### Workstream C: Motores de Exportación (`CSV`, `Excel .xlsx`, `PDF .pdf`) y Plantillas por Entidad

#### Archivos a crear/modificar (4 archivos):
1. `frontend/package.json` *(Instalar `xlsx`, `jspdf`, `jspdf-autotable`)*
2. `frontend/src/utils/exporters/entityTemplates.ts` *(Crear — normalizador de todos los orígenes a un modelo de reporte unificado)*
3. `frontend/src/utils/exporters/spreadsheetExporter.ts` *(Crear — motores `.csv` con BOM UTF-8 y `.xlsx` multi-hoja vía `import('xlsx')`)*
4. `frontend/src/utils/exporters/pdfExporter.ts` *(Crear — motor `.pdf` ejecutivo con soporte de gráficos SVG rasterizados y tablas vía `import('jspdf')`)*

#### Especificación exacta para Workstream C:

1. **Dependencias en `frontend/`:**
   - Instalar `xlsx`, `jspdf` y `jspdf-autotable`. **Regla obligatoria:** Nunca importarlos en el nivel superior de forma estática; usar siempre `const XLSX = await import('xlsx')` y `const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;` dentro de las funciones asíncronas de exportación para mantener el bundle inicial en **0 KB extra**.
2. **Estructura Normalizada en `entityTemplates.ts` (`NormalizedExportDocument`):**
   - Define una interfaz común que todas las herramientas producen antes de pasar al generador de PDF/Excel/CSV:
     ```ts
     export interface ExportKeyValue {
       label: string;
       value: string;
       highlight?: 'positive' | 'negative' | 'warning' | 'neutral';
     }

     export interface ExportTableSpec {
       sheetName: string; // Máx 31 chars para Excel
       title: string;
       headers: string[];
       rows: (string | number)[][];
       truncatedNote?: string; // Nota si superó 2,000 filas (PDF) o 10,000 (Excel/CSV)
     }

     export interface NormalizedExportDocument {
       filenameBase: string;
       title: string;
       subtitle: string;
       currency: MainCurrencyPreference;
       integrityWarning?: string; // Banner si is_asymmetric === true en comparaciones
       headerCards: ExportKeyValue[]; // Ficha de Estado de Cuenta / KPIs superiores
       tables: ExportTableSpec[]; // 1 o más tablas (en Excel cada una es una pestaña)
       svgElements?: SVGSVGElement[]; // Referencias a los gráficos SVG activos para incrustar en PDF
     }
     ```
   - Implementar constructores especializados en `entityTemplates.ts`:
     - **`buildSummaryDocument`**: Ficha con Ingresos, Gastos, Balance, Promedio Diario (`$/día`) en `config.currency` + Tabla 1 (Desglose por Categorías con `%`) + Tabla 2 (Movimientos del rango combinando `Expense` e `Income`, incluyendo columnas `Monto Original`, `Moneda Original` y `Tasa` si `config.includeOriginalCurrency === true`).
     - **`buildComparisonDocument`**: Si `days_A !== days_B`, rellena `integrityWarning`. Ficha con `Ingresos A vs B (Δ%)`, `Gastos A vs B (Δ% Total y Δ% Promedio/día)`, `Balance A vs B` + Tabla 1 (Comparativa por Categorías: Categoría, Monto A, Monto B, Diferencia, `Δ%`) + Tabla 2 (Movimientos Periodo A) + Tabla 3 (Movimientos Periodo B).
     - **`buildDebtsDocument`**:
       - Si `selectedDebtId !== 'all'` (**Deuda Individual X**): Ficha de Estado de Cuenta (*Contraparte/Nombre, Tipo: Por Pagar/Por Cobrar, Monto Inicial, Total Abonado, Saldo Pendiente, % Pagado, Estado*) + Tabla de Historial de Abonos/Aumentos (`debt.payments`, ordenados por fecha con nota, tipo de transacción, monto en `config.currency` y monto/tasa original).
       - Si `selectedDebtId === 'all'` (**Todas las Deudas**): Ficha con *Total Por Pagar Pendiente, Total Por Cobrar Pendiente, Cantidad de Deudas Activas/Saldadas* + Tabla 1 (Cartera de Deudas) + Tabla 2 (Todos los Abonos).
     - **`buildSavingsDocument`**:
       - Si `selectedSavingId !== 'all'` (**Meta de Ahorro Individual Y**): Ficha (*Meta, Monto Objetivo, Total Depositado, Total Retirado, Saldo Ahorrado Actual, % Progreso, Fecha Objetivo*) + Tabla de Aportes y Retiros (`goal.deposits`).
       - Si `selectedSavingId === 'all'` (**Todas las Metas**): Ficha global + Tabla 1 (Resumen de Metas) + Tabla 2 (Historial de Aportes/Retiros).
     - **`buildBudgetDocument`**:
       - Si `selectedBudgetId === 'all'` (**Plan Maestro + Todos los Subpresupuestos del mes `YYYY-MM`**):
         1. **Ficha Superior:** Mes (`YYYY-MM`), Techo del Plan Maestro (`primaryBudget`), Total Gastado en el mes, Saldo Disponible/Excedido, `% Ejecución` y Gasto Fuera de Presupuesto (`unbudgeted`).
         2. **Tabla 1 (`Subpresupuestos`):** Lista de todos los subpresupuestos del mes (propios en `budgets` donde `!is_primary` y compartidos en `shared_with_me_budgets`) con: `Nombre del Subpresupuesto`, `Tipo (Propio / Compartido)`, `Categorías incluidas`, `Techo del Grupo`, `Gastado`, `Disponible` y `% Consumido`.
         3. **Tabla 2 (`Límites por Categoría`):** Cada categoría (`BudgetCategorySummaryOut`) con: `Categoría`, `Subpresupuesto`, `Límite Asignado`, `Gastado`, `Restante / Exceso`, `% Usado` y `Estado Semáforo (En rango / Alerta / Excedido)` + fila final de `Gastos Sin Presupuestar (unbudgeted)` si aplica.
         4. **Tabla 3 (`Gastos del Mes`, si `includeTransactions === true`):** Todos los gastos (`Expense`) de ese mes indicando a qué categoría y subpresupuesto se imputaron.
       - Si `selectedBudgetId !== 'all'` (**Un Subpresupuesto específico `SingleBudgetOut`**):
         1. **Ficha Superior del Subpresupuesto:** Nombre del Subpresupuesto, Mes (`YYYY-MM`), Indicador si es compartido con un Pana, Techo Total del Subpresupuesto, Total Gastado en sus categorías, Saldo Disponible y `% Consumido`.
         2. **Tabla 1 (`Categorías del Subpresupuesto`):** Solo las categorías que pertenecen a `selectedBudget.category_limits` con su `Límite`, `Gastado`, `Disponible`, `% Usado` y `Semáforo`.
         3. **Tabla 2 (`Gastos del Subpresupuesto`, si `includeTransactions === true`):** Únicamente los gastos (`Expense`) del mes cuya categoría pertenece a ese subpresupuesto.
     - **`buildFixedAndIncomeDocument`**: Ficha del mes `YYYY-MM` (*Gastos Fijos Comprometidos vs. Pagados, Ingresos Estimados vs. Cobrados*) + Tabla 1 (Checklist de Gastos Fijos del mes indicando `Pagado` / `Pendiente` y fecha) + Tabla 2 (Checklist de Ingresos del mes).
3. **Límites de Filas y Compartir Nativo (`spreadsheetExporter.ts` y `pdfExporter.ts`):**
   - En `pdfExporter.ts`: aplicar límite máximo de **2,000 filas** por tabla de movimientos; renderizar cabecera con color de marca, `integrityWarning` (si existe), cuadrícula de `headerCards`, imágenes PNG en alta resolución obtenidas de `svgElements` (mediante `XMLSerializer` -> `Image` -> `canvas.toDataURL('image/png')` si `config.includeCharts` está activo) y `autoTable` para cada tabla de `tables`.
   - En `spreadsheetExporter.ts`:
     - **Excel (`.xlsx`):** Aplicar límite de **10,000 filas**. Crear una primera hoja `"Resumen"` con `headerCards` y cada elemento de `tables` en su propia pestaña (`XLSX.utils.book_append_sheet`).
     - **CSV (`.csv`):** Aplicar límite de **10,000 filas**. Prepend `\uFEFF` (UTF-8 BOM), escribir las líneas de `headerCards` arriba, una línea en blanco, y luego las tablas en formato CSV escapado.
   - Ambos exportadores devuelven un `{ blob: Blob, filename: string, mimeType: string }` y exponen tres utilidades:
     1. `triggerDownload(blob, filename)`
     2. `triggerNativeShare(blob, filename)` (usando `navigator.share({ files: [new File([blob], filename, { type: blob.type })] })` cuando esté disponible)
     3. `blobToBase64(blob): Promise<string>` (convierte el `Blob` generado a Base64 sin el prefijo `data:...;base64,` para enviarlo a `sendReportEmail`).

---

### Workstream D: Vista Principal (`ReportsHub.tsx`) e Integración en `ToolsHub` y `App.tsx`

#### Archivos a tocar/crear (4 archivos):
1. `frontend/src/components/reports/ReportsHub.tsx` *(Crear — vista principal con las 2 pestañas: Resumen/Comparador y Configurador de Exportación)*
2. `frontend/src/utils/toolColors.ts` *(Modificar — añadir color `reports` en línea 29)*
3. `frontend/src/components/ToolsHub.tsx` *(Modificar — añadir sección `Análisis y Reportes` con enlace a `/herramientas/resumenes` en línea 95)*
4. `frontend/src/App.tsx` *(Modificar — registrar `<Route path="/herramientas/resumenes" element={<ReportsHub />} />` en línea 165)*

#### Especificación exacta para Workstream D:

1. **En `frontend/src/utils/toolColors.ts`:**
   - Añadir token `reports: { solid: 'var(--tool-reports, #06B6D4)', bg: 'var(--tool-reports-bg, rgba(6, 182, 212, 0.1))' }`.
2. **En `frontend/src/components/ToolsHub.tsx`:**
   - Importar `BarChart3` de `lucide-react`.
   - Añadir en `toolSections` la sección `"Análisis y Reportes"` con la tarjeta para `/herramientas/resumenes`.
3. **En `frontend/src/App.tsx`:**
   - Importar `ReportsHub` y añadir `<Route path="/herramientas/resumenes" element={<ReportsHub />} />` dentro de las rutas de `/herramientas/*`.
4. **En `frontend/src/components/reports/ReportsHub.tsx`:**
   - Usar `PageHeader` con `onBack={() => navigate('/herramientas')}`, `title="Resúmenes y Exportación"`, y en `controls` el selector de las **2 pestañas** (`"Resumen y Comparador"` | `"Exportar Archivos"`) + el selector rápido de **Moneda del Reporte** (`USD` | `BS` | `EUR` | `USDT`, inicializado con `useCurrencyPreference().mainCurrency`).
   - En la **Pestaña 1 (`Resumen y Comparador`)**:
     - Conmutador `Resumen de Periodo` vs. `Comparar Periodos (A vs. B)`.
     - En modo Comparar: Píldoras de atajos simétricos (*Este mes vs. Mes pasado*, *Este mes vs. Año pasado*, *Esta semana vs. Semana pasada*, *Este año vs. Año pasado*) + selectores de fecha `Desde / Hasta` para Periodo A y Periodo B.
     - Banner de Integridad si `data.is_asymmetric === true`.
     - Tarjetas comparativas mostrando Total y Promedio Diario (`$/día`) con badges `Δ% Total` y `Δ% / día`.
     - Renderizado de `CategoryDonutChart`, `CashflowTrendChart` y (si está en modo comparación) `PeriodComparisonBarChart`.
     - Botón *"Exportar este reporte"* que pasa a la Pestaña 2 con la configuración lista.
   - En la **Pestaña 2 (`Exportar Archivos`)**:
     - El formulario interactivo paso a paso (Origen -> Ítem/Fechas/Moneda -> Switches de qué incluir -> Tarjetas de formato `PDF`, `Excel .xlsx`, `CSV`).
     - **Acciones finales de entrega:**
       - Botón **Descargar Archivo** (`Download` icon).
       - Botón **Compartir** (`Share2` icon, cuando `navigator.canShare` esté disponible).
       - Bloque **Enviar por Correo** (`Mail` icon): Incluye input de email pre-rellenado automáticamente con `useAuth().user?.email` (editable por si desea enviarlo a otra dirección) y botón *"Enviar reporte al correo"*, que genera el archivo en el formato elegido (`.pdf`, `.xlsx` o `.csv`), lo convierte con `blobToBase64` y llama a `sendReportEmail(...)`, mostrando confirmación visual (`Toast` / banner de éxito).
