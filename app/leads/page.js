'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import LeadCard from '../../components/leads/leadCard';
import LeadBulkActions from '../../components/leads/leadBulkActions';
import LeadCreateForm from '../../components/leads/leadCreateForm';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';

const PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 400;

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [funnels, setFunnels] = useState([]);
  const [filterFunnelId, setFilterFunnelId] = useState(''); // '' = todos, 'unassigned' = sin embudo, o id de embudo

  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Debounce de la búsqueda: espera a que la persona deje de escribir
  // antes de consultar al servidor (evita una consulta por cada tecla).
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    loadLeads(page, debouncedSearch, filterFunnelId);
  }, [page, debouncedSearch, filterFunnelId]);

  useEffect(() => {
    loadFunnels();
    loadRole();
  }, []);

  async function loadRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const admin = data?.role === 'admin';
    setIsAdmin(admin);
    if (admin) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setUsers(profiles ?? []);
    }
  }

  async function loadFunnels() {
    const { data } = await supabase
      .from('funnels')
      .select('id, name')
      .order('is_default_stage', { ascending: false })
      .order('name');
    setFunnels(data ?? []);
  }

  // Trae una página de leads directamente del servidor, con el filtro de
  // búsqueda y de embudo ya aplicados en la consulta (no en el cliente) —
  // así funciona igual de bien con 100 leads que con 50,000.
  async function loadLeads(pageNum, searchTerm, funnelFilter) {
    setLoading(true);
    setErrorMsg(null);

    const from = (pageNum - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const specificFunnel = funnelFilter && funnelFilter !== 'unassigned';

    let query = supabase
      .from('leads')
      .select(
        specificFunnel
          ? `id, name, phone, address, email, status,
             lead_funnel!inner ( funnel_id, funnels ( name ) )`
          : `id, name, phone, address, email, status,
             lead_funnel ( funnel_id, funnels ( name ) )`,
        { count: 'exact' }
      )
      .eq('status', 'active');

    if (specificFunnel) {
      query = query.eq('lead_funnel.funnel_id', funnelFilter);
    } else if (funnelFilter === 'unassigned') {
      query = query.is('lead_funnel.funnel_id', null);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().replace(/[%,]/g, '');
      query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLeads(data ?? []);
      setTotalCount(count ?? 0);
      setSelectedIds([]);
    }
    setLoading(false);
  }

  function refreshCurrentPage() {
    loadLeads(page, debouncedSearch, filterFunnelId);
  }

  function toggleSelect(leadId) {
    setSelectedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === leads.length ? [] : leads.map((l) => l.id)));
  }

  async function handleCreateLead(newLead, resetForm) {
    setCreating(true);
    setCreateError(null);

    const { error } = await supabase.from('leads').insert(newLead);

    setCreating(false);
    if (error) {
      if (error.code === '23505') {
        setCreateError('Ya existe un lead con ese teléfono.');
      } else {
        setCreateError(error.message);
      }
    } else {
      resetForm();
      setCreateModalOpen(false);
      setPage(1);
      loadLeads(1, debouncedSearch, filterFunnelId);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Leads</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="/funnels" className="btn btn-secondary">Ver embudos</a>
          {isAdmin && <Button onClick={() => setCreateModalOpen(true)}>+ Nuevo lead</Button>}
          {isAdmin && <a href="/imports" className="btn btn-secondary">Importar Excel</a>}
        </div>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input
          className="input"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select
          className="input"
          style={{ maxWidth: 200 }}
          value={filterFunnelId}
          onChange={(e) => {
            setFilterFunnelId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los embudos</option>
          <option value="unassigned">Sin embudo</option>
          {funnels.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        {(filterFunnelId || search) && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearch('');
              setDebouncedSearch('');
              setFilterFunnelId('');
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <LeadBulkActions selectedIds={selectedIds} onDone={refreshCurrentPage} isAdmin={isAdmin} />

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <button
              className="btn btn-secondary"
              onClick={toggleSelectAll}
              style={{ fontSize: '0.85rem' }}
              disabled={leads.length === 0}
            >
              {selectedIds.length === leads.length && leads.length > 0 ? 'Deseleccionar todos' : 'Seleccionar todos (esta página)'}
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {totalCount} resultado{totalCount === 1 ? '' : 's'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.85rem',
            }}
          >
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedIds.includes(lead.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>

          {leads.length === 0 && (
            <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No hay leads que coincidan con la búsqueda o los filtros.
            </p>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Página {page} de {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nuevo lead">
        <LeadCreateForm
          onCreate={handleCreateLead}
          saving={creating}
          errorMsg={createError}
          isAdmin={isAdmin}
          users={users}
        />
      </Modal>
    </main>
  );
}