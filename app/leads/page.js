'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import LeadRow from '../../components/leads/leadRow';
import LeadBulkActions from '../../components/leads/leadBulkActions';
import LeadCreateForm from '../../components/leads/leadCreateForm';
import KanbanBoard from '../../components/kanban/kanbanBoard';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [view, setView] = useState('table'); // 'table' | 'kanban'
  const [funnels, setFunnels] = useState([]);
  const [kanbanFunnelId, setKanbanFunnelId] = useState('');

  // Filtros de la vista Tabla
  const [filterFunnelId, setFilterFunnelId] = useState(''); // '' = todos, 'unassigned' = sin asignar, o id de embudo
  const [filterStageId, setFilterStageId] = useState('');
  const [filterStages, setFilterStages] = useState([]);

  // Crear lead
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    loadLeads();
    loadFunnels();
  }, []);

  useEffect(() => {
    if (filterFunnelId && filterFunnelId !== 'unassigned') {
      loadFilterStages(filterFunnelId);
    } else {
      setFilterStages([]);
      setFilterStageId('');
    }
  }, [filterFunnelId]);

  async function loadLeads() {
    setLoading(true);
    setErrorMsg(null);
    setSelectedIds([]);

    // Trae los leads junto con su embudo/etapa actual (si tienen).
    const { data, error } = await supabase
      .from('leads')
      .select(
        `
        id, name, phone, address, email, status,
        lead_funnel (
          funnel_id, stage_id,
          funnels ( name ),
          funnel_stages ( name )
        )
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
    const { data } = await supabase.from('funnels').select('id, name').order('name');
    setFunnels(data ?? []);
    if (data && data.length > 0) setKanbanFunnelId((prev) => prev || data[0].id);
  }

  async function loadFilterStages(funnelId) {
    const { data } = await supabase
      .from('funnel_stages')
      .select('id, name')
      .eq('funnel_id', funnelId)
      .order('position');
    setFilterStages(data ?? []);
    setFilterStageId('');
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
      // El teléfono es UNIQUE en la base de datos: si ya existe, avisamos
      // en vez de dejar que el error crudo de Postgres confunda al usuario.
      if (error.code === '23505') {
        setCreateError('Ya existe un lead con ese teléfono.');
      } else {
        setCreateError(error.message);
      }
    } else {
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

    if (filterFunnelId === 'unassigned') {
      return !rel;
    }
    if (filterFunnelId) {
      if (!rel || rel.funnel_id !== filterFunnelId) return false;
      if (filterStageId && rel.stage_id !== filterStageId) return false;
    }
    return true;
  });

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Leads</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div className="card" style={{ padding: 4, display: 'flex', gap: 4 }}>
            <button
              className={view === 'table' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setView('table')}
              style={{ border: 'none' }}
            >
              Tabla
            </button>
            <button
              className={view === 'kanban' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setView('kanban')}
              style={{ border: 'none' }}
            >
              Kanban
            </button>
          </div>
          <Button onClick={() => setCreateModalOpen(true)}>+ Nuevo lead</Button>
          <a href="/imports" className="btn btn-secondary">Importar Excel</a>
        </div>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {view === 'table' ? (
        <>
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
              <option value="unassigned">Sin asignar</option>
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {filterStages.length > 0 && (
              <select
                className="input"
                style={{ maxWidth: 180 }}
                value={filterStageId}
                onChange={(e) => setFilterStageId(e.target.value)}
              >
                <option value="">Todas las etapas</option>
                {filterStages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
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
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '0.6rem 1rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                        onChange={toggleSelectAll}
                        aria-label="Seleccionar todos"
                      />
                    </th>
                    <th style={{ padding: '0.6rem 1rem' }}>Nombre</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Teléfono</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Dirección</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Correo</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Embudo</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      selected={selectedIds.includes(lead.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        No hay leads que coincidan con la búsqueda o los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div>
          <label style={{ display: 'block', marginBottom: '1rem', maxWidth: 280 }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Embudo</span>
            <select
              className="input"
              value={kanbanFunnelId}
              onChange={(e) => setKanbanFunnelId(e.target.value)}
            >
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>

          {funnels.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>
              Aún no hay embudos. <a href="/funnels" style={{ color: 'var(--color-primary)' }}>Crear uno</a>.
            </p>
          ) : (
            kanbanFunnelId && <KanbanBoard funnelId={kanbanFunnelId} />
          )}
        </div>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nuevo lead">
        <LeadCreateForm onCreate={handleCreateLead} saving={creating} errorMsg={createError} />
      </Modal>
    </main>
  );
}