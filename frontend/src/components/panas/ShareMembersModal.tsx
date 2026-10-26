import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Crown,
  Shield,
  User,
  UserPlus,
  UserMinus,
  LogOut,
  UserCheck,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';
import type { ShareInfoOut, ShareMemberOut, Connection, ShareRole } from '../../types';
import {
  getShareByEntity,
  addShareMembers,
  updateShareMemberRole,
  removeShareMember,
  requestConnectionByUserId,
  getConnections,
} from '../../api';
import { ParticipantPicker } from './ParticipantPicker';
import { SkeletonList } from '../ui/Skeleton';

interface ShareMembersModalProps {
  entityId: string;
  entityName: string;
  entityType?: 'debt' | 'fixed_expense' | 'saving_goal' | string;
  entityTypeLabel?: string; // 'deuda' | 'gasto fijo' | 'fondo de ahorro'
  onClose: () => void;
  onUpdated?: () => void;
  onSelfLeave?: () => void;
}

export const ShareMembersModal: React.FC<ShareMembersModalProps> = ({
  entityId,
  entityName,
  entityType,
  entityTypeLabel,
  onClose,
  onUpdated,
  onSelfLeave,
}) => {
  const resolvedLabel = entityTypeLabel || (entityType === 'debt' ? 'deuda' : entityType === 'fixed_expense' ? 'gasto fijo' : entityType === 'saving_goal' ? 'fondo de ahorro' : 'ítem');
  const [shareInfo, setShareInfo] = useState<ShareInfoOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add members sub-flow
  const [isAdding, setIsAdding] = useState(false);
  const [allConnections, setAllConnections] = useState<Connection[]>([]);
  const [newSelectedIds, setNewSelectedIds] = useState<string[]>([]);
  const [newAdminIds, setNewAdminIds] = useState<string[]>([]);
  const [addingLoading, setAddingLoading] = useState(false);

  // Confirm leave or kick
  const [confirmKickMember, setConfirmKickMember] = useState<ShareMemberOut | null>(null);
  const [confirmSelfLeave, setConfirmSelfLeave] = useState(false);

  const fetchShareData = async (silent = false) => {
    try {
      if (!silent && !shareInfo) {
        setLoading(true);
      }
      setError(null);
      const data = await getShareByEntity(entityId);
      setShareInfo(data);
    } catch (err: any) {
      console.error('Error fetching share info:', err);
      if (silent && (err?.response?.status === 404 || err?.status === 404)) {
        onUpdated?.();
        onClose();
        return;
      }
      setError(err?.response?.data?.detail || 'No se pudo cargar la información del grupo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareData();
  }, [entityId]);

  const handleOpenAdd = async () => {
    try {
      setIsAdding(true);
      const conns = await getConnections();
      const accepted = conns.filter(c => c.status === 'accepted');
      // Exclude members already in this share
      const existingIds = new Set(shareInfo?.members.map(m => m.user_id) || []);
      const available = accepted.filter(c => !existingIds.has(c.partner_id));
      setAllConnections(available);
      setNewSelectedIds([]);
      setNewAdminIds([]);
    } catch (err) {
      console.error('Error loading connections for add:', err);
    }
  };

  const handleConfirmAdd = async () => {
    if (!shareInfo || newSelectedIds.length === 0) return;
    try {
      setAddingLoading(true);
      setError(null);
      const updated = await addShareMembers(shareInfo.share_id, newSelectedIds, newAdminIds);
      setShareInfo(updated);
      setIsAdding(false);
      setSuccessMsg('Panas agregados con éxito');
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchShareData(true);
      onUpdated?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al agregar integrantes');
    } finally {
      setAddingLoading(false);
    }
  };

  const handleToggleRole = async (targetUserId: string, newRole: ShareRole) => {
    if (!shareInfo) return;
    try {
      setActionLoadingId(targetUserId);
      setError(null);
      const updated = await updateShareMemberRole(shareInfo.share_id, targetUserId, newRole);
      setShareInfo(updated);
      setSuccessMsg(`Rol actualizado a ${newRole === 'admin' ? 'Administrador' : 'Miembro'}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchShareData(true);
      onUpdated?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No se pudo cambiar el rol');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleKickMember = async (member: ShareMemberOut) => {
    if (!shareInfo) return;
    try {
      setActionLoadingId(member.user_id);
      setError(null);
      const res = await removeShareMember(shareInfo.share_id, member.user_id);
      setConfirmKickMember(null);
      setSuccessMsg(`${member.name} fue retirado de ${resolvedLabel}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      onUpdated?.();
      if (res?.share_deleted) {
        onClose();
        return;
      }
      await fetchShareData(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No se pudo retirar al integrante');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSelfLeave = async () => {
    if (!shareInfo) return;
    const myMember = shareInfo.members.find(m => m.is_me);
    if (!myMember) return;
    try {
      setActionLoadingId(myMember.user_id);
      setError(null);
      await removeShareMember(shareInfo.share_id, myMember.user_id);
      setConfirmSelfLeave(false);
      onClose();
      onSelfLeave?.();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No pudiste salir del ítem');
      setActionLoadingId(null);
    }
  };

  const handleConnectWithMember = async (member: ShareMemberOut) => {
    try {
      setActionLoadingId(member.user_id);
      setError(null);
      await requestConnectionByUserId(member.user_id);
      setSuccessMsg(`Solicitud enviada a ${member.name}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      // Update local state to mark pana_request_pending
      setShareInfo(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m =>
            m.user_id === member.user_id ? { ...m, pana_request_pending: true } : m
          ),
        };
      });
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'No se pudo enviar la solicitud de conexión');
    } finally {
      setActionLoadingId(null);
    }
  };

  const myMember = shareInfo?.members.find(m => m.is_me);
  const isOwner = myMember?.is_owner ?? false;
  const isAdmin = myMember?.role === 'admin' || isOwner;

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 1000 }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="expense-form-container"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '520px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--accent-light)',
          background: 'var(--surface-color)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(99, 102, 241, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4F46E5',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                Integrantes del Grupo
              </h3>
              <p
                style={{
                  margin: '0.15rem 0 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {entityName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-muted)',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.45rem',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'var(--transition-fast)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#DC2626',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                color: '#059669',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '8px 0' }}>
              <SkeletonList count={3} />
            </div>
          ) : shareInfo ? (
            <>
              {/* Add Members Section if open */}
              {isAdding ? (
                <div
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--accent-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Agregar nuevos panas
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '0.2rem',
                        display: 'flex',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <ParticipantPicker
                    connections={allConnections}
                    selectedIds={newSelectedIds}
                    adminIds={newAdminIds}
                    onChange={(s, a) => {
                      setNewSelectedIds(s);
                      setNewAdminIds(a);
                    }}
                    disabled={addingLoading}
                  />

                  {allConnections.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                      <button
                        type="button"
                        onClick={() => setIsAdding(false)}
                        disabled={addingLoading}
                        style={{
                          padding: '0.5rem 0.95rem',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--accent-light)',
                          background: 'var(--surface-color)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAdd}
                        disabled={addingLoading || newSelectedIds.length === 0}
                        style={{
                          padding: '0.5rem 1.05rem',
                          borderRadius: 'var(--radius-xs)',
                          border: 'none',
                          background: 'var(--accent-color)',
                          color: 'var(--text-inverse)',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: newSelectedIds.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          opacity: newSelectedIds.length === 0 ? 0.6 : 1,
                        }}
                      >
                        {addingLoading ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
                        Confirmar e invitar
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                isAdmin && (
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px dashed rgba(99, 102, 241, 0.4)',
                      color: '#4F46E5',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <UserPlus size={16} />
                    + Agregar panas a este {resolvedLabel}
                  </button>
                )
              )}

              {/* Members List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Integrantes ({shareInfo.members.length})
                </span>

                {shareInfo.members.map(member => {
                  const isActionLoading = actionLoadingId === member.user_id;

                  // Permission calculation based on rules:
                  // Owner can demote/promote anyone and expel anyone
                  // Admin can promote member to admin, but cannot demote admin or kick admin/owner
                  const canKickThisMember =
                    !member.is_me &&
                    (isOwner ? !member.is_owner : isAdmin && member.role !== 'admin' && !member.is_owner);

                  const canPromoteToAdmin =
                    (isOwner || isAdmin) && member.role === 'member' && !member.is_owner;
                  const canDemoteToMember = isOwner && member.role === 'admin' && !member.is_owner;

                  return (
                    <div
                      key={member.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-sm)',
                        background: member.is_me
                          ? 'rgba(16, 185, 129, 0.06)'
                          : 'var(--surface-muted)',
                        border: `1px solid ${
                          member.is_me
                            ? 'rgba(16, 185, 129, 0.3)'
                            : 'var(--accent-light)'
                        }`,
                      }}
                    >
                      {/* Avatar & Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: member.avatar_url
                              ? `url(${member.avatar_url}) center/cover no-repeat`
                              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            flexShrink: 0,
                          }}
                        >
                          {!member.avatar_url && member.name.charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span
                              style={{
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {member.name}
                            </span>
                            {member.is_me && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: 'var(--radius-xs)',
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#059669',
                                  fontWeight: 700,
                                }}
                              >
                                Tú
                              </span>
                            )}
                          </div>

                          {/* Role tag */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              marginTop: '0.2rem',
                            }}
                          >
                            {member.is_owner ? (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#D97706',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 'var(--radius-xs)',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                }}
                              >
                                <Crown size={12} /> Creador
                              </span>
                            ) : member.role === 'admin' ? (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#2563EB',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 'var(--radius-xs)',
                                  border: '1px solid rgba(59, 130, 246, 0.25)',
                                }}
                              >
                                <Shield size={12} /> Administrador
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: 'var(--text-secondary)',
                                  fontWeight: 500,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  background: 'var(--surface-color)',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: 'var(--radius-xs)',
                                  border: '1px solid var(--accent-light)',
                                }}
                              >
                                <User size={12} /> Miembro
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {/* If not my pana and not me: offer direct connection */}
                        {!member.is_me && !member.is_my_pana && (
                          member.pana_request_pending ? (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.3rem 0.6rem',
                                borderRadius: 'var(--radius-xs)',
                                background: 'var(--surface-color)',
                                border: '1px solid var(--accent-light)',
                                color: 'var(--text-tertiary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <UserCheck size={12} /> Solicitud pendiente
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleConnectWithMember(member)}
                              disabled={isActionLoading}
                              title="Enviar solicitud para conectar como panas"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.3rem 0.6rem',
                                borderRadius: 'var(--radius-xs)',
                                background: 'rgba(99, 102, 241, 0.1)',
                                border: '1px solid rgba(99, 102, 241, 0.25)',
                                color: '#4F46E5',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {isActionLoading ? <Loader2 size={12} className="spin" /> : <UserPlus size={12} />}
                              + Conectar
                            </button>
                          )
                        )}

                        {/* Promote to Admin button */}
                        {canPromoteToAdmin && (
                          <button
                            type="button"
                            onClick={() => handleToggleRole(member.user_id, 'admin')}
                            disabled={isActionLoading}
                            title="Promover a Administrador"
                            style={{
                              padding: '0.3rem 0.55rem',
                              borderRadius: 'var(--radius-xs)',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.25)',
                              color: '#2563EB',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Shield size={12} /> Hacer Admin
                          </button>
                        )}

                        {/* Demote to Member button (Owner only) */}
                        {canDemoteToMember && (
                          <button
                            type="button"
                            onClick={() => handleToggleRole(member.user_id, 'member')}
                            disabled={isActionLoading}
                            title="Degradar a Miembro común"
                            style={{
                              padding: '0.3rem 0.55rem',
                              borderRadius: 'var(--radius-xs)',
                              background: 'var(--surface-color)',
                              border: '1px solid var(--accent-light)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.72rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <User size={12} /> Hacer Miembro
                          </button>
                        )}

                        {/* Kick Member Button */}
                        {canKickThisMember && (
                          <button
                            type="button"
                            onClick={() => setConfirmKickMember(member)}
                            disabled={isActionLoading}
                            title="Expulsar integrante"
                            style={{
                              padding: '0.35rem 0.5rem',
                              borderRadius: 'var(--radius-xs)',
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#DC2626',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <UserMinus size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leave Section */}
              <div
                style={{
                  marginTop: '0.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--accent-light)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {isOwner && shareInfo.members.length > 1
                    ? 'Si sales, el rol de dueño pasará al administrador más antiguo.'
                    : 'Si sales, dejarás de ver este ítem en tu cuenta.'}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmSelfLeave(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 0.9rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#DC2626',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <LogOut size={14} />
                  Salir de {resolvedLabel}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Confirm Kick Dialog */}
      {confirmKickMember && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={() => setConfirmKickMember(null)}
        >
          <div
            className="soft-card"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-color)',
              border: '1px solid var(--accent-light)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              maxWidth: '380px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--expense-color)' }}>
              <AlertTriangle size={20} />
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                ¿Expulsar a {confirmKickMember.name}?
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Este integrante ya no tendrá acceso a este {resolvedLabel} ni a sus registros.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setConfirmKickMember(null)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--accent-light)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleKickMember(confirmKickMember)}
                style={{
                  padding: '0.55rem 1.1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--expense-color)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sí, expulsar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Self Leave Dialog */}
      {confirmSelfLeave && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={() => setConfirmSelfLeave(false)}
        >
          <div
            className="soft-card"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-color)',
              border: '1px solid var(--accent-light)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              maxWidth: '380px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--expense-color)' }}>
              <LogOut size={20} />
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                ¿Abandonar este {resolvedLabel}?
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Dejarás de tener acceso a este {resolvedLabel}. Los demás integrantes continuarán compartiéndolo sin interrupción.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setConfirmSelfLeave(false)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--accent-light)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSelfLeave}
                style={{
                  padding: '0.55rem 1.1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--expense-color)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Sí, abandonar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
