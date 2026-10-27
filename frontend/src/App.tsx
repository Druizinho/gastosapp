import React, { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CategoriesProvider } from './context/CategoriesContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider, useToast } from './components/ui/Toast';
import { Auth, ResetPassword } from './components/Auth';
import Dashboard from './components/Dashboard';
import { BottomNav } from './components/BottomNav';
import ExpenseForm from './components/ExpenseForm';
import { createExpense, createIncome } from './api';
import type { ExpenseCreate, IncomeCreate } from './types';
import { InstallPWA } from './components/InstallPWA';
import { RouteErrorBoundary } from './components/ErrorBoundary';
import { SkeletonHeroCard, SkeletonList } from './components/ui/Skeleton';
import './index.css';

// Lazy loading de vistas y herramientas pesadas para optimizar el bundle inicial
const ToolsHub = lazy(() => import('./components/ToolsHub').then(m => ({ default: m.ToolsHub })));
const FixedExpenses = lazy(() => import('./components/FixedExpenses'));
const DebtList = lazy(() => import('./components/DebtList'));
const EstimatedIncomeList = lazy(() => import('./components/EstimatedIncomeList'));
const SavingGoals = lazy(() => import('./components/SavingGoals'));
const Budgets = lazy(() => import('./components/Budgets'));
const RatesPage = lazy(() => import('./components/RatesPage').then(m => ({ default: m.RatesPage })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PanasPage = lazy(() => import('./pages/PanasPage').then(m => ({ default: m.PanasPage })));

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { session, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '16px' }}>
        <SkeletonHeroCard />
        <SkeletonList count={4} />
      </div>
    );
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

const AppLayout = () => {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setIsQuickAddOpen(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('add');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const defaultMode = location.pathname.startsWith('/herramientas/ingresos') ? 'income' : 'expense';

  return (
    <div className="app-container">
      <main className="main-content">
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <div style={{ maxWidth: '800px', margin: '0 auto', padding: '16px' }}>
                <SkeletonHeroCard />
                <SkeletonList count={4} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <BottomNav onAddClick={() => setIsQuickAddOpen(true)} />

      {isQuickAddOpen && (
        <ExpenseForm
          defaultMode={defaultMode}
          onSubmit={async (data) => {
            await createExpense(data as ExpenseCreate);
            setIsQuickAddOpen(false);
            window.dispatchEvent(new CustomEvent('gastosapp:data-changed'));
            toast.success('Gasto registrado');
          }}
          onIncomeSubmit={async (data) => {
            await createIncome(data as IncomeCreate);
            setIsQuickAddOpen(false);
            window.dispatchEvent(new CustomEvent('gastosapp:data-changed'));
            toast.success(
              'Ingreso registrado',
              location.pathname.startsWith('/herramientas/ingresos')
                ? undefined
                : {
                    duration: 5000,
                    action: {
                      label: 'Ver ingresos',
                      onClick: () => navigate('/herramientas/ingresos'),
                    },
                  }
            );
          }}
          onCancel={() => setIsQuickAddOpen(false)}
          onCategoriesChanged={() => window.dispatchEvent(new CustomEvent('gastosapp:data-changed'))}
        />
      )}
    </div>
  );
};

const AppRoutes = () => {
  const { session, isRecovery } = useAuth();
  const navigate = useNavigate();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={session && !isRecovery ? <Navigate to="/" replace /> : <Auth />} 
      />
      
      <Route element={<ProtectedRoute />}>
        {isRecovery ? (
          <Route path="*" element={<ResetPassword />} />
        ) : (
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/herramientas" element={<ToolsHub />} />
            <Route path="/herramientas/gastos-fijos" element={<FixedExpenses />} />
            <Route path="/herramientas/deudas" element={<DebtList onBack={() => navigate('/herramientas')} />} />
            <Route path="/herramientas/deudas-nuestras" element={<Navigate to="/herramientas/deudas?tab=owed" replace />} />
            <Route path="/herramientas/deudas-por-cobrar" element={<Navigate to="/herramientas/deudas?tab=receivable" replace />} />
            <Route path="/herramientas/ingresos" element={<EstimatedIncomeList onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/ingresos-estimados" element={<Navigate to="/herramientas/ingresos" replace />} />
            <Route path="/herramientas/ahorros" element={<SavingGoals onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/presupuestos" element={<Budgets onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/panas" element={<PanasPage />} />
            <Route path="/herramientas/conexiones" element={<Navigate to="/herramientas/panas" replace />} />
            <Route path="/conexiones" element={<Navigate to="/herramientas/panas" replace />} />
            <Route path="/panas" element={<Navigate to="/herramientas/panas" replace />} />
            <Route path="/presupuestos" element={<Navigate to="/herramientas/presupuestos" replace />} />
            <Route path="/deudas" element={<Navigate to="/herramientas/deudas" replace />} />
            <Route path="/gastos-fijos" element={<Navigate to="/herramientas/gastos-fijos" replace />} />
            <Route path="/ahorros" element={<Navigate to="/herramientas/ahorros" replace />} />
            <Route path="/ingresos-estimados" element={<Navigate to="/herramientas/ingresos" replace />} />
            <Route path="/ingresos" element={<Navigate to="/herramientas/ingresos" replace />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/tasas" element={<RatesPage />} />
            <Route path="/ajustes" element={<SettingsPage />} />
          </Route>
        )}
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <CategoriesProvider>
        <NotificationProvider>
          <ToastProvider>
            <Router>
              <AppRoutes />
              <InstallPWA />
            </Router>
          </ToastProvider>
        </NotificationProvider>
      </CategoriesProvider>
    </AuthProvider>
  );
}

export default App;
