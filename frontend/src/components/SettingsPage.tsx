import React, { useState } from 'react';
import CategoryManager from './CategoryManager';
import ProfileManager from './ProfileManager';

import { LogOut, User, Folder, ChevronRight, ArrowLeft, Globe, Palette } from 'lucide-react';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Tarjeta de Perfil VIP */}
      <div className="soft-card" style={{ 
        display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.5rem',
        background: 'linear-gradient(135deg, #0F172A 0%, #312E81 100%)',
        color: 'white',
        border: 'none',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.3)'
      }}>
        {/* Decorative background circle */}
        <div style={{
          position: 'absolute',
          top: '-30px',
          right: '-30px',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }} />
        <div style={{ 
          width: '72px', height: '72px', borderRadius: '50%', 
          background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', color: 'white', 
          fontWeight: 700, fontSize: '1.5rem', overflow: 'hidden', flexShrink: 0,
          backdropFilter: 'blur(4px)'
        }}>
          {avatarUrl ? (
             <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
             getInitials(displayName)
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.1rem' }}>
            {displayName || 'Usuario'}
          </span>
          <span style={{ opacity: 0.85, fontSize: '0.9rem', fontWeight: 500 }}>
            {user?.email || 'usuario@ejemplo.com'}
          </span>
          <span style={{ 
            marginTop: '0.6rem', display: 'inline-block', background: 'rgba(255,255,255,0.2)', 
            padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, width: 'fit-content',
            border: '1px solid rgba(255,255,255,0.3)'
          }}>
            Plan Gratuito
          </span>
        </div>
      </div>

      {/* Bloque: Cuenta */}
      <div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
          Cuenta
        </h3>
        <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button 
            onClick={() => setCurrentView('profile')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.25rem', background: 'transparent', border: 'none', 
              borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer',
              textAlign: 'left', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              <div style={{ 
                width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)', 
                color: '#3B82F6', borderRadius: '12px'
              }}>
                <User size={18} />
              </div>
              Perfil
            </div>
            <ChevronRight size={20} color="var(--text-tertiary)" />
          </button>

          <button 
            onClick={() => setCurrentView('categories')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.25rem', background: 'transparent', border: 'none', 
              cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              <div style={{ 
                width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)', 
                color: '#8B5CF6', borderRadius: '12px'
              }}>
                <Folder size={18} />
              </div>
              Mis Categorías
            </div>
            <ChevronRight size={20} color="var(--text-tertiary)" />
          </button>
        </div>
      </div>

      {/* Bloque: Preferencias */}
      <div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
          Preferencias
        </h3>
        <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button 
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.25rem', background: 'transparent', border: 'none', 
              borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer',
              textAlign: 'left', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              <div style={{ 
                width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)', 
                color: '#10B981', borderRadius: '12px'
              }}>
                <Globe size={18} />
              </div>
              Moneda Principal
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>USD</span>
              <ChevronRight size={20} color="var(--text-tertiary)" />
            </div>
          </button>

          <button 
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1.25rem 1.25rem', background: 'transparent', border: 'none', 
              cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              <div style={{ 
                width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)', 
                color: '#F59E0B', borderRadius: '12px'
              }}>
                <Palette size={18} />
              </div>
              Apariencia
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Automático</span>
              <ChevronRight size={20} color="var(--text-tertiary)" />
            </div>
          </button>
        </div>
      </div>

      {/* Botón de Salir */}
      <div className="soft-card" style={{ padding: 0, overflow: 'hidden', marginTop: '0.5rem' }}>
        <button 
          onClick={handleSignOut}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
            padding: '1.25rem 1.25rem', background: 'transparent', border: 'none', 
            cursor: 'pointer', textAlign: 'center', transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={18} color="var(--expense-color)" />
          <span style={{ color: 'var(--expense-color)', fontWeight: 600 }}>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem', paddingTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 800, 
          color: 'var(--text-primary)', 
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
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

