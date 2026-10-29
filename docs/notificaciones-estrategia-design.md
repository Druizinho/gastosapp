# Estrategia y Arquitectura de Notificaciones — GastosApp

Este documento define la estrategia integral de notificaciones móviles y web (PWA) para **GastosApp**, estableciendo qué eventos notifican, por qué canal (**Push** del sistema vs. **Bandeja** interna), cómo se agrupan los recordatorios programados frente a las alertas interactivas en tiempo real, el horario de silencio, el flujo contextual de permisos y el comportamiento de navegación (deep-linking) y resolución en la Bandeja. El diseño sigue las mejores prácticas de Apple (HIG), Android (Material Notification Channels) y web.dev para maximizar la utilidad percibida, evitar la fatiga de alertas y proteger el permiso del navegador.

---

## Terms

- **Push**: Notificación del sistema operativo (vía WebPush / FCM) que interrumpe al usuario aunque no tenga la app abierta.
  - *Avoid*: "alerta", "notificación" (a secas, sin especificar canal).
- **Bandeja**: Centro de notificaciones dentro de la app (el icono de la campana con contador de pendientes), que el usuario consulta cuando quiere y sirve como lista accionable de pendientes.
  - *Avoid*: "inbox", "historial".
- **Resumen**: Un único Push programado en una ventana horaria (9:00 AM o 7:00 PM) que agrupa varios recordatorios del mismo día en lugar de enviar un Push suelto por cada pago o ingreso.
  - *Avoid*: "digest", "batch".
- **Evento social**: Acción realizada por un Pana en un recurso compartido o conexión que afecta al usuario (solicitud de conexión, deuda compartida creada/eliminada, abono registrado/eliminado, check de gasto fijo compartido, aporte a meta).
  - *Avoid*: "actividad compartida".

---

## Why

> "Actualmente, las notificaciones de la app no funcionan correctamente; voy a cambiarlas por completo y arreglar los problemas que presentan, pero aprovechando que haré este cambio quiero decidir qué cosas deberían enviar notificaciones y para qué, usando las mejores prácticas posibles del diseño de apps móviles."

---

## Locked decisions

### 1. Criterio de canal: Push vs. solo Bandeja (`q1`)
- **Decisión (Opción A — Niveles por valor y urgencia)**:
  - **Push + Bandeja**: Solo si el evento es **oportuno + accionable + personal** (vence un pago o ingreso, un Pana realiza una acción que requiere tu atención o modifica una deuda compartida contigo, o superas un umbral crítico de presupuesto).
  - **Solo Bandeja**: Todo evento meramente informativo o de celebración pasiva (solicitud de conexión aceptada, creación o check de gasto fijo compartido por un Pana, creación/aporte/completado de meta de ahorro compartida, deuda compartida saldada al 100%, o umbral del 80% en una categoría individual de presupuesto).
- **Opciones rechazadas**:
  - *Opción B (Todo Push + Bandeja como antes, con interruptores)*: Con varios gastos fijos y Panas activos, un usuario puede recibir 5–8 push diarios. Desgasta el canal, entrena al usuario a ignorar los avisos importantes y traslada al usuario la carga de entrar a Ajustes para apagar el ruido.
  - *Opción C (Push mínimo: solo vencimientos de pagos)*: Deja las solicitudes de conexión de Panas, las deudas compartidas nuevas y los excesos de presupuesto del 100% sin aviso oportuno, rompiendo la experiencia colaborativa y el control financiero en tiempo real.

### 2. Agrupación de recordatorios vs. tiempo real (`q2` + `q18`)
- **Decisión (Opción A en `q2` + Regla de tiempo real en `q18`)**:
  - **Recordatorios programados agrupados en Resumen**: Como máximo **1 Push de Resumen en la mañana (9:00 AM)** y **1 Push de Resumen en la noche (7:00 PM)**, y **solo si existe algún pendiente real que avisar ese día** (si no hay eventos, no se envía nada). Si coinciden varios gastos fijos, deudas o ingresos el mismo día, se consolidan en ese único Push del Resumen (p. ej. *"Hoy vencen 3 pagos: Netflix, Alquiler y deuda con Juan"*), mientras que en la Bandeja cada ítem se crea como una entrada individual.
  - **Eventos interactivos y de límites en tiempo real sin espera ni tope artificial**: Las alertas de presupuesto (80%/100%) y los eventos sociales de Panas que califican para Push (solicitud de conexión, deuda compartida creada/eliminada, abono registrado/eliminado) se envían **inmediatamente en tiempo real** sin esperar a agruparse y sin tope diario (respetando únicamente el horario de silencio nocturno de 10:00 PM a 8:00 AM).
