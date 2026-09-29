'use client';

// Costos de Telnyx — SOLO para el dueño (owner).
// Los costos salen de los registros de detalle (CDR) de Telnyx, que la
// Edge Function `telnyx-sync-costs` trae y asocia a cada llamada.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import Button from '../../../components/ui/button';
import DataTable from '../../../components/tables/dataTable';
import RequireOwner from '../../../components/ui/requireOwner';

const RANGOS = [
  { dias: 7, label: 'Últimos 7 días' },
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 90 días' },
];

const TIPO_LABEL = { webrtc: 'WebRTC', 'sip-trunking': 'Línea telefónica', 'call-control': 'Call Control' };

function usd(n, dec = 2) {
  return `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function isoDia(d) {
  return d.toISOString().slice(0, 10);
}
function etiquetaDia(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function formatDur(seg) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TelnyxCostosPage() {
  return (
    <RequireOwner>
      <TelnyxCostosContent />
    </RequireOwner>
  );
}

function TelnyxCostosContent() {
  const [dias, setDias] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const hasta = new Date();
  const desde = new Date(Date.now() - (dias - 1) * 86400000);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc('telnyx_costos', { p_desde: isoDia(desde), p_hasta: isoDia(hasta) });
    if (error) setErrorMsg(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }

  async function sincronizar() {
    setSyncing(true);
    setSyncMsg(null);
    const { data, error } = await supabase.functions.invoke('telnyx-sync-costs', { body: { dias } });
    setSyncing(false);
    if (error || data?.error) {
      let detalle = data?.error || error?.message;
      try {
        const b = await error?.context?.json();
        if (b?.error) detalle = b.error;
      } catch {}
      setSyncMsg({ tipo: 'error', texto: 'No se pudo sincronizar: ' + detalle });
      return;
    }
    const total = Object.values(data.registros || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    setSyncMsg({
      tipo: data.errores?.length ? 'aviso' : 'ok',
      texto: `Sincronizados ${total} registros de Telnyx (${data.vinculados_ahora} asociados a llamadas).` + (data.errores?.length ? ` Avisos: ${data.errores.join(' · ')}` : ''),
    });
    load();
  }

  // ---------------- Agregados ----------------
  const resumen = useMemo(() => {
    // Por llamada: suma de sus tramos (WebRTC + línea). CDR sin llamada
    // asociada se agrupan por su propio id.
    const porLlamada = new Map();
    let gasto = 0;
    rows.forEach((r) => {
      const key = r.call_id || `cdr:${r.cdr_id}`;
      const costo = Number(r.costo) || 0;
      gasto += costo;
      const cur = porLlamada.get(key) || {
        key,
        call_id: r.call_id,
        fecha: r.started_at,
        usuario: r.usuario,
        organizacion: r.organizacion,
        numero: r.numero,
        resultado: r.resultado,
        segundos: 0,
        costoWebrtc: 0,
        costoLinea: 0,
        total: 0,
      };
      if (r.record_type === 'webrtc') cur.costoWebrtc += costo;
      else cur.costoLinea += costo;
      cur.total += costo;
      // La duración facturada es la del tramo más largo (ambos tramos
      // cubren el mismo tiempo; sumarlos la duplicaría).
      cur.segundos = Math.max(cur.segundos, Number(r.segundos_facturados) || 0);
      if (r.started_at < cur.fecha) cur.fecha = r.started_at;
      porLlamada.set(key, cur);
    });
    const llamadas = [...porLlamada.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const segundos = llamadas.reduce((a, l) => a + l.segundos, 0);
    const minutos = segundos / 60;

    // Por día (serie completa, días sin gasto = 0)
    const porDia = {};
    for (let i = 0; i < dias; i++) porDia[isoDia(new Date(desde.getTime() + i * 86400000))] = { gasto: 0, segundos: 0 };
    llamadas.forEach((l) => {
      const d = (l.fecha || '').slice(0, 10);
      if (porDia[d]) {
        porDia[d].gasto += l.total;
        porDia[d].segundos += l.segundos;
      }
    });
    const serie = Object.entries(porDia).map(([dia, v]) => ({
      dia,
      gasto: v.gasto,
      costoMin: v.segundos > 0 ? v.gasto / (v.segundos / 60) : null,
    }));

    // Por usuario
    const porUsuario = {};
    llamadas.forEach((l) => {
      const k = l.usuario ? `${l.usuario}|${l.organizacion || ''}` : 'Sin asociar|';
      const u = porUsuario[k] || { usuario: l.usuario || 'Sin asociar', organizacion: l.organizacion || '—', llamadas: 0, segundos: 0, total: 0 };
      u.llamadas++;
      u.segundos += l.segundos;
      u.total += l.total;
      porUsuario[k] = u;
    });

    return {
      gasto,
      minutos,
      llamadas,
      costoMin: minutos > 0 ? gasto / minutos : 0,
      costoLlamada: llamadas.length ? gasto / llamadas.length : 0,
      serie,
      porUsuario: Object.values(porUsuario).sort((a, b) => b.total - a.total),
      sinAsociar: llamadas.filter((l) => !l.call_id).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dias]);

  const columnasLlamadas = [
    { key: 'fecha', label: 'Fecha', render: (l) => new Date(l.fecha).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }) },
    { key: 'usuario', label: 'Usuario', render: (l) => l.usuario || <span style={{ color: 'var(--color-text-tertiary)' }}>Sin asociar</span> },
    { key: 'organizacion', label: 'Organización', render: (l) => l.organizacion || '—' },
    { key: 'numero', label: 'Número', render: (l) => l.numero || '—' },
    { key: 'dur', label: 'Facturado', render: (l) => formatDur(l.segundos) },
    { key: 'webrtc', label: 'WebRTC', render: (l) => usd(l.costoWebrtc, 4) },
    { key: 'linea', label: 'Línea', render: (l) => usd(l.costoLinea, 4) },
    { key: 'total', label: 'Total', render: (l) => <strong>{usd(l.total, 4)}</strong> },
    { key: 'pormin', label: '$/min', render: (l) => (l.segundos > 0 ? usd(l.total / (l.segundos / 60), 4) : '—') },
  ];

  const columnasUsuarios = [
    { key: 'usuario', label: 'Usuario', render: (u) => u.usuario },
    { key: 'organizacion', label: 'Organización', render: (u) => u.organizacion },
    { key: 'llamadas', label: 'Llamadas', render: (u) => u.llamadas },
    { key: 'min', label: 'Min. facturados', render: (u) => (u.segundos / 60).toFixed(1) },
    { key: 'total', label: 'Gasto', render: (u) => <strong>{usd(u.total)}</strong> },
    { key: 'pormin', label: '$/min', render: (u) => (u.segundos > 0 ? usd(u.total / (u.segundos / 60), 4) : '—') },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em', marginBottom: 4 }}>Costos de Telnyx</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Gasto real reportado por Telnyx, por minuto y por llamada. Solo visible para el dueño.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select className="input" value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ height: 40 }}>
            {RANGOS.map((r) => (
              <option key={r.dias} value={r.dias}>{r.label}</option>
            ))}
          </select>
          <Button onClick={sincronizar} disabled={syncing}>{syncing ? 'Sincronizando…' : 'Sincronizar con Telnyx'}</Button>
        </div>
      </div>

      {syncMsg && (
        <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: syncMsg.tipo === 'error' ? 'var(--color-danger)' : syncMsg.tipo === 'aviso' ? 'var(--color-text-muted)' : 'var(--color-status-custom-text)' }}>
          {syncMsg.texto}
        </p>
      )}
      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Todavía no hay costos en este rango.</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Toca “Sincronizar con Telnyx” para traer los registros. Telnyx puede tardar unos minutos en publicar el costo de una llamada recién terminada.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <Kpi label="Gasto total" value={usd(resumen.gasto)} />
            <Kpi label="Minutos facturados" value={resumen.minutos.toLocaleString('es', { maximumFractionDigits: 1 })} />
            <Kpi label="Costo promedio por minuto" value={usd(resumen.costoMin, 4)} />
            <Kpi label="Costo promedio por llamada" value={usd(resumen.costoLlamada, 4)} />
            <Kpi label="Llamadas" value={resumen.llamadas.length} sub={resumen.sinAsociar ? `${resumen.sinAsociar} sin asociar` : null} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="card" style={{ padding: '1rem 1.1rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 650, marginBottom: 2 }}>Gasto por día</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>USD</p>
              <BarChart data={resumen.serie.map((d) => ({ x: d.dia, y: d.gasto }))} format={(v) => usd(v)} />
            </div>
            <div className="card" style={{ padding: '1rem 1.1rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 650, marginBottom: 2 }}>Costo por minuto</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>USD por minuto facturado, por día</p>
              <LineChart data={resumen.serie.map((d) => ({ x: d.dia, y: d.costoMin }))} format={(v) => usd(v, 4)} />
            </div>
          </div>

          <h2 style={{ fontSize: '1.05rem', fontWeight: 650, margin: '0.5rem 0 0.6rem' }}>Gasto por usuario</h2>
          <div style={{ marginBottom: '1.5rem' }}>
            <DataTable columns={columnasUsuarios} rows={resumen.porUsuario.map((u, i) => ({ ...u, id: i }))} emptyMessage="Sin datos." />
          </div>

          <h2 style={{ fontSize: '1.05rem', fontWeight: 650, margin: '0.5rem 0 0.6rem' }}>Gasto por llamada</h2>
          <DataTable columns={columnasLlamadas} rows={resumen.llamadas.map((l) => ({ ...l, id: l.key }))} emptyMessage="Sin llamadas." />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '0.6rem' }}>
            Cada llamada suma dos cargos de Telnyx: el tramo WebRTC (navegador) y el tramo de línea telefónica. “Sin asociar” = registros de Telnyx que no se pudieron enlazar con una llamada de la plataforma.
          </p>
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: '0.9rem 1rem' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ---------------- Gráficas (SVG, sin dependencias) ----------------
const W = 560;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 58 };

function ticksY(max) {
  if (!max || max <= 0) return [0];
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / paso;
  const unidad = n <= 2 ? paso / 2 : n <= 5 ? paso : paso * 2;
  const out = [];
  for (let v = 0; v <= max * 1.0001 + unidad; v += unidad) {
    out.push(v);
    if (v >= max) break;
  }
  return out;
}

function Ejes({ ticks, yMax, data, format }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const cada = Math.max(1, Math.ceil(data.length / 8));
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / yMax) * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--color-text-muted)">{format(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) =>
        i % cada === 0 ? (
          <text key={d.x} x={PAD.left + (i + 0.5) * (innerW / data.length)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
            {etiquetaDia(d.x)}
          </text>
        ) : null
      )}
    </g>
  );
}

function Tooltip({ hover }) {
  if (!hover) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${(hover.cx / W) * 100}%`,
        top: 0,
        transform: 'translateX(-50%)',
        background: 'var(--color-surface, var(--color-bg))',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '4px 8px',
        fontSize: 12,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ color: 'var(--color-text-muted)' }}>{etiquetaDia(hover.x)}</div>
      <div style={{ fontWeight: 650 }}>{hover.label}</div>
    </div>
  );
}

