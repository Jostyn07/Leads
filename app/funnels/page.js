'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState([]);
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
      .select('id, name, description, funnel_stages ( id )')
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // Conteo de leads por embudo (una consulta por embudo; el número de
    // embudos es pequeño, así que esto es suficiente para el MVP).
    const withCounts = await Promise.all(
      (funnelsData ?? []).map(async (funnel) => {
        const { count } = await supabase
          .from('lead_funnel')
          .select('lead_id', { count: 'exact', head: true })
          .eq('funnel_id', funnel.id);
        return { ...funnel, leadCount: count ?? 0 };
      })
    );

    setFunnels(withCounts);
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
    const confirmed = window.confirm(
      `¿Eliminar el embudo "${funnel.name}"? Los ${funnel.leadCount} leads asignados quedarán sin embudo. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setErrorMsg(null);
    const { error } = await supabase.from('funnels').delete().eq('id', funnel.id);
    if (error) {
      setErrorMsg(error.message);
    } else {
      await loadFunnels();
    }
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Embudos</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? 'Cancelar' : '+ Crear embudo'}
        </button>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: '1rem' }}>
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
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {funnels.map((funnel) => (
            <div key={funnel.id} className="card">
              {editingId === funnel.id ? (
                <div>
                  <input
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <input
                    className="input"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Descripción (opcional)"
                    style={{ marginBottom: '0.75rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={() => handleSaveEdit(funnel.id)}>
                      Guardar
                    </button>
                    <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ fontSize: '1.05rem', marginBottom: 2 }}>{funnel.name}</h2>
                    {funnel.description && (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 6 }}>
                        {funnel.description}
                      </p>
                    )}
                    <p style={{ fontSize: '0.85rem' }}>
                      {funnel.leadCount} leads · {funnel.funnel_stages?.length ?? 0} etapas
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <a href={`/funnels/${funnel.id}`} className="btn btn-secondary">
                      Etapas
                    </a>
                    <button className="btn btn-secondary" onClick={() => startEdit(funnel)}>
                      Editar
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={() => handleDelete(funnel)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {funnels.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay embudos creados.</p>
          )}
        </div>
      )}
    </main>
  );
}