- **Opciones rechazadas**:
  - *Un Push suelto por cada recordatorio de vencimiento (`q2` Opción B)*: Dispara una ráfaga de notificaciones simultáneas a la hora del cron que el usuario descarta en bloque.
  - *Solo un Resumen diario único sin tiempo real (`q2` Opción C)*: Pierde la inmediatez en solicitudes de amistad/conexión y en alertas de presupuesto justo cuando el usuario está gastando.
  - *Tope duro de 3 push en tiempo real o cola de espera de 10 min (`q18` Opciones A y B)*: Retrasar o silenciar eventos interactivos como una solicitud de conexión o un abono en tiempo real degrada la experiencia colaborativa entre Panas.

### 3. Momento para solicitar el permiso del navegador (`q13`)
- **Decisión (Opción A — Pre-permiso contextual dentro de la app)**:
  - No lanzar el diálogo nativo del navegador en frío. Mostrar primero una tarjeta propia de la app en el momento en que el valor es evidente: al crear el primer gasto fijo, deuda o ingreso esperado (*"¿Te avisamos cuando toque este pago?"*) o al enviar/recibir la primera conexión de un Pana.
  - Solo cuando el usuario acepta en la tarjeta de la app se invoca `Notification.requestPermission()`. Si pulsa *"Ahora no"*, se conserva la posibilidad de preguntar más adelante sin quemar el bloqueo permanente del navegador. En iOS, si no está instalada en pantalla de inicio (PWA), mostrar guía breve de instalación.
- **Opciones rechazadas**:
  - *Opción B (Pedir en el onboarding inicial)*: Pide un permiso sensible antes de que el usuario haya cargado datos o entendido el valor de la app.
  - *Opción C (Solo manualmente en Ajustes)*: La gran mayoría de usuarios nunca entra a Ajustes para activarlo por su cuenta.

---

## Routine choices

- **Control en Ajustes (`q3` → Opción B)**: Agrupar las preferencias en **5–6 categorías por propósito** con un interruptor simple de encendido/apagado por categoría:
  1. *Pagos y vencimientos* (gastos fijos y deudas)
  2. *Ingresos esperados*
  3. *Presupuesto y límites*
  4. *Panas y actividad compartida*
  5. *Hábitos y recordatorios de registro* (inactividad)
  6. *(Futuro) Resúmenes y reportes*
- **Cadencia en gastos fijos y deudas (`q4` → Opción C)**: Hasta **3 avisos por vencimiento** incluidos en los Resúmenes correspondientes:
  1. **Día anterior (7:00 PM)**: Aviso previo (*"Mañana vence..."*).
  2. **Día del vencimiento (9:00 AM)**: Aviso de acción (*"Hoy vence..."*).
  3. **Día posterior (9:00 AM)**: Aviso de vencido (*"Ayer venció..."*), después del cual no se vuelve a insistir por Push.
  - **Regla crítica de cancelación**: En cuanto el gasto fijo o la deuda se marca como pagada/saldada, se cancelan todos los avisos posteriores de ese ciclo.
- **Cadencia en ingresos esperados (`q5` → Opción B)**: Misma regla simétrica de **3 avisos** que los gastos fijos (noche anterior 7:00 PM, mañana del día esperado 9:00 AM y mañana del día siguiente 9:00 AM si sigue sin confirmarse, más recordatorio de saldo pendiente en ingresos parciales), cancelándose inmediatamente al confirmar o registrar el ingreso.
- **Recordatorio de inactividad (`q6` → Opción A)**: Mantener el recordatorio cuando el usuario lleva días sin registrar gastos, pero **con freno automático**:
  - Primer aviso a los **3 días** de inactividad (en la ventana de las 7:00 PM).
  - Si sigue sin registrar, un segundo y último aviso a los **7 días**.
  - Si tampoco registra tras el día 7, **se detienen los Push de inactividad** hasta que el usuario vuelva a registrar un movimiento.
