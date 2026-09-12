import React, { useState } from 'react';
import CategoryManager from './CategoryManager';
import ProfileManager from './ProfileManager';

import { LogOut, User, Folder, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type SettingsView = 'menu' | 'profile' | 'categories';

export const SettingsPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<SettingsView>('menu');
  const { user, displayName, avatarUrl, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const renderMenu = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Tarjeta de Perfil (Top) */}
      <div className="soft-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
        <div style={{ 
          width: '64px', height: '64px', borderRadius: '50%', 
          background: 'var(--accent-light)', border: '2px solid white', 
          boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', color: 'var(--text-primary)', 
          fontWeight: 700, fontSize: '1.2rem', overflow: 'hidden', flexShrink: 0 
        }}>
          {avatarUrl ? (
             <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
             getInitials(displayName)
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.15rem' }}>
            {displayName || 'Usuario'}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {user?.email || 'usuario@ejemplo.com'}
          </span>
        </div>
      </div>

      {/* Tarjeta de Opciones (Centro) */}
      <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
        <button 
          onClick={() => setCurrentView('profile')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.25rem 1.5rem', background: 'transparent', border: 'none', 
            borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer',
            textAlign: 'left', transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
            <div style={{ 
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--info-bg)', color: 'var(--info-color)', borderRadius: '50%'
            }}>
              <User size={20} />
            </div>
            Configuración de Perfil
          </div>
          <ChevronRight size={20} color="var(--text-tertiary)" />
        </button>

        <button 
          onClick={() => setCurrentView('categories')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.25rem 1.5rem', background: 'transparent', border: 'none', 
            cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
            <div style={{ 
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(139, 92, 246, 0.08)', color: '#8B5CF6', borderRadius: '50%'
            }}>
              <Folder size={20} />
            </div>
            Mis Categorías
          </div>
          <ChevronRight size={20} color="var(--text-tertiary)" />
        </button>
      </div>

      {/* Tarjeta de Salir (Abajo) */}
      <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
        <button 
          onClick={handleSignOut}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.25rem 1.5rem', background: 'transparent', border: 'none', 
            cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--expense-bg)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--expense-color)', fontWeight: 500 }}>
            <div style={{ 
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--expense-bg)', borderRadius: '50%' 
            }}>
              <LogOut size={20} />
            </div>
            Cerrar Sesión
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {currentView !== 'menu' && (
          <button 
            onClick={() => setCurrentView('menu')}
            style={{
              background: 'var(--surface-color)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              color: 'var(--text-primary)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {currentView === 'menu' && 'Ajustes'}
          {currentView === 'profile' && 'Perfil'}
          {currentView === 'categories' && 'Categorías'}
        </h1>
      </header>

      <div className="settings-content" style={{ animation: 'fadeIn 0.2s ease' }}>
        {currentView === 'menu' && renderMenu()}
        {currentView === 'profile' && <ProfileManager />}
        {currentView === 'categories' && <CategoryManager onCategoriesChanged={() => {}} />}
      </div>
    </div>
  );
};

