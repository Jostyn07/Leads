'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import LeadCard from '../../components/leads/leadCard';
import LeadBulkActions from '../../components/leads/leadBulkActions';
import LeadCreateForm from '../../components/leads/leadCreateForm';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [funnels, setFunnels] = useState([]);
  const [filterFunnelId, setFilterFunnelId] = useState(''); // '' = todos, 'unassigned' = sin embudo, o id de embudo

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    loadLeads();
    loadFunnels();
  }, []);

  async function loadLeads() {
    setLoading(true);
    setErrorMsg(null);
    setSelectedIds([]);

    // Trae los leads junto con su embudo actual (si tienen). Los embudos
    // son la única capa de estado — no hay etapas dentro de ellos.
    const { data, error } = await supabase
      .from('leads')
      .select(
        `
        id, name, phone, address, email, status,
        lead_funnel ( funnel_id, funnels ( name ) )
      `
      )
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLeads(data ?? []);
    }
    setLoading(false);
  }

  async function loadFunnels() {
    const { data } = await supabase
      .from('funnels')
      .select('id, name')
      .order('is_default_stage', { ascending: false })
      .order('name');
    setFunnels(data ?? []);
  }

  function toggleSelect(leadId) {
    setSelectedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === filtered.length ? [] : filtered.map((l) => l.id)));
  }

  async function handleCreateLead(newLead, resetForm) {
    setCreating(true);
    setCreateError(null);

    const { error } = await supabase.from('leads').insert(newLead);

    setCreating(false);
    if (error) {
      // El teléfono es UNIQUE en la base de datos.
      if (error.code === '23505') {
        setCreateError('Ya existe un lead con ese teléfono.');
      } else {
        setCreateError(error.message);
      }
    } else {
      // El nuevo lead cae automáticamente en "Sin contactar" gracias al
      // trigger on_lead_created de schema.sql.
      resetForm();
      setCreateModalOpen(false);
      await loadLeads();
    }
  }

  const filtered = leads.filter((lead) => {
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term || lead.name.toLowerCase().includes(term) || lead.phone.toLowerCase().includes(term);
    if (!matchesSearch) return false;

    const rel = Array.isArray(lead.lead_funnel) ? lead.lead_funnel[0] : lead.lead_funnel;

    if (filterFunnelId === 'unassigned') return !rel;
    if (filterFunnelId) return rel?.funnel_id === filterFunnelId;
    return true;
  });

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Leads</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="/funnels" className="btn btn-secondary">Ver embudos</a>
          <Button onClick={() => setCreateModalOpen(true)}>+ Nuevo lead</Button>
          <a href="/imports" className="btn btn-secondary">Importar Excel</a>
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
          onChange={(e) => setFilterFunnelId(e.target.value)}
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
              setFilterFunnelId('');
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <LeadBulkActions selectedIds={selectedIds} onDone={loadLeads} />

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          {filtered.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={toggleSelectAll}
              style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}
            >
              {selectedIds.length === filtered.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.85rem',
            }}
          >
            {filtered.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedIds.includes(lead.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No hay leads que coincidan con la búsqueda o los filtros.
            </p>
          )}
        </>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nuevo lead">
        <LeadCreateForm onCreate={handleCreateLead} saving={creating} errorMsg={createError} />
      </Modal>
    </main>
  );
}