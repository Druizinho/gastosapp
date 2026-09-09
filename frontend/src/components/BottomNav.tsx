import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, Settings, PieChart, Home, Plus } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleAddClick = () => {
    // Navigate to dashboard with add param
    navigate('/?add=true');
  };

  return (
    <nav className="bottom-nav">
      <NavLink 
        to="/" 
        className={({ isActive }) => `nav-item ${isActive && location.search === '' ? 'active' : ''}`}
        end
        aria-label="Gastos"
      >
        <Home size={24} />
      </NavLink>
      
      <NavLink 
        to="/comparar" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        aria-label="Comparar"
      >
        <BarChart3 size={24} />
      </NavLink>

      <button 
        className="nav-fab" 
        onClick={handleAddClick}
        aria-label="Añadir Gasto"
      >
        <Plus size={24} />
      </button>

      <NavLink 
        to="/tasas" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        aria-label="Tasas"
      >
        <PieChart size={24} />
      </NavLink>
      
      <NavLink 
        to="/ajustes" 
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        aria-label="Ajustes"
      >
        <Settings size={24} />
      </NavLink>
    </nav>
  );
};
