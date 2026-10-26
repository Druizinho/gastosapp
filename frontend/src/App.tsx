import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CategoriesProvider } from './context/CategoriesContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './components/ui/Toast';
import { Auth, ResetPassword } from './components/Auth';
import Dashboard from './components/Dashboard';
import { BottomNav } from './components/BottomNav';
import { InstallPWA } from './components/InstallPWA';
import { RouteErrorBoundary } from './components/ErrorBoundary';
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
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>Cargando...</div>;
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

const AppLayout = () => {
  return (
    <div className="app-container">
      <main className="main-content">
        <RouteErrorBoundary>
          <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#9CA3AF' }}>Cargando...</div>}>
            <Outlet />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      <BottomNav />
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
            <Route path="/herramientas/ingresos-estimados" element={<EstimatedIncomeList onBack={() => navigate(-1)} />} />
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
            <Route path="/ingresos-estimados" element={<Navigate to="/herramientas/ingresos-estimados" replace />} />
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
