'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    setErrorMsg(null);

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

  const filtered = leads.filter((lead) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      lead.name.toLowerCase().includes(term) ||
      lead.phone.toLowerCase().includes(term)
    );
  });

  return (
    <main style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Leads</h1>
        <a href="/imports" className="btn btn-secondary">Importar Excel</a>
      </div>

      <input
        className="input"
        placeholder="Buscar por nombre o teléfono…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '1rem', maxWidth: 320 }}
      />

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '0.6rem 1rem' }}>Nombre</th>
                <th style={{ padding: '0.6rem 1rem' }}>Teléfono</th>
                <th style={{ padding: '0.6rem 1rem' }}>Dirección</th>
                <th style={{ padding: '0.6rem 1rem' }}>Correo</th>
                <th style={{ padding: '0.6rem 1rem' }}>Embudo</th>
                <th style={{ padding: '0.6rem 1rem' }}>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const rel = Array.isArray(lead.lead_funnel) ? lead.lead_funnel[0] : lead.lead_funnel;
                return (
                  <tr key={lead.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.6rem 1rem' }}>{lead.name}</td>
                    <td style={{ padding: '0.6rem 1rem' }}>{lead.phone}</td>
                    <td style={{ padding: '0.6rem 1rem' }}>{lead.address || '—'}</td>
                    <td style={{ padding: '0.6rem 1rem' }}>{lead.email || '—'}</td>
                    <td style={{ padding: '0.6rem 1rem' }}>{rel?.funnels?.name || 'Sin asignar'}</td>
                    <td style={{ padding: '0.6rem 1rem' }}>{rel?.funnel_stages?.name || '—'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No hay leads que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}