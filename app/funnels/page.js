'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import FunnelColumn from '../../components/funnels/funnelColumn';

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState([]);
  const [leadsByFunnel, setLeadsByFunnel] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    loadFunnels();
  }, []);

  async function loadFunnels() {
    setLoading(true);
    setErrorMsg(null);

    const { data: funnelsData, error } = await supabase
      .from('funnels')
      .select('id, name, description, is_protected, is_default_stage')
      // Los embudos protegidos siempre primero, y "Sin contactar" primero de todos.
      .order('is_default_stage', { ascending: false })
      .order('is_protected', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    const { data: relData, error: relError } = await supabase
      .from('lead_funnel')
      .select('funnel_id, leads ( id, name, phone, status )');

    if (relError) {
      setErrorMsg(relError.message);
      setLoading(false);
      return;
    }

    const grouped = {};
    (funnelsData ?? []).forEach((f) => {
      grouped[f.id] = [];
    });
    (relData ?? []).forEach((rel) => {
      if (rel.leads && rel.leads.status === 'active' && grouped[rel.funnel_id]) {
        grouped[rel.funnel_id].push(rel.leads);
      }
    });

    setFunnels(funnelsData ?? []);
    setLeadsByFunnel(grouped);
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase
      .from('funnels')
      .insert({ name: newName.trim(), description: newDescription.trim() || null });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setNewName('');
      setNewDescription('');
      setShowCreateForm(false);
      await loadFunnels();
    }
    setSaving(false);
  }

  function startEdit(funnel) {
    setEditingId(funnel.id);
    setEditName(funnel.name);
    setEditDescription(funnel.description || '');
  }

  async function handleSaveEdit(funnelId) {
    if (!editName.trim()) return;
    setErrorMsg(null);

    const { error } = await supabase
      .from('funnels')
      .update({ name: editName.trim(), description: editDescription.trim() || null })
      .eq('id', funnelId);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setEditingId(null);
      await loadFunnels();
    }
  }

  async function handleDelete(funnel) {
    const count = leadsByFunnel[funnel.id]?.length ?? 0;
    const confirmed = window.confirm(
      `¿Eliminar el embudo "${funnel.name}"? Los ${count} leads asignados quedarán sin embudo. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setErrorMsg(null);
    const { error } = await supabase.from('funnels').delete().eq('id', funnel.id);
    if (error) {
      // El trigger de la base de datos bloquea el borrado de embudos
      // protegidos ("Sin contactar" / "Contactado") con este mensaje.
      setErrorMsg(error.message);
    } else {
      await loadFunnels();
    }
  }

  // Arrastrar un lead de una columna a otra: mueve su embudo directamente
  // (los embudos son el único nivel de estado, no hay etapas).
  async function handleDropLead(leadId, newFunnelId) {
    setLeadsByFunnel((prev) => {
      const next = {};
      let movedLead = null;
      for (const [funnelId, leadsList] of Object.entries(prev)) {
        next[funnelId] = leadsList.filter((l) => {
          if (l.id === leadId) {
            movedLead = l;
            return false;
          }
          return true;
        });
      }
      if (movedLead) {
        next[newFunnelId] = [...(next[newFunnelId] ?? []), movedLead];
      }
      return next;
    });

    const { error } = await supabase
      .from('lead_funnel')
      .upsert({ lead_id: leadId, funnel_id: newFunnelId }, { onConflict: 'lead_id' });

    if (error) {
      setErrorMsg(error.message);
      await loadFunnels(); // revertir al estado real si falló
    }
  }

  return (
    <main style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Embudos</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? 'Cancelar' : '+ Crear embudo'}
        </button>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Arrastra un lead entre columnas para cambiarlo de embudo.
      </p>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: '1rem', maxWidth: 360 }}>
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Nombre</span>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label style={{ display: 'block', marginBottom: '1rem' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Descripción (opcional)</span>
            <input
              className="input"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </form>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : funnels.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay embudos creados.</p>
      ) : (
        <div className="scroll-x" style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {funnels.map((funnel) => (
            <FunnelColumn
              key={funnel.id}
              funnel={funnel}
              leads={leadsByFunnel[funnel.id] ?? []}
              editing={editingId === funnel.id}
              editState={{ name: editName, setName: setEditName, description: editDescription, setDescription: setEditDescription }}
              onStartEdit={() => startEdit(funnel)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => handleSaveEdit(funnel.id)}
              onDelete={() => handleDelete(funnel)}
              onDropLead={handleDropLead}
            />
          ))}
        </div>
      )}
    </main>
  );
}