import React, { useState } from 'react';
import { Users, Shield, User, Check, Search, Info } from 'lucide-react';
import type { Connection } from '../../types';

interface ParticipantPickerProps {
  connections: Connection[];
  selectedIds: string[];
  adminIds: string[];
  onChange: (selectedIds: string[], adminIds: string[]) => void;
  accentColor?: string;
  disabled?: boolean;
}

export const ParticipantPicker: React.FC<ParticipantPickerProps> = ({
  connections,
  selectedIds,
  adminIds,
  onChange,
  accentColor = 'var(--accent-color, #10B981)',
  disabled = false,
}) => {
  const [search, setSearch] = useState('');

  const filteredConnections = connections.filter(c =>
    c.partner_name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (partnerId: string) => {
    if (disabled) return;
    if (selectedIds.includes(partnerId)) {
      const nextSelected = selectedIds.filter(id => id !== partnerId);
      const nextAdmins = adminIds.filter(id => id !== partnerId);
      onChange(nextSelected, nextAdmins);
    } else {
      onChange([...selectedIds, partnerId], adminIds);
    }
  };

  const toggleAdmin = (partnerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (adminIds.includes(partnerId)) {
      onChange(selectedIds, adminIds.filter(id => id !== partnerId));
    } else {
      onChange(selectedIds, [...adminIds, partnerId]);
    }
  };

  if (connections.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.75rem 1rem',
          background: 'var(--surface-muted)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--accent-light)',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
        }}
      >
        <Info size={18} style={{ color: accentColor, flexShrink: 0 }} />
        <span>
          No tienes panas conectados aún. Ve a <strong>Herramientas &gt; Panas</strong> para conectar con tus amigos.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Selecciona los panas del grupo (puedes marcar múltiples personas):
        </span>
        {connections.length === 1 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
            💡 Tienes 1 pana conectado actualmente. Puedes conectar a más personas desde <em>Herramientas &gt; Panas</em>.
          </span>
        )}
      </div>

      {connections.length > 5 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--surface-muted)',
            padding: '0.4rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent-light)',
          }}
        >
          <Search size={14} color="var(--text-tertiary)" />
          <input
            type="text"
            placeholder="Buscar panas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={disabled}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              width: '100%',
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          maxHeight: '220px',
          overflowY: 'auto',
          paddingRight: '0.25rem',
        }}
      >
        {filteredConnections.map(c => {
          const isSelected = selectedIds.includes(c.partner_id);
          const isAdmin = adminIds.includes(c.partner_id);

          return (
            <div
              key={c.partner_id}
              onClick={() => toggleSelect(c.partner_id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                background: isSelected
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'var(--surface-color)',
                border: `1px solid ${
                  isSelected
                    ? 'var(--income-color)'
                    : 'var(--accent-light)'
                }`,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    border: `1.5px solid ${isSelected ? 'var(--income-color)' : 'var(--accent-light)'}`,
                    background: isSelected ? 'var(--income-color)' : 'var(--surface-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                </div>

                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  {c.partner_name.charAt(0).toUpperCase()}
                </div>

                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                  }}
                >
                  {c.partner_name}
                </span>
              </div>

              {isSelected && (
                <button
                  type="button"
                  onClick={e => toggleAdmin(c.partner_id, e)}
                  title={isAdmin ? 'Rol: Administrador (click para cambiar a miembro)' : 'Rol: Miembro (click para hacer administrador)'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    border: isAdmin ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--accent-light)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: isAdmin ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface-muted)',
                    color: isAdmin ? '#D97706' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {isAdmin ? <Shield size={12} /> : <User size={12} />}
                  {isAdmin ? 'Admin' : 'Miembro'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginTop: '0.1rem',
          }}
        >
          <Users size={12} />
          <span>
            {selectedIds.length} pana{selectedIds.length > 1 ? 's' : ''} seleccionado{selectedIds.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
};