- **Umbrales de presupuesto (`q7` → Opción A)**:
  - **Presupuesto mensual global**: Push + Bandeja en tiempo real al alcanzar el **80%** y al alcanzar/superar el **100%** (una vez por umbral por mes).
  - **Límites por categoría**: Push + Bandeja en tiempo real **solo al alcanzar el 100%**; el aviso preventivo del **80% de una categoría individual** va **solo a la Bandeja** sin interrumpir con Push.
- **Eventos sociales de Panas con Push (`q8` → Opciones A, B y C)**:
  - Envían **Push + Bandeja en tiempo real**:
    - **A**: Solicitud de conexión recibida de un Pana.
    - **B**: Un Pana creó una deuda compartida que te incluye.
    - **C**: Un Pana registró un abono/pago en una deuda compartida contigo (tanto en deudas *"yo debo"* como *"me deben"*).
  - Van **solo a la Bandeja** (sin Push): solicitud de conexión aceptada, deuda compartida saldada al 100% (Nota: si se salda mediante un abono final, ese evento unificado sí puede notificar el abono final que salda la deuda), gasto fijo compartido creado o marcado como pagado por un Pana, y meta de ahorro compartida creada, con nuevo aporte o completada al 100%.
- **Eliminación de elementos compartidos por un Pana (`q10` → Opción A)**: Cuando un Pana elimina una deuda compartida o elimina un abono en una deuda compartida contigo, se envía **Push + Bandeja en tiempo real** (respetando el horario de silencio), ya que altera tus saldos sin intervención tuya.
- **Ventanas horarias y horario de silencio (`q9` + `q11`)**:
  - **Fin del silencio nocturno**: **8:00 AM** (hora local del usuario).
  - **Resumen de la mañana**: **9:00 AM**.
  - **Resumen de la noche**: **7:00 PM (19:00)**.
  - **Horario de silencio**: De **10:00 PM (22:00) a 8:00 AM**. Durante ese rango no se envía ningún Push; cualquier evento que ocurra en esas horas se guarda inmediatamente en la Bandeja y, si requiere Push, se entrega al terminar el silencio / junto al Resumen de la mañana.
- **Resúmenes semanales o mensuales de gastos (`q12`)**: **Descartados por ahora** porque la herramienta de reportes/resúmenes aún no está desarrollada; se incorporarán en el futuro cuando exista dicha funcionalidad.
- **Navegación al tocar una notificación (`q14`)**:
  - Si es una **notificación individual** (p. ej. alerta de presupuesto, solicitud de Pana, deuda compartida o un Resumen que casualmente solo tenía 1 ítem): lleva **directamente a la herramienta/elemento específico** (el gasto fijo, la deuda, el ingreso, el presupuesto o la pantalla de Panas).
  - Si es un **Resumen con varios elementos**: al tocar el Push se abre la **Bandeja de entrada (campana)**, donde aparece desglosada cada notificación individual; al tocar cualquiera de ellas dentro de la Bandeja, navega a la herramienta específica correspondiente.
- **Vencimientos de elementos compartidos (`q15` → Opción A)**: En gastos fijos o deudas compartidas con fecha de vencimiento, el recordatorio se incluye en el Resumen de **todos los miembros**, pero **en cuanto cualquiera de los miembros lo marca como pagado, se cancelan los avisos posteriores para todos** y se marca como resuelto.
- **Comportamiento de la Bandeja (`q16` → Opción A)**:
  - Guarda **una entrada por cada elemento individual** (nunca un bloque genérico sin desglosar), agrupadas visualmente por día (*"Hoy"*, *"Ayer"*, *"Esta semana"*).
  - Cuando el usuario resuelve la acción subyacente (marca el gasto fijo como pagado, confirma el ingreso, abona/salda la deuda, acepta/rechaza la solicitud de conexión), la entrada en la Bandeja **se marca automáticamente como resuelta** (con check o estilo atenuado) y **deja de sumar en el contador numérico de la campana**, sin desaparecer para conservar trazabilidad.
  - Retención automática limpia de **30 días**.
- **Tono y formato del texto (`q17` → Opción A)**:
  - Estilo **directo, claro y con datos concretos**: el título indica la acción o estado (*"Vence hoy: Alquiler"*, *"Presupuesto al 100%: Comida"*, *"Nuevo abono de Juan"*) y el cuerpo incluye el monto, moneda y contraparte para que el usuario entienda todo desde la pantalla bloqueada en 1–2 segundos.
  - **Sin emojis** en los Push de recordatorios o alertas repetitivas; reservar emojis únicamente para celebraciones dentro de la app.

