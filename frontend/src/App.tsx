import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auth } from './components/Auth';
import Dashboard from './components/Dashboard';
import { PeriodComparison } from './components/PeriodComparison';
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

  return (
    <Routes>
      <Route 
        path="/login" 
        element={session ? <Navigate to="/" replace /> : <Auth />} 
      />
      
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/comparar" element={<PeriodComparison />} />
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
