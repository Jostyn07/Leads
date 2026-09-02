'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase/client';
import LeadDetailForm from '../../../components/leads/leadDetailForm';
import Button from '../../../components/ui/button';

export default function LeadDetailPage() {
  const { id: leadId } = useParams();
  const router = useRouter();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (leadId) loadLead();
  }, [leadId]);

  async function loadLead() {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from('leads')
      .select(
        `
        id, name, phone, address, email, status,
        lead_funnel ( funnel_id, stage_id, funnels ( name ), funnel_stages ( name ) )
      `
      )
      .eq('id', leadId)
      .single();

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLead(data);
    }
    setLoading(false);
  }

  async function handleSave(updates) {
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase.from('leads').update(updates).eq('id', leadId);

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      await loadLead();
    }
  }

  async function handleArchive() {
    const confirmed = window.confirm('¿Archivar este lead?');
    if (!confirmed) return;

    const { error } = await supabase.from('leads').update({ status: 'archived' }).eq('id', leadId);
    if (error) {
      setErrorMsg(error.message);
    } else {
      router.push('/leads');
    }
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 560, margin: '0 auto' }}>
        <p>Cargando…</p>
      </main>
    );
  }

  if (!lead) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-danger)' }}>{errorMsg || 'Lead no encontrado.'}</p>
        <a href="/leads" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
          Volver a Leads
        </a>
      </main>
    );
  }

  const rel = Array.isArray(lead.lead_funnel) ? lead.lead_funnel[0] : lead.lead_funnel;

  return (
    <main style={{ padding: '1.5rem', maxWidth: 560, margin: '0 auto' }}>
      <a href="/leads" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        ← Leads
      </a>
      <h1 style={{ fontSize: '1.25rem', margin: '0.5rem 0 1rem' }}>{lead.name}</h1>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.9rem', marginBottom: 4 }}>
          <strong>Embudo:</strong> {rel?.funnels?.name || 'Sin asignar'}
        </p>
        <p style={{ fontSize: '0.9rem', marginBottom: 4 }}>
          <strong>Etapa:</strong> {rel?.funnel_stages?.name || '—'}
        </p>
        <p style={{ fontSize: '0.9rem' }}>
          <strong>Estado:</strong> {lead.status === 'archived' ? 'Archivado' : 'Activo'}
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Información del contacto</h2>
        <LeadDetailForm lead={lead} onSave={handleSave} saving={saving} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="btn btn-secondary">
            📞 Llamar
          </a>
        )}
        {lead.phone && (
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            WhatsApp
          </a>
        )}
        {lead.status !== 'archived' && (
          <Button variant="danger" onClick={handleArchive}>
            Archivar
          </Button>
        )}
      </div>
    </main>
  );
}