function BarChart({ data, format }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(0, ...data.map((d) => d.y || 0));
  const ticks = ticksY(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const bw = Math.max(2, Math.min(28, slot - 2));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gasto por día" onMouseLeave={() => setHover(null)}>
        <Ejes ticks={ticks} yMax={yMax} data={data} format={format} />
        {data.map((d, i) => {
          const h = ((d.y || 0) / yMax) * innerH;
          const cx = PAD.left + (i + 0.5) * slot;
          const y = PAD.top + innerH - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.x} onMouseEnter={() => setHover({ cx, x: d.x, label: format(d.y || 0) })}>
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - bw / 2},${PAD.top + innerH} V${y + r} Q${cx - bw / 2},${y} ${cx - bw / 2 + r},${y} H${cx + bw / 2 - r} Q${cx + bw / 2},${y} ${cx + bw / 2},${y + r} V${PAD.top + innerH} Z`}
                  fill="var(--color-primary)"
                  opacity={hover && hover.x !== d.x ? 0.55 : 1}
                />
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip hover={hover} />
    </div>
  );
}

function LineChart({ data, format }) {
  const [hover, setHover] = useState(null);
  const vals = data.map((d) => d.y).filter((v) => v != null);
  const max = Math.max(0, ...vals);
  const ticks = ticksY(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const pts = data.map((d, i) => ({
    ...d,
    cx: PAD.left + (i + 0.5) * slot,
    cy: d.y == null ? null : PAD.top + innerH - (d.y / yMax) * innerH,
  }));
  // Días sin llamadas no tienen costo por minuto: se corta la línea.
  let path = '';
  pts.forEach((p, i) => {
    if (p.cy == null) return;
    const prev = pts[i - 1];
    path += `${prev && prev.cy != null ? 'L' : 'M'}${p.cx},${p.cy} `;
  });
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Costo por minuto" onMouseLeave={() => setHover(null)}>
        <Ejes ticks={ticks} yMax={yMax} data={data} format={format} />
        {hover && <line x1={hover.cx} x2={hover.cx} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-text-muted)" strokeDasharray="3 3" strokeWidth={1} />}
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <g key={p.x} onMouseEnter={() => setHover({ cx: p.cx, x: p.x, label: p.y == null ? 'Sin llamadas' : `${format(p.y)} / min` })}>
            <rect x={p.cx - slot / 2} y={PAD.top} width={slot} height={innerH} fill="transparent" />
            {p.cy != null && (hover?.x === p.x || data.length <= 31) && (
              <circle cx={p.cx} cy={p.cy} r={hover?.x === p.x ? 5 : 3} fill="var(--color-primary)" stroke="var(--color-bg, #fff)" strokeWidth={2} />
            )}
          </g>
        ))}
      </svg>
      <Tooltip hover={hover} />
    </div>
  );
}