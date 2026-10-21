# 📝 Checklist de Implementación Quirúrgica — GastosApp

Este checklist rastrea el progreso de las reparaciones paso a paso. Cada tarea debe completarse y verificarse antes de pasar a la siguiente.

---

## 🔒 Fase 1: Capa de Datos, RLS y Seguridad Base
- [x] **Tarea 1.1:** Crear script SQL `migrations/rls_v2_savings_budgets_shares.sql` con activación de RLS y políticas seguras para `saving_goals`, `saving_deposits`, `monthly_budgets`, `budget_category_limits`, `shares`, `share_members`.
- [x] **Tarea 1.2:** Limpieza de Git y secretos: añadir `*.pem`, `*.key`, `*.db`, `*.sqlite*` a `.gitignore`, desindexar `backend/private_key.pem`, `backend/public_key.pem` y `backend/gastos.db` de Git.

---

## 🧮 Fase 2: Backend y Motor Financiero
- [x] **Tarea 2.1:** Configurar lista blanca estricta de CORS en `backend/app/main.py` leída desde `ALLOWED_ORIGINS`.
- [x] **Tarea 2.2:** Endurecer verificación de JWT en `backend/app/auth.py` (algoritmos asimétricos ES256/RS256, validación de `aud` e `iss`, y TTL de 1 hora en caché de JWKS).
- [x] **Tarea 2.3:** Crear módulo centralizado de tiempo `backend/app/time_utils.py` con `America/Caracas` y reemplazar `date.today()` en resúmenes mensuales.
- [x] **Tarea 2.4:** Corregir atomicidad de autogasto en `backend/app/routers/fixed_expenses.py` y `crud_fixed_expenses.py` (evitar commits prematuros y gastos huérfanos).
- [x] **Tarea 2.5:** Corregir cálculo de `USD_CASH`, bloqueo síncrono del event loop y envenenamiento de caché en `backend/app/bcv_service.py`.
- [x] **Tarea 2.6:** Blindar convertidor de monedas en `backend/app/crud_budgets.py` contra fallbacks 1:1 cuando la tasa es 0 o None.

---

## 🤝 Fase 3: Sincronización "Panas" y Concurrencia
- [x] **Tarea 3.1:** Implementar inversión simétrica de deudas clonadas (`type="owed"` <-> `"receivable"`, contraparte con nombre del creador) en `backend/app/sharing.py`.
- [x] **Tarea 3.2:** Excluir `type` y `counterpart` de `sync_parent_fields` para no sobreescribir la inversión simétrica.
- [x] **Tarea 3.3:** Implementar política de disolución al romper amistad (*Dissolve on Disconnect*) en `backend/app/crud_connections.py:delete_connection`.
- [x] **Tarea 3.4:** Ordenamiento determinístico por UUID en `fan_out_child_create` para prevenir deadlocks ABBA.
- [x] **Tarea 3.5:** Purgar gastos vinculados antes de eliminar deudas clonadas en lote (`crud_debts.py`).

---

## 📱 Fase 4: Frontend, PWA y Rendimiento
- [x] **Tarea 4.1:** Implementar interceptor de respuesta en `frontend/src/api.ts` para capturar errores 401, encolar peticiones y refrescar sesión con Supabase automáticamente.
- [x] **Tarea 4.2:** Implementar `React.lazy()` y `<Suspense>` para todas las rutas secundarias en `frontend/src/App.tsx`.
- [x] **Tarea 4.3:** Configurar `manualChunks` en `frontend/vite.config.ts` para separar vendors (`vendor-react`, `vendor-supabase`, `vendor-firebase`, `vendor-ui`) y restablecer límite de advertencia.
- [x] **Tarea 4.4:** Optimizar `frontend/src/components/ExpenseList.tsx` con `categoryMap` O(1) vía `useMemo`, envolver `ExpenseItem` en `React.memo` y memoizar callbacks en `Dashboard.tsx`.
- [x] **Tarea 4.5:** Añadir sondeo real de `/health` en `frontend/src/components/WakeUpLoader.tsx` y vista de reintento ante cold-start fallido en `Dashboard.tsx`.

---

## ⏰ Fase 5: Notificaciones, Cron y Automatizaciones
- [x] **Tarea 5.1:** Alinear horarios del Cron en `frontend/vercel.json` a las 9:00 AM (`0 13 * * *`) y 8:00 PM (`0 0 * * *`) de Venezuela.
- [x] **Tarea 5.2:** Corregir contrato en `frontend/api/cron/notifications.ts` para llamar al endpoint real del backend con cabecera de autenticación segura.
- [x] **Tarea 5.3:** Eliminar `await asyncio.sleep(2)` en `backend/app/routers/push.py` y delegar `messaging.send` a threadpool para evitar timeouts serverless.
- [x] **Tarea 5.4:** Añadir verificación de deduplicación diaria contra `models.Notification` antes de despachar pushes en las ventanas matutina y nocturna.

---

## 🧪 Fase 6: Verificación Final del Sistema
- [x] **Tarea 6.1:** Ejecutar `npm run build` en el frontend y verificar reducción drástica del bundle inicial.
- [x] **Tarea 6.2:** Correr pruebas de sintaxis, imports y modelos del backend.
- [x] **Tarea 6.3:** Validar que `git status` esté limpio y sin secretos commiteados.
