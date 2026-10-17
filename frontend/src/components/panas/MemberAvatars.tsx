import React from 'react';
import { Users, Crown, Shield } from 'lucide-react';
import type { ShareMemberOut } from '../../types';

interface MemberAvatarsProps {
  members?: ShareMemberOut[];
  maxVisible?: number;
  size?: number;
  onClick?: () => void;
  interactive?: boolean;
}

const GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ec4899, #db2777)',
  'linear-gradient(135deg, #3b82f6, #2563eb)',
  'linear-gradient(135deg, #14b8a6, #0d9488)',
];

export const MemberAvatars: React.FC<MemberAvatarsProps> = ({
  members = [],
  maxVisible = 3,
  size = 26,
  onClick,
  interactive = true,
}) => {
  if (!members || members.length === 0) return null;

  const visibleMembers = members.slice(0, maxVisible);
  const remainingCount = members.length - maxVisible;

  const tooltipText = members
    .map(m => {
      let roleLabel = 'Miembro';
      if (m.is_owner) roleLabel = 'Creador 👑';
      else if (m.role === 'admin') roleLabel = 'Admin 🛡️';
      return `${m.name} (${roleLabel})`;
    })
    .join('\n');

  return (
    <div
      onClick={onClick}
      title={tooltipText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        cursor: interactive && onClick ? 'pointer' : 'default',
        padding: '0.2rem 0.5rem',
        borderRadius: '20px',
        background: 'var(--surface-muted, #F3F4F6)',
        border: '1px solid var(--accent-light, #E5E7EB)',
        transition: 'all 0.15s ease',
      }}
      className={interactive && onClick ? 'member-avatars-badge' : ''}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {visibleMembers.map((m, idx) => {
          const bg = GRADIENTS[idx % GRADIENTS.length];
          return (
            <div
              key={m.user_id}
              style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                background: m.avatar_url ? `url(${m.avatar_url}) center/cover no-repeat` : bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: `${size * 0.42}px`,
                fontWeight: 700,
                border: '2px solid var(--surface-color, #ffffff)',
                marginLeft: idx === 0 ? 0 : `-${Math.round(size * 0.28)}px`,
                position: 'relative',
                zIndex: visibleMembers.length - idx,
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}
            >
              {!m.avatar_url && m.name.charAt(0).toUpperCase()}

              {m.is_owner ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    background: '#f59e0b',
                    borderRadius: '50%',
                    width: '11px',
                    height: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                  title="Creador"
                >
                  <Crown size={7} color="#fff" />
                </div>
              ) : m.role === 'admin' ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    background: '#3b82f6',
                    borderRadius: '50%',
                    width: '11px',
                    height: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                  title="Administrador"
                >
                  <Shield size={7} color="#fff" />
                </div>
              ) : null}
            </div>
          );
        })}

        {remainingCount > 0 && (
          <div
            style={{
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: '50%',
              background: 'var(--surface-color, #ffffff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary, #6B7280)',
              fontSize: `${size * 0.38}px`,
              fontWeight: 700,
              border: '2px solid var(--accent-light, #E5E7EB)',
              marginLeft: `-${Math.round(size * 0.28)}px`,
              zIndex: 0,
            }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--text-secondary, #6B7280)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.2rem',
        }}
      >
        <Users size={12} />
        {members.length}
      </span>
    </div>
  );
};
