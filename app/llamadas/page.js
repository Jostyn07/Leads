'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import Button from '../../components/ui/button';
import Input from '../../components/ui/input';
import Modal from '../../components/ui/modal';
import CardMenu from '../../components/ui/cardMenu';
import DataTable from '../../components/tables/dataTable';
import CallInProgress from '../../components/telefonia/callInProgress';
import { RESULTADO_LABEL, RESULTADO_STYLE, pillStyle } from '../../lib/telefonia/resultados';

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function minutos(segundos) {
  return Math.round((segundos || 0) / 60);
}

function formatDuracion(segundos) {
  const s = segundos || 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fecha} · ${hora}`;
}

export default function LlamadasPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [usuarios, setUsuarios] = useState([]);

  const [calls, setCalls] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filterResultado, setFilterResultado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filterUsuario, setFilterUsuario] = useState('');

  const [stats, setStats] = useState(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [nuevaLlamadaOpen, setNuevaLlamadaOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadCalls();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, fechaDesde, fechaHasta, filterResultado, filterTipo, filterUsuario, currentUserId]);

  async function loadContext() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const admin = data?.role === 'admin';
    setIsAdmin(admin);
    if (admin) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setUsuarios(profiles ?? []);
    }
  }

  // Filtros comunes que aplican tanto a la lista paginada como a las
  // estadísticas (que se calculan sobre TODO lo que matchea, sin range).
  function applyFilters(query) {
    if (debouncedSearch.trim()) {
      query = query.ilike('numero', `%${debouncedSearch.trim().replace(/[%,]/g, '')}%`);
      // Nota: la búsqueda por nombre de lead no está incluida — PostgREST
      // no permite un .or() limpio contra una tabla relacionada (leads.name).
      // Si hace falta, se resuelve con una vista o función en Supabase.
    }
    if (fechaDesde) query = query.gte('created_at', `${fechaDesde}T00:00:00`);
    if (fechaHasta) query = query.lte('created_at', `${fechaHasta}T23:59:59`);
    if (filterResultado) query = query.eq('resultado', filterResultado);
    if (filterTipo) query = query.eq('tipo', filterTipo);
    if (isAdmin && filterUsuario) query = query.eq('user_id', filterUsuario);
    return query;
  }

  async function loadCalls() {
    setLoading(true);
    setErrorMsg(null);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('calls')
      .select(
        `id, tipo, numero, estado_tecnico, resultado, duracion_segundos, hora_inicio, created_at, user_id,
         leads ( id, name ),
         profiles ( full_name ),
         call_recordings ( disponible, duracion_segundos )`,
        { count: 'exact' }
      );

    query = applyFilters(query).order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      setErrorMsg(error.message);
    } else {
      setCalls(data ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }

  async function loadStats() {
    // Una sola consulta liviana (sin range) para calcular minutos
    // utilizados, duración promedio y grabaciones sobre TODO lo que
    // matchea los filtros actuales — no solo la página visible.
    let query = supabase.from('calls').select('duracion_segundos, call_recordings ( disponible )');
    query = applyFilters(query);
    const { data } = await query;
    const rows = data ?? [];

    const conectadas = rows.filter((r) => (r.duracion_segundos || 0) > 0);
    const minutosUtilizados = minutos(rows.reduce((sum, r) => sum + (r.duracion_segundos || 0), 0));
    const duracionPromedioSeg = conectadas.length
      ? Math.round(conectadas.reduce((sum, r) => sum + r.duracion_segundos, 0) / conectadas.length)
      : 0;
    const grabaciones = rows.filter((r) => {
      const rec = Array.isArray(r.call_recordings) ? r.call_recordings[0] : r.call_recordings;
      return rec?.disponible;
    }).length;

    const targetUserId = isAdmin ? filterUsuario : currentUserId;

    let minutosDisponibles = null;
    if (targetUserId) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('minutos_disponibles_segundos')
        .eq('id', targetUserId)
        .single();
      minutosDisponibles = minutos(perfil?.minutos_disponibles_segundos);
    }

    setStats({
      totalLlamadas: rows.length,
      minutosUtilizados,
      duracionPromedio: formatDuracion(duracionPromedioSeg),
      minutosDisponibles,
      grabaciones,
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showGlobalCard = isAdmin && !filterUsuario;

  const columns = [
    { key: 'fecha', label: 'Fecha y hora', render: (c) => formatFechaHora(c.created_at) },
    {
      key: 'lead',
      label: isAdmin && !filterUsuario ? 'Lead / Número · Usuario' : 'Lead / Número',
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.leads?.name || c.numero}</div>
          {c.tipo === 'lead' ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>{c.numero}</div>
          ) : (
            <span className="status-pill" style={{ ...pillStyle('none'), marginTop: 2 }}>Número externo</span>
          )}
          {isAdmin && !filterUsuario && (
            <div style={{ fontSize: '0.74rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{c.profiles?.full_name || '—'}</div>
          )}
        </div>
      ),
    },
    { key: 'duracion', label: 'Duración', render: (c) => formatDuracion(c.duracion_segundos) },
    {
      key: 'resultado',
      label: 'Resultado',
      render: (c) =>
        c.resultado ? (
          <span className="status-pill" style={pillStyle(RESULTADO_STYLE[c.resultado] || 'none')}>
            {RESULTADO_LABEL[c.resultado]}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.82rem' }}>—</span>
        ),
    },
    {
      key: 'grabacion',
      label: 'Grabación',
      render: (c) => {
        const rec = Array.isArray(c.call_recordings) ? c.call_recordings[0] : c.call_recordings;
        if (!rec?.disponible) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
        return (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6 }}
            title="Reproducción pendiente de conectar (requiere la Edge Function de grabaciones con signed URLs)"
          >
            <button className="btn btn-secondary" disabled style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>▶</button>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>0:00 / {formatDuracion(rec.duracion_segundos)}</span>
          </div>
        );
      },
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (c) => (
        <span className="status-pill" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', borderColor: 'transparent' }}>
          {c.tipo === 'lead' ? 'Lead' : 'Externa'}
        </span>
      ),
    },
    {
      key: 'acciones',
      label: '',
      render: (c) => (
        <CardMenu
          items={[
            { label: 'Ver detalle', onClick: () => (window.location.href = c.leads?.id ? `/leads/${c.leads.id}?tab=llamadas` : '#') },
            { label: 'Descargar grabación', onClick: () => alert('Pendiente de conectar la Edge Function de grabaciones.') },
          ]}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Llamadas</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Gestiona y consulta el historial de tus llamadas</p>
        </div>
        <Button onClick={() => setNuevaLlamadaOpen(true)}>📞 Nueva llamada</Button>
      </div>

      {!noticeDismissed && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '0.75rem 1rem',
            marginBottom: '1.1rem',
            background: 'var(--color-primary-soft)',
            border: 'none',
          }}
        >
          <span aria-hidden>ℹ️</span>
          <p style={{ fontSize: '0.85rem', flex: 1, color: 'var(--color-text)' }}>
            Todas las llamadas realizadas mediante esta plataforma son grabadas. Es responsabilidad del usuario informar a la persona contactada que la llamada está siendo grabada.
          </p>
          <button onClick={() => setNoticeDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)' }} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.1rem' }}>
          <StatCard icon="📞" value={stats.totalLlamadas} label={showGlobalCard ? 'Llamadas totales' : 'Mis llamadas'} />
          <StatCard icon="🕒" value={`${stats.minutosUtilizados} min`} label="Minutos utilizados" />
          {showGlobalCard ? (
            <StatCard icon="🎙️" value={stats.grabaciones} label="Grabaciones" />
          ) : (
            <StatCard icon="📊" value={stats.minutosDisponibles ?? '—'} label="Minutos disponibles" color="var(--color-status-custom-text)" />
          )}
          <StatCard icon="📈" value={stats.duracionPromedio} label="Duración promedio" />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: showMoreFilters ? '0.6rem' : '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>🔎</span>
          <Input placeholder="Buscar por número…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '2rem', height: 42 }} />
        </div>
        <Input type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} style={{ height: 42, width: 150 }} />
        <Input type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} style={{ height: 42, width: 150 }} />
        <select className="input" style={{ maxWidth: 190, height: 42 }} value={filterResultado} onChange={(e) => { setFilterResultado(e.target.value); setPage(1); }}>
          <option value="">Todos los resultados</option>
          {Object.entries(RESULTADO_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select className="input" style={{ maxWidth: 160, height: 42 }} value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }}>
          <option value="">Todas las llamadas</option>
          <option value="lead">Lead</option>
          <option value="externa">Externa</option>
        </select>
        {isAdmin && (
          <button className="btn btn-secondary" onClick={() => setShowMoreFilters((v) => !v)} style={{ marginLeft: 'auto' }}>
            ▤ Filtros
          </button>
        )}
      </div>

      {isAdmin && showMoreFilters && (
        <div style={{ marginBottom: '1rem' }}>
          <select className="input" style={{ maxWidth: 220, height: 42 }} value={filterUsuario} onChange={(e) => { setFilterUsuario(e.target.value); setPage(1); }}>
            <option value="">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.id}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <DataTable columns={columns} rows={calls} emptyMessage="No hay llamadas que coincidan con la búsqueda o los filtros." />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Mostrando {calls.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} de {totalCount} llamadas
            </span>

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.6rem' }}>←</button>
                <span style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}>{page} / {totalPages}</span>
                <button className="btn btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.6rem' }}>→</button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>por página</span>
              <select className="input" style={{ width: 80 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <NuevaLlamadaModal open={nuevaLlamadaOpen} onClose={() => setNuevaLlamadaOpen(false)} onStartCall={setActiveCall} />

      {activeCall && (
        <CallInProgress
          call={activeCall}
          onClose={() => setActiveCall(null)}
          onSaveResult={async ({ resultado, duracionSegundos }) => {
            // TODO: cuando exista el registro real de la llamada (creado al
            // conectar con Twilio), esto debe hacer un UPDATE de calls con
            // resultado + duracion_segundos + estado_tecnico='finalizada' en
            // vez de solo loguear — por ahora no hay fila que actualizar
            // porque la llamada nunca se marcó de verdad con Twilio.
            console.log('Resultado de llamada (pendiente de persistir):', resultado, duracionSegundos);
            loadCalls();
            loadStats();
          }}
        />
      )}
    </main>
  );
}

function StatCard({ icon, value, label, color }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 750, fontSize: '1.1rem', color: color || 'var(--color-text)' }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

// Marcar un número y llamar requiere el Voice SDK de Twilio (WebRTC) +
// la Edge Function que genera el Access Token — pendiente hasta que
// retomemos esa fase. Por ahora, "Llamar" abre la ventana de Llamada en
// curso directamente (sin conexión real) para poder ver y probar esa
// interfaz — onStartCall es lo único que hay que cambiar cuando el
// Voice SDK exista de verdad.
function NuevaLlamadaModal({ open, onClose, onStartCall }) {
  const [numero, setNumero] = useState('');

  function handleCall() {
    onStartCall({ name: null, numero });
    setNumero('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva llamada">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input label="Número de teléfono" placeholder="+1 305 555 1234" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>
          La ventana de llamada se abre para probar la interfaz — todavía no marca de verdad (falta el Voice SDK de Twilio).
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCall} disabled={!numero}>📞 Llamar</Button>
        </div>
      </div>
    </Modal>
  );
}