---

## Matriz maestra de eventos de notificación

| Categoría (Ajustes) | Evento | Canal | Momento de envío | Condición de cancelación / resolución en Bandeja | Destino al tocar (Deep Link) |
|---|---|---|---|---|---|
| **Pagos y vencimientos** | Gasto fijo vence mañana | Push (en Resumen) + Bandeja | 7:00 PM (día -1) | Se marca como pagado (por ti o por un Pana si es compartido) | Herramienta de Gastos Fijos (o Bandeja si el Resumen agrupa varios) |
| **Pagos y vencimientos** | Gasto fijo vence hoy | Push (en Resumen) + Bandeja | 9:00 AM (día 0) | Se marca como pagado | Herramienta de Gastos Fijos |
| **Pagos y vencimientos** | Gasto fijo venció ayer (impago) | Push (en Resumen) + Bandeja | 9:00 AM (día +1, último aviso Push) | Se marca como pagado | Herramienta de Gastos Fijos |
| **Pagos y vencimientos** | Deuda vence mañana / hoy / venció ayer | Push (en Resumen) + Bandeja | 7:00 PM (día -1), 9:00 AM (día 0 y +1) | La deuda se salda o se registra el pago correspondiente | Herramienta de Deudas |
| **Ingresos esperados** | Ingreso estimado para mañana / hoy / ayer sin confirmar | Push (en Resumen) + Bandeja | 7:00 PM (día -1), 9:00 AM (día 0 y +1) | Se confirma o registra el ingreso | Herramienta de Ingresos |
| **Ingresos esperados** | Saldo pendiente de ingreso parcial hoy | Push (en Resumen) + Bandeja | 9:00 AM (día esperado) | Se completa o confirma el ingreso parcial | Herramienta de Ingresos |
| **Presupuesto y límites** | Presupuesto mensual global al 80% | Push + Bandeja | Tiempo real (1 vez/mes) | Lectura / fin de ciclo mensual | Herramienta de Presupuesto |
| **Presupuesto y límites** | Presupuesto mensual global al 100% | Push + Bandeja | Tiempo real (1 vez/mes) | Lectura / ajuste de presupuesto | Herramienta de Presupuesto |
| **Presupuesto y límites** | Categoría de presupuesto al 80% | **Solo Bandeja** | Tiempo real (1 vez/mes/cat) | Lectura / fin de ciclo mensual | Herramienta de Presupuesto (categoría) |
| **Presupuesto y límites** | Categoría de presupuesto al 100% | Push + Bandeja | Tiempo real (1 vez/mes/cat) | Lectura / ajuste de límite | Herramienta de Presupuesto (categoría) |
| **Panas y compartidos** | Solicitud de conexión recibida | Push + Bandeja | Tiempo real | Aceptar o rechazar la solicitud | Página de Panas (solicitudes) |
| **Panas y compartidos** | Solicitud de conexión aceptada | **Solo Bandeja** | Tiempo real | Lectura | Página de Panas |
| **Panas y compartidos** | Pana creó deuda compartida contigo | Push + Bandeja | Tiempo real | Lectura / saldar deuda | Herramienta de Deudas |
| **Panas y compartidos** | Pana registró abono en deuda compartida | Push + Bandeja | Tiempo real | Lectura | Detalle de la Deuda compartida |
| **Panas y compartidos** | Pana eliminó deuda compartida o abono | Push + Bandeja | Tiempo real | Lectura | Herramienta de Deudas |
| **Panas y compartidos** | Deuda compartida saldada (sin abono nuevo) | **Solo Bandeja** | Tiempo real | Lectura | Herramienta de Deudas |
| **Panas y compartidos** | Pana creó o pagó gasto fijo compartido | **Solo Bandeja** (y cancela recordatorios pendientes) | Tiempo real | Lectura | Herramienta de Gastos Fijos |
| **Panas y compartidos** | Pana creó, aportó o completó meta compartida | **Solo Bandeja** | Tiempo real | Lectura | Herramienta de Metas / Ahorros |
| **Hábitos y registro** | Inactividad de registro de gastos | Push (en Resumen nocturno) + Bandeja | 7:00 PM al cumplir **3 días** y **7 días** sin gastos (luego se detiene) | Registrar cualquier gasto nuevo | Registro de Gastos / Inicio |

