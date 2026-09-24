'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getInitials, getAvatarColors } from './avatarColor';
import CardMenu from '../ui/cardMenu';
import { supabase } from '../../lib/supabase/client';
import CallInProgress from '../telefonia/callInProgress';

// Colorea la cápsula de embudo según su tipo. En este modelo el embudo
// ES el estado (no hay una capa de "etapa" separada) — ver la
// discusión de arquitectura en /areas/plataforma-leads.
//
// Cada estado usa un trío de variables (texto/fondo/borde) definido en
// globals.css, ya resuelto para el tema activo — no se arma el color
// concatenando strings en JS.
function getFunnelBadge(funnel) {
  if (!funnel) {
    return {
      label: 'Sin asignar',
      text: 'var(--color-status-none-text)',
      bg: 'var(--color-status-none-bg)',
      border: 'var(--color-status-none-border)',
    };
  }
  if (funnel.is_default_stage) {
    return {
      label: funnel.name,
      text: 'var(--color-status-default-text)',
      bg: 'var(--color-status-default-bg)',
      border: 'var(--color-status-default-border)',
    };
  }
  if (funnel.is_protected) {
    return {
      label: funnel.name,
      text: 'var(--color-status-protected-text)',
      bg: 'var(--color-status-protected-bg)',
      border: 'var(--color-status-protected-border)',
    };
  }
  return {
    label: funnel.name,
    text: 'var(--color-status-custom-text)',
    bg: 'var(--color-status-custom-bg)',
    border: 'var(--color-status-custom-border)',
  };
}

export default function LeadCard({ lead, selected, onToggleSelect, view = 'grid', onChanged }) {
  const [archiving, setArchiving] = useState(false);
  // Llamada activa lanzada desde esta tarjeta -- se marca aquí mismo con
  // Telnyx (mismo CallInProgress que usa /llamadas), sin salir de /leads.
  const [activeCall, setActiveCall] = useState(null);

  function handleCall(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!lead.phone) return;
    setActiveCall({ name: lead.name, numero: lead.phone, leadId: lead.id });
  }

  // El modal vive dentro del árbol React de la tarjeta: se corta la
  // propagación para que sus clics no disparen el onClick de la tarjeta.
  // Se renderiza en document.body con un portal: la tarjeta tiene
  // transform/backdrop-filter, que encierran cualquier position:fixed
  // dentro de ella. Así sale centrado en pantalla, igual que en /llamadas.
  const CallModal = activeCall && typeof document !== 'undefined' && createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <CallInProgress
        call={activeCall}
        onClose={() => setActiveCall(null)}
        onSaveResult={async () => {
          // CallInProgress ya guardó la fila en `calls`; refrescamos la
          // lista para que el estado del lead se actualice.
          onChanged?.();
        }}
      />
    </div>,
    document.body
  );

  const rel = Array.isArray(lead.lead_funnel) ? lead.lead_funnel[0] : lead.lead_funnel;
  const funnel = rel ? (Array.isArray(rel.funnels) ? rel.funnels[0] : rel.funnels) : null;
  const badge = getFunnelBadge(funnel);

  const initials = getInitials(lead.name);
  const avatarColors = getAvatarColors(lead.name);

  async function handleArchive() {
    const confirmed = window.confirm(`¿Archivar a ${lead.name}?`);
    if (!confirmed) return;
    setArchiving(true);
    const { error } = await supabase.from('leads').update({ status: 'archived' }).eq('id', lead.id);
    setArchiving(false);
    if (!error) onChanged?.();
  }

  function handleCopyPhone() {
    navigator.clipboard?.writeText(lead.phone);
  }

  const menuItems = [
    { label: 'Ver información', onClick: () => (window.location.href = `/leads/${lead.id}`) },
    { label: 'Copiar teléfono', onClick: handleCopyPhone },
    { label: 'Archivar', onClick: handleArchive, danger: true },
  ];

  const whatsappHref = `https://wa.me/1${lead.phone}`;

  const Avatar = (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: avatarColors.bg,
        color: avatarColors.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '0.85rem',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );

  const StatusPill = (
    <span
      className="status-pill"
      style={{ background: badge.bg, borderColor: badge.border, color: badge.text }}
    >
      <span className="status-dot" style={{ background: badge.text }} />
      {badge.label}
    </span>
  );

  const Checkbox = (
    <input
      type="checkbox"
      checked={selected}
      onChange={() => onToggleSelect(lead.id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Seleccionar ${lead.name}`}
      style={{ flexShrink: 0 }}
    />
  );

  const ActionButtons = (
    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
      <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn btn-whatsapp" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
        💬 WhatsApp
      </a>
      <button type="button" onClick={handleCall} disabled={!lead.phone || !!activeCall} className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
        📞 Llamar
      </button>
    </div>
  );

  // ------------------------------------------------------------------
  // Vista LISTA: tarjeta horizontal de ancho completo.
  // ------------------------------------------------------------------
  if (view === 'list') {
    return (
      <div
        className={`lead-card${selected ? ' selected' : ''}`}
        style={{ padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.9rem' }}
      >
        {Checkbox}
        {Avatar}
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <a href={`/leads/${lead.id}`} style={{ fontWeight: 700, fontSize: '0.95rem', display: 'block' }}>
            {lead.name}
          </a>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
            <span>☎</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{lead.phone}</span>
          </div>
          {lead.address && (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', display: 'flex', gap: 6, marginTop: 2 }}>
              <span>⌖</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.address}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          {StatusPill}
        </div>
        {ActionButtons}
        <CardMenu items={menuItems} />
        {CallModal}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Vista CUADRÍCULA: tarjeta compacta, varias por fila.
  // ------------------------------------------------------------------
  return (
    <div className={`lead-card${selected ? ' selected' : ''}`} style={{ padding: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.6rem' }}>
        {Checkbox}
        {Avatar}
        <a
          href={`/leads/${lead.id}`}
          style={{ fontWeight: 700, fontSize: '0.9rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {lead.name}
        </a>
        <CardMenu items={menuItems} />
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--color-text)', fontWeight: 600, display: 'flex', gap: 6, marginBottom: 3 }}>
        <span>☎</span> {lead.phone}
      </div>
      {lead.address && (
        <div style={{ fontSize: '0.76rem', color: 'var(--color-text-tertiary)', display: 'flex', gap: 6, marginBottom: '0.6rem' }}>
          <span>⌖</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.address}</span>
        </div>
      )}

      <div style={{ marginBottom: '0.7rem' }}>{StatusPill}</div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn btn-whatsapp" style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}>
          💬 WhatsApp
        </a>
        <button type="button" onClick={handleCall} disabled={!lead.phone || !!activeCall} className="btn btn-primary" style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}>
          📞 Llamar
        </button>
      </div>
      {CallModal}
    </div>
  );
}