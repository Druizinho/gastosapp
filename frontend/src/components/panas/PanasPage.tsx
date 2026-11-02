import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Check, 
  X, 
  AlertCircle, 
  Home, 
  CreditCard, 
  ChevronRight, 
  Search,
  Inbox,
  PiggyBank,
  Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getConnections, 
  getPanasOverview, 
  acceptConnection, 
  rejectConnection, 
  deleteConnection,
  invalidateConnectionsCache,
} from '../../api';
import type { Connection, PanasGlobalOverview, PanaSummary } from '../../types';
import { InvitePanaModal } from './InvitePanaModal';
import { PanaDetailModal } from './PanaDetailModal';
import { PageHeader } from '../ui/PageHeader';
import { SummaryHeroCard } from '../ui/SummaryHeroCard';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { EmptyState } from '../ui/EmptyState';
import { ListCard } from '../ui/ListCard';
import { SkeletonList } from '../ui/Skeleton';
import { formatCurrencyAmount } from '../../utils/currencyFormat';

export const PanasPage: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [overview, setOverview] = useState<PanasGlobalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs: 'panas' | 'requests'
  const [activeTab, setActiveTab] = useState<'panas' | 'requests'>('panas');
  const [requestsSubTab, setRequestsSubTab] = useState<'received' | 'sent'>('received');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const fetchData = async (silent = false) => {
    try {
      if (!silent && connections.length === 0 && (!overview || (overview as any).length === 0 || overview.panas.length === 0)) {
        setLoading(true);
      }
      setError(null);
      const [connectionsData, overviewData] = await Promise.all([
        getConnections(),
        getPanasOverview()
      ]);
      setConnections(connectionsData);
      setOverview(overviewData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cargar los panas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAccept = async (id: string) => {
    try {
      await acceptConnection(id);
      invalidateConnectionsCache();
      await fetchData(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al aceptar la solicitud');
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('¿Rechazar esta solicitud de conexión?')) return;
    try {
      await rejectConnection(id);
      invalidateConnectionsCache();
      await fetchData(true);
    } catch (err: any) {
      setError('Error al rechazar la solicitud');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('¿Cancelar esta invitación enviada?')) return;
    try {
      await deleteConnection(id);
      invalidateConnectionsCache();
      await fetchData(true);
    } catch (err: any) {
      setError('Error al cancelar la invitación');
    }
  };

  const pendingReceived = connections.filter(c => !c.is_requester && c.status === 'pending');
  const pendingSent = connections.filter(c => c.is_requester && c.status === 'pending');
  const activePanas = overview?.panas || [];

  const filteredPanas = activePanas.filter(p => 
    p.partner_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.partner_email && p.partner_email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalRequestsCount = pendingReceived.length + pendingSent.length;
  const totalSharedBudgets = overview?.panas?.reduce((acc, p) => acc + (p.shared_sub_budgets_count || 0), 0) || 0;

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '640px', margin: '0 auto' }}>
      <PageHeader
        title="Panas"
        onBack={() => navigate('/herramientas')}
        actionLabel="Invitar pana"
        actionIcon={<UserPlus size={16} />}
        onAction={() => setIsInviteModalOpen(true)}
        actionColor="#EC4899"
      />

      {error && (
        <div style={{ 
          padding: '0.85rem 1rem', 
          background: 'rgba(239, 68, 68, 0.1)', 
          color: '#EF4444', 
          borderRadius: 'var(--radius-md)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          marginBottom: '1.25rem', 
          fontSize: '0.85rem' 
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <SummaryHeroCard
        isLoading={loading}
        eyebrow="RESUMEN CONJUNTO"
        badgeText={loading ? '...' : `${activePanas.length} ${activePanas.length === 1 ? 'Pana activo' : 'Panas activos'}`}
        badgeIcon={<Users size={13} />}
        mainAmount={loading ? '...' : String(activePanas.length)}
        statusSubtext={loading ? 'Sincronizando finanzas...' : (activePanas.length === 1 ? '1 pana conectado sincronizando finanzas' : `${activePanas.length} panas conectados sincronizando finanzas`)}
        accentColor="var(--tool-panas, #EC4899)"
        metrics={[
          {
            label: 'Gastos Fijos',
            value: loading ? '...' : String(overview?.total_shared_fixed_expenses || 0),
            subtext: loading ? undefined : ((overview?.pending_shared_fixed_expenses_this_month || 0) > 0 ? `${overview?.pending_shared_fixed_expenses_this_month} pendiente(s)` : 'Al día'),
            icon: <Home size={14} />,
            valueColor: !loading && (overview?.pending_shared_fixed_expenses_this_month || 0) > 0 ? '#F59E0B' : undefined,
          },
          {
            label: 'Deudas',
            value: loading ? '...' : String(overview?.total_shared_debts || 0),
            subtext: loading ? undefined : (Object.keys(overview?.shared_debts_remaining_by_currency || {}).length > 0
              ? Object.entries(overview!.shared_debts_remaining_by_currency)
                  .map(([c, v]) => formatCurrencyAmount(v, c))
                  .join(' · ')
              : 'Sin saldo'),
            icon: <CreditCard size={14} />,
          },
          {
            label: 'Ahorros',
            value: loading ? '...' : String(overview?.total_shared_saving_goals || 0),
            subtext: loading ? undefined : 'Metas conjuntas',
            icon: <PiggyBank size={14} />,
          },
          {
            label: 'Subpresupuestos',
            value: loading ? '...' : String(totalSharedBudgets),
            subtext: loading ? undefined : 'Compartidos',
            icon: <Layers size={14} />,
          },
        ]}
      />

      <SegmentedTabs<'panas' | 'requests'>
        activeTab={activeTab}
        onChange={setActiveTab}
        activeColor="var(--tool-panas, #EC4899)"
        tabs={[
          {
            id: 'panas',
            label: 'Mis Panas',
            count: activePanas.length,
            icon: <Users size={16} />,
          },
          {
            id: 'requests',
            label: 'Solicitudes',
            count: totalRequestsCount,
            icon: <Inbox size={16} />,
            badgeColor: pendingReceived.length > 0 ? '#EF4444' : undefined,
          },
        ]}
        style={{ marginBottom: '1.25rem' }}
      />

      {loading ? (
        <div style={{ padding: '8px 0' }}>
          <SkeletonList count={3} />
        </div>
      ) : activeTab === 'panas' ? (
        /* TAB 1: MIS PANAS */
        <div>
          {activePanas.length > 3 && (
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem 0.65rem 2.4rem',
                  border: '1px solid var(--accent-light)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem'
                }}
              />
            </div>
          )}

          {filteredPanas.length === 0 ? (
            <EmptyState
              icon={<Users size={28} />}
              title={activePanas.length === 0 ? 'Aún no tienes panas conectados' : 'No se encontraron panas'}
              description={
                activePanas.length === 0 
                  ? 'Conecta con tu pareja, roomie o familiar para compartir gastos fijos de la casa o deudas conjuntas ante terceros.'
                  : 'Prueba buscando con otro término.'
              }
              actionLabel={activePanas.length === 0 ? 'Invitar a tu primer Pana' : undefined}
              actionIcon={activePanas.length === 0 ? <UserPlus size={16} /> : undefined}
              onAction={activePanas.length === 0 ? () => setIsInviteModalOpen(true) : undefined}
              actionColor="var(--tool-panas, #EC4899)"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredPanas.map((pana: PanaSummary) => {
                const avatar = pana.partner_avatar_url ? (
                  <img
                    src={pana.partner_avatar_url}
                    alt={pana.partner_name}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '1.05rem',
                    }}
                  >
                    {pana.partner_name.charAt(0).toUpperCase()}
                  </div>
                );

                const title = (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span>{pana.partner_name}</span>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#10B981',
                        display: 'inline-block',
                      }}
                    />
                  </span>
                );

                const subtitle = pana.partner_email || 'Conectado';

                const hasFixed = (pana.shared_fixed_expenses_count || 0) > 0;
                const hasDebts = (pana.shared_debts_count || 0) > 0;
                const hasSavings = (pana.shared_saving_goals_count || 0) > 0;
                const hasBudgets = (pana.shared_sub_budgets_count || 0) > 0;
                const hasAnyShared = hasFixed || hasDebts || hasSavings || hasBudgets;

                const badgeStyle: React.CSSProperties = {
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  padding: '0.15rem 0.5rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'var(--surface-muted)',
                  color: 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                };

                const badges = !hasAnyShared ? (
                  <span style={badgeStyle}>
                    Sin elementos compartidos
                  </span>
                ) : (
                  <>
                    {hasFixed && (
                      <span style={badgeStyle}>
                        <Home size={12} style={{ color: 'var(--primary-color)' }} />
                        <span>{pana.shared_fixed_expenses_count} fijo(s)</span>
                        {pana.pending_fixed_expenses_this_month > 0 ? (
                          <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                            • {pana.pending_fixed_expenses_this_month} pendiente(s)
                          </span>
                        ) : (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>• Al día</span>
                        )}
                      </span>
                    )}

                    {hasDebts && (
                      <span style={badgeStyle}>
                        <CreditCard size={12} style={{ color: '#6366F1' }} />
                        <span>{pana.shared_debts_count} deuda(s)</span>
                        {Object.keys(pana.debts_currency_summary || {}).length > 0 && (
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            • Resta: {Object.entries(pana.debts_currency_summary)
                              .map(([curr, amt]) => formatCurrencyAmount(amt, curr))
                              .join(', ')}
                          </span>
                        )}
                      </span>
                    )}

                    {hasSavings && (
                      <span style={badgeStyle}>
                        <PiggyBank size={12} style={{ color: '#10B981' }} />
                        <span>{pana.shared_saving_goals_count} ahorro(s)</span>
                      </span>
                    )}

                    {hasBudgets && (
                      <span style={badgeStyle}>
                        <Layers size={12} style={{ color: '#8B5CF6' }} />
                        <span>{pana.shared_sub_budgets_count} presupuestos</span>
                      </span>
                    )}
                  </>
                );

                return (
                  <ListCard
                    key={pana.id}
                    icon={avatar}
                    iconBg="transparent"
                    iconColor="var(--primary-color)"
                    title={title}
                    subtitle={subtitle}
                    badges={badges}
                    quickAction={<ChevronRight size={18} style={{ color: 'var(--text-tertiary)' }} />}
                    onClick={() => pana?.partner_id && setSelectedPartnerId(pana.partner_id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: SOLICITUDES */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SegmentedTabs<'received' | 'sent'>
            activeTab={requestsSubTab}
            onChange={setRequestsSubTab}
            activeColor="var(--tool-panas, #EC4899)"
            tabs={[
              {
                id: 'received',
                label: 'Recibidas',
                count: pendingReceived.length,
                badgeColor: pendingReceived.length > 0 ? '#EF4444' : undefined,
              },
              {
                id: 'sent',
                label: 'Enviadas',
                count: pendingSent.length,
              },
            ]}
          />

          {requestsSubTab === 'received' ? (
            /* Sub-tab: Recibidas */
            <div>
              {pendingReceived.length === 0 ? (
                <div className="soft-card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  No tienes solicitudes pendientes por responder.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {pendingReceived.map(conn => (
                    <ListCard
                      key={conn.id}
                      statusColor="#6366F1"
                      icon={
                        conn.partner_avatar_url ? (
                          <img
                            src={conn.partner_avatar_url}
                            alt={conn.partner_name}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#FFFFFF',
                              fontWeight: 700,
                              fontSize: '1rem',
                            }}
                          >
                            {conn.partner_name.charAt(0).toUpperCase()}
                          </div>
                        )
                      }
                      iconBg="transparent"
                      iconColor="var(--primary-color)"
                      title={conn.partner_name}
                      subtitle="Quiere conectar como Pana contigo"
                      quickAction={
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleAccept(conn.id)}
                            title="Aceptar"
                            style={{ 
                              padding: '0.5rem', 
                              background: 'rgba(16, 185, 129, 0.12)', 
                              color: '#10B981', 
                              border: 'none', 
                              borderRadius: 'var(--radius-md, 8px)', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'transform 150ms ease-out',
                            }}
                            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          >
                            <Check size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(conn.id)}
                            title="Rechazar"
                            style={{ 
                              padding: '0.5rem', 
                              background: 'rgba(239, 68, 68, 0.12)', 
                              color: '#EF4444', 
                              border: 'none', 
                              borderRadius: 'var(--radius-md, 8px)', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'transform 150ms ease-out',
                            }}
                            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Sub-tab: Enviadas */
            <div>
              {pendingSent.length === 0 ? (
                <div className="soft-card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  No tienes invitaciones pendientes enviadas.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {pendingSent.map(conn => (
                    <ListCard
                      key={conn.id}
                      icon={
                        conn.partner_avatar_url ? (
                          <img
                            src={conn.partner_avatar_url}
                            alt={conn.partner_name}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              background: 'var(--surface-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-tertiary)',
                              fontWeight: 700,
                              fontSize: '1rem',
                            }}
                          >
                            {conn.partner_name.charAt(0).toUpperCase()}
                          </div>
                        )
                      }
                      iconBg="transparent"
                      iconColor="var(--text-tertiary)"
                      title={conn.partner_name}
                      subtitle="Esperando que acepte la solicitud"
                      quickAction={
                        <button
                          type="button"
                          onClick={() => handleCancel(conn.id)}
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: 'var(--expense-color, #EF4444)', 
                            fontSize: '0.8rem', 
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '0.4rem 0.6rem',
                            borderRadius: 'var(--radius-sm, 6px)',
                            transition: 'transform 150ms ease-out',
                          }}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          Cancelar
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <InvitePanaModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => {
          invalidateConnectionsCache();
          fetchData(true);
          setActiveTab('requests');
        }}
      />

      <PanaDetailModal
        isOpen={!!selectedPartnerId}
        partnerId={selectedPartnerId}
        onClose={() => {
          setSelectedPartnerId(null);
          invalidateConnectionsCache();
          fetchData(true);
        }}
        onUpdated={() => {
          invalidateConnectionsCache();
          fetchData(true);
        }}
        onConnectionDeleted={() => {
          invalidateConnectionsCache();
          fetchData(true);
        }}
      />
    </div>
  );
};

export default PanasPage;
