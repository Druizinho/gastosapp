import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auth } from './components/Auth';
import Dashboard from './components/Dashboard';
import { ToolsHub } from './components/ToolsHub';
import FixedExpenses from './components/FixedExpenses';
import DebtList from './components/DebtList';
import EstimatedIncomeList from './components/EstimatedIncomeList.tsx';
import { RatesPage } from './components/RatesPage';
import { SettingsPage } from './components/SettingsPage';
import { BottomNav } from './components/BottomNav';
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
  const { session } = useAuth();
  const navigate = useNavigate();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={session ? <Navigate to="/" replace /> : <Auth />} 
      />
      
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/herramientas" element={<ToolsHub />} />
          <Route path="/herramientas/gastos-fijos" element={<FixedExpenses />} />
          <Route path="/herramientas/deudas-nuestras" element={<DebtList type="owed" onBack={() => navigate(-1)} />} />
          <Route path="/herramientas/deudas-por-cobrar" element={<DebtList type="receivable" onBack={() => navigate(-1)} />} />
          <Route path="/herramientas/ingresos-estimados" element={<EstimatedIncomeList onBack={() => navigate(-1)} />} />
          <Route path="/tasas" element={<RatesPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
