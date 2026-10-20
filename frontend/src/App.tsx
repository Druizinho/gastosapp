import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CategoriesProvider } from './context/CategoriesContext';
import { NotificationProvider } from './context/NotificationContext';
import { Auth, ResetPassword } from './components/Auth';
import Dashboard from './components/Dashboard';
import { ToolsHub } from './components/ToolsHub';
import FixedExpenses from './components/FixedExpenses';
import DebtList from './components/DebtList';
import EstimatedIncomeList from './components/EstimatedIncomeList.tsx';
import SavingGoals from './components/SavingGoals';
import Budgets from './components/Budgets';
import { RatesPage } from './components/RatesPage';
import { SettingsPage } from './components/SettingsPage';
import { PanasPage } from './pages/PanasPage';
import { BottomNav } from './components/BottomNav';
import { InstallPWA } from './components/InstallPWA';
import './index.css';

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
        <Outlet />
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
            <Route path="/herramientas/deudas-nuestras" element={<DebtList type="owed" onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/deudas-por-cobrar" element={<DebtList type="receivable" onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/ingresos-estimados" element={<EstimatedIncomeList onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/ahorros" element={<SavingGoals onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/presupuestos" element={<Budgets onBack={() => navigate(-1)} />} />
            <Route path="/herramientas/panas" element={<PanasPage />} />
            <Route path="/herramientas/conexiones" element={<Navigate to="/herramientas/panas" replace />} />
            <Route path="/conexiones" element={<Navigate to="/herramientas/panas" replace />} />
            <Route path="/panas" element={<Navigate to="/herramientas/panas" replace />} />
            <Route path="/presupuestos" element={<Navigate to="/herramientas/presupuestos" replace />} />
            <Route path="/deudas" element={<Navigate to="/herramientas/deudas-nuestras" replace />} />
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
          <Router>
            <AppRoutes />
            <InstallPWA />
          </Router>
        </NotificationProvider>
      </CategoriesProvider>
    </AuthProvider>
  );
}

export default App;
