export default function LeadCard({ lead, selected, onToggleSelect }) {
  return (
    <div
      className="card"
      style={{
        position: 'relative',
        padding: '0.75rem',
        border: selected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(lead.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Seleccionar ${lead.name}`}
        style={{ position: 'absolute', top: 10, left: 10, zIndex: 1 }}
      />

      <a
        href={`/leads/${lead.id}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 4,
          aspectRatio: '1 / 1',
          width: '100%',
        }}
      >
        <strong style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
          {lead.name}
        </strong>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{lead.phone}</span>
        {lead.email && (
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
            }}
          >
            {lead.email}
          </span>
        )}
        {lead.address && (
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              whiteSpace: 'nowrap',
            }}
          >
            {lead.address}
          </span>
        )}
      </a>
    </div>
  );
}