---

## Verified facts

Hechos verificados directamente en el repositorio actual durante la sesión:
- **Infraestructura de Crons (`frontend/vercel.json:8-17` y `backend/app/routers/push.py:102-336`)**: Actualmente existen 2 crons diarios en Vercel (`0 13 * * *` = 9:00 AM VET y `0 0 * * *` = 8:00 PM VET). Para implementar la ventana nocturna decidida en `q9` (7:00 PM VET), el segundo cron debe adelantarse una hora (`0 23 * * *` UTC).
- **Preferencias de usuario (`backend/app/models.py:9-20` y `frontend/src/components/NotificationSettings.tsx`)**: El modelo `Profile` solo tiene 4 flags booleanos (`notify_fixed_expenses`, `notify_debts`, `notify_incomes`, `notify_inactivity`). Falta agregar `notify_budgets` y `notify_panas` (o consolidar `notify_fixed_expenses` + `notify_debts` según las categorías de `q3`).
- **Modelo de Deudas (`backend/app/models.py:162-215` y `backend/app/crud_debts.py`)**: Las deudas se modelan con `type` (`'owed'` o `'receivable'`) y soportan compartición mediante `Share` y `ShareMember`. El código actual ya dispara avisos en creación, saldado, eliminación de deuda, creación de abono y eliminación de abono.
- **Presupuestos (`backend/app/models.py:419-465` y `backend/app/crud_budgets.py:2460-2550`)**: `MonthlyBudget` y `BudgetCategoryLimit` ya cuentan con banderas de deduplicación mensual (`notified_80`, `notified_100`, `notified_global_80`, `notified_global_100`).
- **Modelo de Notificaciones in-app (`backend/app/models.py:292-310`)**: La tabla `notifications` almacena hoy `user_id`, `title`, `body`, `type`, `is_read` y `created_at`. Para soportar `q14` y `q16` (navegación desde la Bandeja y marcado automático como resuelta al pagar/confirmar), necesitará persistir `url` (que hoy solo se pasa al payload de FCM en `push_service.py`), `entity_type`, `entity_id` y `is_resolved`.

---

## Risks

1. **Desincronización entre un Resumen Push y el estado en vivo al abrir la Bandeja**: Si el usuario recibe el Resumen a las 9:00 AM, paga un gasto fijo a las 10:00 AM desde el dashboard y abre la notificación a las 11:00 AM, la entrada en la Bandeja debe aparecer ya marcada como resuelta (`is_resolved = true`) gracias al vínculo `entity_type` + `entity_id`.
2. **Bloqueo del permiso en iOS / PWA no instalada**: En iOS, WebPush solo está disponible si el usuario añadió la PWA a la pantalla de inicio. La tarjeta de pre-permiso (`q13`) debe detectar `standalone` antes de ofrecer activar notificaciones en iOS.
3. **Eventos en tiempo real durante el horario de silencio (10:00 PM – 8:00 AM)**: Si un Pana registra un abono a las 11:30 PM, se guarda enseguida en la Bandeja pero su Push queda retenido. Si para las 8:00 AM / 9:00 AM el usuario ya abrió la app y vio la Bandeja, ese Push retenido debe descartarse para no enviar un aviso obsoleto.

---

## Deferred

- **Notificaciones de resúmenes semanales/mensuales de gastos (`q12`)**: Pospuestas hasta que se desarrolle la herramienta de reportes/resúmenes en la app. Cuando esa herramienta exista, se reactivará la categoría *Resúmenes* con un Push mensual el día 1 de cada mes.
- **Anticipación configurable por gasto fijo individual (`q4` Opción D)** y **ocultar montos en pantalla bloqueada (`q17`)**: Pospuestos para mantener simple la primera versión del rediseño; se reabrirán solo si los usuarios piden configurar días de preaviso distintos en pagos grandes o mayor privacidad en teléfonos compartidos.

---

## Open threads

Ninguno. Todas las dudas planteadas en los hilos de discusión (`q1`, `q4`, `q5`, `q8`, `q14` y `q18`) quedaron incorporadas en las decisiones finales.
