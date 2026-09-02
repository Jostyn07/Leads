'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import Modal from '../ui/modal';
import Button from '../ui/button';

export default function LeadBulkActions({ selectedIds, onDone }) {
  const [funnels, setFunnels] = useState([]);
  const [stages, setStages] = useState([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (modalOpen) loadFunnels();
  }, [modalOpen]);

  useEffect(() => {
    if (selectedFunnelId) loadStages(selectedFunnelId);
    else setStages([]);
  }, [selectedFunnelId]);

  async function loadFunnels() {
    const { data } = await supabase.from('funnels').select('id, name').order('name');
    setFunnels(data ?? []);
  }

  async function loadStages(funnelId) {
    const { data } = await supabase
      .from('funnel_stages')
      .select('id, name')
      .eq('funnel_id', funnelId)
      .order('position');
    setStages(data ?? []);
    setSelectedStageId(data?.[0]?.id ?? '');
  }

  async function handleAssign() {
    if (!selectedFunnelId || !selectedStageId) return;
    setWorking(true);
    setErrorMsg(null);

    // upsert: si el lead ya tenía una fila en lead_funnel, la reemplaza
    // (recuerda que lead_id es UNIQUE: un lead solo puede estar en un embudo).
    const rows = selectedIds.map((leadId) => ({
      lead_id: leadId,
      funnel_id: selectedFunnelId,
      stage_id: selectedStageId,
    }));

    const { error } = await supabase.from('lead_funnel').upsert(rows, { onConflict: 'lead_id' });

    setWorking(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setModalOpen(false);
      onDone?.();
    }
  }

  async function handleArchive() {
    const confirmed = window.confirm(`¿Archivar ${selectedIds.length} lead(s) seleccionados?`);
    if (!confirmed) return;

    setWorking(true);
    setErrorMsg(null);
    const { error } = await supabase.from('leads').update({ status: 'archived' }).in('id', selectedIds);
    setWorking(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      onDone?.();
    }
  }

  if (selectedIds.length === 0) return null;

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
    >
      <span style={{ fontSize: '0.9rem' }}>{selectedIds.length} seleccionados</span>
      <Button variant="secondary" onClick={() => setModalOpen(true)}>
        Asignar a embudo
      </Button>
      <Button variant="danger" onClick={handleArchive} disabled={working}>
        Archivar
      </Button>

      {errorMsg && <span style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{errorMsg}</span>}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Asignar a embudo">
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Embudo</span>
          <select
            className="input"
            value={selectedFunnelId}
            onChange={(e) => setSelectedFunnelId(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>

        {stages.length > 0 && (
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Etapa inicial</span>
            <select
              className="input"
              value={selectedStageId}
              onChange={(e) => setSelectedStageId(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}

        <Button onClick={handleAssign} disabled={working || !selectedFunnelId || !selectedStageId}>
          {working ? 'Asignando…' : `Asignar ${selectedIds.length} lead(s)`}
        </Button>
      </Modal>
    </div>
  );
}