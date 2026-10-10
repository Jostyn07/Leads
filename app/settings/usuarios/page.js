'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import { getInitials, getAvatarColors } from '../../../components/leads/avatarColor';
import Button from '../../../components/ui/button';
import Input from '../../../components/ui/input';
import Modal from '../../../components/ui/modal';
import CardMenu from '../../../components/ui/cardMenu';
import DataTable from '../../../components/tables/dataTable';

// mm:ss o h:mm:ss
function formatDuracion(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// "hace 5 min", "hace 2 h", "hace 3 d"
function haceCuanto(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const TABS = [
  { href: '/settings/usuarios', label: 'Usuarios' },
  { href: '/settings/numeros', label: 'Números' },
  { href: '/settings/plantillas', label: 'Plantillas de permisos' },
  { href: '/settings/actividad', label: 'Registro de actividad' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function minutos(segundos) {
  return Math.round((segundos || 0) / 60);
}

function rolLabel(role) {
  if (role === 'admin') return 'Administrador';
  if (role === 'owner') return 'Dueño';
  return 'Agente';
}

// (4) El owner asigna desde todo el catálogo de la organización. Un
// admin solo puede repartir entre sus agentes los números que a él
// mismo le fueron asignados -- myNumberIds llega null para el owner
// (sin restricción) y como Set para un admin.
function assignableNumbers(phoneNumbers, isOwner, myNumberIds) {
  if (isOwner || !myNumberIds) return phoneNumbers;
  return phoneNumbers.filter((n) => myNumberIds.has(n.id));
}

export default function UsuariosPage() {
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterPlantilla, setFilterPlantilla] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filterLlamadas, setFilterLlamadas] = useState('');

  const [templates, setTemplates] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [stats, setStats] = useState(null);

  // Contexto de "quién soy" -- lo usamos para dos restricciones nuevas:
  // (4) un admin solo puede asignarle a sus agentes números que a ÉL
  //     mismo le hayan sido asignados (no todo el catálogo).
  // (6) un admin no puede ponerle a nadie (ni a sí mismo) más minutos
  //     de los que el owner le asignó a él.
  // myNumberIds/myMinutosAsignados quedan en null para el owner
  // (sin restricción, ve/asigna todo el catálogo de su organización).
  const [currentUserId, setCurrentUserId] = useState(null);
  const [myNumberIds, setMyNumberIds] = useState(null);
  const [myMinutosAsignados, setMyMinutosAsignados] = useState(null);
  // Bolsa de minutos de la organización (en segundos). Los minutos se
  // asignan a la ORGANIZACIÓN (el dueño) y el admin los reparte entre su
  // equipo sin pasarse del total. null para el owner (él ve la bolsa de
  // cada organización en Configuración → Organizaciones).
  const [bolsa, setBolsa] = useState(null);

  const [editingUser, setEditingUser] = useState(null);
  const [addingMinutesTo, setAddingMinutesTo] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [changingPasswordFor, setChangingPasswordFor] = useState(null);

  useEffect(() => {
    loadContext();
  }, []);

  async function loadContext() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data } = await supabase.from('profiles').select('role, minutos_asignados_segundos').eq('id', user.id).single();
    if (data?.role === 'owner') {
      setIsOwner(true);
      const { data: orgs } = await supabase.from('organizations').select('id, name').order('name');
      setOrganizations(orgs ?? []);
    } else {
      setMyMinutosAsignados(data?.minutos_asignados_segundos || 0);
      if (data?.role === 'admin') {
        const { data: mine } = await supabase.from('user_phone_numbers').select('phone_number_id').eq('user_id', user.id);
        setMyNumberIds(new Set((mine ?? []).map((r) => r.phone_number_id)));
      }
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadUsers(page, pageSize, debouncedSearch, filterRole, filterEstado, filterPlantilla, filterLlamadas);
  }, [page, pageSize, debouncedSearch, filterRole, filterEstado, filterPlantilla, filterLlamadas]);

  useEffect(() => {
    loadTemplates();
    loadPhoneNumbers();
    loadStats();
  }, []);

  async function loadTemplates() {
    const { data } = await supabase.from('call_permission_templates').select('id, nombre').order('nombre');
    setTemplates(data ?? []);
  }

  async function loadPhoneNumbers() {
    // Solo los activos -- uno desactivado no debería poder asignarse a
    // usuarios nuevos, aunque los que ya lo tienen asignado lo conservan
    // (desactivar no borra la asignación, solo oculta la opción a futuro).
    const { data } = await supabase.from('phone_numbers').select('id, numero, etiqueta').eq('activo', true).order('numero');
    setPhoneNumbers(data ?? []);
  }

  // Los usuarios habitualmente son pocos (decenas, no miles), así que
  // los stats se calculan trayendo las columnas necesarias y sumando
  // en el cliente — no hace falta una función agregada en Supabase.
  async function loadStats() {
    const { data } = await supabase
      .from('profiles')
      .select('estado, llamadas_habilitadas, minutos_asignados_segundos');

    const rows = data ?? [];
    setStats({
      total: rows.length,
      activos: rows.filter((r) => r.estado === 'activo').length,
      inactivos: rows.filter((r) => r.estado === 'inactivo').length,
      conLlamadas: rows.filter((r) => r.llamadas_habilitadas).length,
      minutosAsignados: minutos(rows.reduce((sum, r) => sum + (r.minutos_asignados_segundos || 0), 0)),
    });
  }

  async function loadUsers(pageNum, size, searchTerm, role, estado, plantillaId, llamadas) {
    setLoading(true);
    setErrorMsg(null);

    const from = (pageNum - 1) * size;
    const to = from + size - 1;

    let query = supabase
      .from('profiles')
      .select(
        `id, full_name, role, estado, llamadas_habilitadas,
         minutos_asignados_segundos, minutos_utilizados_segundos, minutos_disponibles_segundos,
         plantilla_id, call_permission_templates!plantilla_id ( id, nombre ),
         organization_id, organizations ( id, name )`,
        { count: 'exact' }
      );

    if (searchTerm.trim()) {
      query = query.ilike('full_name', `%${searchTerm.trim().replace(/[%,]/g, '')}%`);
    }
    if (role) query = query.eq('role', role);
    if (estado) query = query.eq('estado', estado);
    if (plantillaId) query = query.eq('plantilla_id', plantillaId);
    if (llamadas) query = query.eq('llamadas_habilitadas', llamadas === 'si');

    query = query.order('full_name').range(from, to);

    const { data, error, count } = await query;

    if (error) {
      setErrorMsg(error.message);
    } else {
      setUsers(data ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }

  function refresh() {
    loadUsers(page, pageSize, debouncedSearch, filterRole, filterEstado, filterPlantilla, filterLlamadas);
    loadStats();
    loadBolsa();
  }

  async function loadBolsa() {
    const { data, error } = await supabase.rpc('org_minutos_resumen');
    if (error || !data?.length) {
      setBolsa(null);
      return;
    }
    const r = data[0];
    setBolsa({ total: Number(r.bolsa) || 0, repartido: Number(r.repartido) || 0, sinRepartir: Number(r.sin_repartir) || 0 });
  }

  // ------------------------------------------------------------------
  // TIEMPO REAL
  // - Llamadas en curso: filas de `calls` contestadas y sin hora_fin.
  //   { [user_id]: epoch ms de inicio }. El contador corre en el cliente.
  // - Cualquier cambio en profiles (minutos, estado, rol…) o en calls
  //   refresca la tabla y las tarjetas sin recargar la página.
  // ------------------------------------------------------------------
  const [enLlamada, setEnLlamada] = useState({});
  const [ahora, setAhora] = useState(Date.now());
  const refreshRef = useRef(null);
  refreshRef.current = refresh;

  // Última llamada terminada por usuario: { [user_id]: epoch ms }
  const [ultimaLlamada, setUltimaLlamada] = useState({});

  // Estado de llamada de cada usuario visible. Pasa por una función de la
  // base (security definer) porque la RLS de `calls` no deja al dueño ver
  // las llamadas de otras organizaciones — y solo devuelve user_id y
  // tiempos, nada del contenido de la llamada.
  async function loadEnLlamada() {
    const { data, error } = await supabase.rpc('usuarios_estado_llamada');
    if (error) return;
    const map = {};
    const ult = {};
    (data ?? []).forEach((r) => {
      if (r.en_llamada_desde) map[r.user_id] = new Date(r.en_llamada_desde).getTime();
      if (r.ultima_llamada) ult[r.user_id] = new Date(r.ultima_llamada).getTime();
    });
    setEnLlamada(map);
    setUltimaLlamada(ult);
  }

  useEffect(() => {
    loadEnLlamada();
    // Respaldo: aunque Realtime no entregue un evento (p. ej. llamadas de
    // otra organización que la RLS no deja ver), se consulta cada 5 s.
    const poll = setInterval(loadEnLlamada, 5000);
    let timer = null;
    const programar = () => {
      // Varios eventos seguidos (p. ej. fin de llamada + descuento de
      // minutos) se agrupan en un solo refresco.
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current?.(), 400);
    };
    const channel = supabase
      .channel('usuarios-tiempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        loadEnLlamada();
        programar();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'organizations' }, programar)
      .subscribe();
    return () => {
      clearInterval(poll);
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Reloj de 1 s solo mientras alguien está en llamada.
  const hayLlamadas = Object.keys(enLlamada).length > 0;
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), hayLlamadas ? 1000 : 30000);
    return () => clearInterval(id);
  }, [hayLlamadas]);

  // Segundos que lleva en llamada este usuario (0 si no está en llamada).
  function segEnCurso(u) {
    const ini = enLlamada[u.id];
    // Igual que Telnyx: minuto iniciado = minuto cobrado.
    const s = ini ? Math.max(0, Math.floor((ahora - ini) / 1000)) : 0;
    return s > 0 ? Math.ceil(s / 60) * 60 : 0;
  }

  useEffect(() => {
    if (currentUserId && !isOwner) loadBolsa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, isOwner]);

  async function toggleLlamadas(user) {
    const { error } = await supabase
      .from('profiles')
      .update({ llamadas_habilitadas: !user.llamadas_habilitadas })
      .eq('id', user.id);
    if (!error) refresh();
  }

  async function saveEdit(updated) {
    const payload = {
      full_name: updated.full_name,
      role: updated.role,
      estado: updated.estado,
      plantilla_id: updated.plantilla_id || null,
      llamadas_habilitadas: updated.llamadas_habilitadas,
      minutos_asignados_segundos: Math.round(Number(updated.minutos_asignados) || 0) * 60,
    };
    // Solo el owner puede mover a alguien de una organización a otra.
    if (isOwner && updated.organization_id) payload.organization_id = updated.organization_id;

    // (6) Un admin no puede ponerle a nadie más minutos de los que el
    // owner le asignó a él -- se valida también aquí (además de
    // deshabilitar el campo en la UI) porque el input del formulario
    // se puede editar igual si alguien manipula el DOM.
    // Tope = lo que ya tenía este usuario + lo que queda sin repartir en
    // la bolsa de la organización. La base de datos también lo valida.
    if (!isOwner && bolsa) {
      const tope = bolsa.sinRepartir + (updated.minutos_asignados_segundos_original || 0);
      if (payload.minutos_asignados_segundos > tope) {
        return { message: `No puedes asignar más de ${minutos(tope)} minutos a este usuario: la organización solo tiene ${minutos(bolsa.sinRepartir)} min sin repartir.` };
      }
    }

    const { data, error } = await supabase.from('profiles').update(payload).eq('id', updated.id).select('id');

    // RLS bloquea un UPDATE en silencio: si la fila no cumple la
    // policy, Postgres actualiza 0 filas SIN lanzar error. Sin este
    // chequeo, el modal se cerraba como si hubiera funcionado aunque
    // el cambio nunca se aplicara.
    if (!error && (!data || data.length === 0)) {
      return { message: 'No se pudo guardar — no tienes permiso para editar este usuario.' };
    }

    return error;
  }

  async function saveAddMinutes(user, minutosAAgregar) {
    const agregarSeg = Math.round(Number(minutosAAgregar) || 0) * 60;
    if (!isOwner && bolsa && agregarSeg > bolsa.sinRepartir) {
      return { message: `La organización solo tiene ${minutos(bolsa.sinRepartir)} min sin repartir.` };
    }
    const nuevoTotal = (user.minutos_asignados_segundos || 0) + agregarSeg;
    const { error } = await supabase
      .from('profiles')
      .update({ minutos_asignados_segundos: nuevoTotal })
      .eq('id', user.id);

    if (!error) {
      setAddingMinutesTo(null);
      refresh();
    }
    return error;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const columns = [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (u) => {
        const initials = getInitials(u.full_name || '?');
        const colors = getAvatarColors(u.full_name || '?');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: colors.bg,
                color: colors.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.78rem',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>{u.full_name || 'Sin nombre'}</div>
              {/* El email vive en auth.users, no en profiles — hace falta una
                  Edge Function con service_role (auth.admin) para traerlo.
                  Pendiente hasta la fase de Edge Functions. */}
              <div style={{ fontSize: '0.76rem', color: 'var(--color-text-tertiary)' }}>—</div>
            </div>
          </div>
        );
      },
    },
    { key: 'role', label: 'Rol', render: (u) => rolLabel(u.role) },
    ...(isOwner
      ? [
          {
            key: 'organizacion',
            label: 'Organización',
            render: (u) => u.organizations?.name || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>,
          },
        ]
      : []),
    {
      key: 'plantilla',
      label: 'Plantilla',
      render: (u) =>
        u.call_permission_templates?.nombre ? (
          <span className="status-pill" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)', borderColor: 'transparent' }}>
            {u.call_permission_templates.nombre}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.82rem' }}>Sin plantilla</span>
        ),
    },
    {
      key: 'llamadas',
      label: 'Llamadas',
      render: (u) => (
        <span
          className="status-pill"
          style={
            u.llamadas_habilitadas
              ? { background: 'var(--color-status-custom-bg)', color: 'var(--color-status-custom-text)', borderColor: 'var(--color-status-custom-border)' }
              : { background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', borderColor: 'var(--color-status-error-border)' }
          }
        >
          {u.llamadas_habilitadas ? 'Sí' : 'No'}
        </span>
      ),
    },
    // Saldo de minutos: cada llamada se lo va descontando (minuto completo,
    // como cobra Telnyx). Ya no se muestra "asignados" ni "utilizados".
    // Durante una llamada en curso baja en vivo; nunca baja de 0.
    {
      key: 'minutos',
      label: 'Minutos',
      render: (u) => {
        const saldo = Math.max(0, (u.minutos_asignados_segundos || 0) - segEnCurso(u));
        return <strong style={{ color: saldo < 60 ? 'var(--color-danger)' : undefined }}>{Math.floor(saldo / 60).toLocaleString('es')}</strong>;
      },
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (u) => (
        <span
          className="status-pill"
          style={
            u.estado === 'activo'
              ? { background: 'var(--color-status-custom-bg)', color: 'var(--color-status-custom-text)', borderColor: 'var(--color-status-custom-border)' }
              : { background: 'var(--color-status-none-bg)', color: 'var(--color-status-none-text)', borderColor: 'var(--color-status-none-border)' }
          }
        >
          {u.estado === 'activo' ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'en_llamada',
      label: 'Llamada',
      render: (u) =>
        enLlamada[u.id] ? (
          <span
            className="status-pill"
            title="En llamada ahora mismo"
            style={{ background: 'var(--color-status-error-bg, rgba(239,68,68,0.12))', color: 'var(--color-status-error-text, #ef4444)', borderColor: 'var(--color-status-error-border, rgba(239,68,68,0.35))', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', animation: 'pulseDot 1.2s ease-in-out infinite' }} />
            En llamada · {formatDuracion(segEnCurso(u))}
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              className="status-pill"
              style={{ background: 'var(--color-status-none-bg)', color: 'var(--color-status-none-text)', borderColor: 'var(--color-status-none-border)', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}
            >
              Sin llamada
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
              {ultimaLlamada[u.id] ? `Última: ${haceCuanto(ahora - ultimaLlamada[u.id])}` : 'Nunca ha llamado'}
            </span>
          </div>
        ),
    },
    { key: 'ultimo_acceso', label: 'Último acceso', render: () => <span style={{ color: 'var(--color-text-tertiary)' }}>—</span> },
    {
      key: 'acciones',
      label: '',
      render: (u) => (
        <CardMenu
          items={[
            { label: 'Editar usuario', onClick: () => setEditingUser(u) },
            { label: 'Cambiar contraseña', onClick: () => setChangingPasswordFor(u) },
            { label: u.llamadas_habilitadas ? 'Desactivar llamadas' : 'Activar llamadas', onClick: () => toggleLlamadas(u) },
            { label: 'Agregar minutos', onClick: () => setAddingMinutesTo(u) },
            { label: 'Ver estadísticas', onClick: () => (window.location.href = `/llamadas?usuario=${u.id}`) },
          ]}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Usuarios</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Gestiona los usuarios y sus permisos</p>
          {isOwner && (
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
              Para crear una organización nueva (y su primer administrador), ve a{' '}
              <a href="/settings/organizaciones" style={{ color: 'var(--color-primary)' }}>Configuración → Organizaciones</a>.
            </p>
          )}
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>+ Nuevo usuario</Button>
      </div>

      <div className="tabs-bar">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} className={`tab-link${t.href === '/settings/usuarios' ? ' active' : ''}`}>
            {t.label}
          </a>
        ))}
      </div>

      <style>{'@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.25}}'}</style>
      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <StatCard icon="👥" value={stats.total} label="Usuarios totales" />
          <StatCard icon="🟢" value={stats.activos} label="Usuarios activos" color="var(--color-status-custom-text)" />
          <StatCard icon="🔴" value={stats.inactivos} label="Usuarios inactivos" color="var(--color-status-error-text)" />
          <StatCard
            icon="📞"
            value={hayLlamadas ? `${Object.keys(enLlamada).length} en llamada` : stats.conLlamadas}
            label={hayLlamadas ? `de ${stats.conLlamadas} con permisos de llamadas` : 'Con permisos de llamadas'}
            color={hayLlamadas ? 'var(--color-status-error-text, #ef4444)' : undefined}
          />
          {bolsa ? (
            <StatCard
              icon="⏱️"
              value={`${minutos(bolsa.sinRepartir).toLocaleString('es')} / ${minutos(bolsa.total).toLocaleString('es')}`}
              label="Min. sin repartir / bolsa de la organización"
            />
          ) : (
            <StatCard icon="⏱️" value={stats.minutosAsignados.toLocaleString('es')} label="Minutos en saldo de los usuarios" />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: showMoreFilters ? '0.6rem' : '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 300, maxWidth: '100%' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>🔎</span>
          <Input placeholder="Buscar por nombre…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '2rem', height: 42 }} />
        </div>
        <select className="input" style={{ maxWidth: 170, height: 42 }} value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}>
          <option value="">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="user">Agente</option>
        </select>
        <select className="input" style={{ maxWidth: 170, height: 42 }} value={filterEstado} onChange={(e) => { setFilterEstado(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
        <select className="input" style={{ maxWidth: 190, height: 42 }} value={filterPlantilla} onChange={(e) => { setFilterPlantilla(e.target.value); setPage(1); }}>
          <option value="">Todas las plantillas</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={() => setShowMoreFilters((v) => !v)} style={{ marginLeft: 'auto' }}>
          ▤ Filtros
        </button>
      </div>

      {showMoreFilters && (
        <div style={{ marginBottom: '1rem' }}>
          <select className="input" style={{ maxWidth: 190, height: 42 }} value={filterLlamadas} onChange={(e) => { setFilterLlamadas(e.target.value); setPage(1); }}>
            <option value="">Llamadas: todas</option>
            <option value="si">Llamadas: Sí</option>
            <option value="no">Llamadas: No</option>
          </select>
        </div>
      )}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <DataTable columns={columns} rows={users} emptyMessage="No hay usuarios que coincidan con la búsqueda o los filtros." />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Mostrando {users.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} de {totalCount} usuarios
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

      <EditUserModal
        user={editingUser}
        templates={templates}
        organizations={organizations}
        phoneNumbers={phoneNumbers}
        isOwner={isOwner}
        currentUserId={currentUserId}
        myNumberIds={myNumberIds}
        myMinutosAsignados={myMinutosAsignados}
        bolsa={bolsa}
        onClose={() => setEditingUser(null)}
        onSave={saveEdit}
        onSaved={refresh}
      />

      <AddMinutesModal
        user={addingMinutesTo}
        onClose={() => setAddingMinutesTo(null)}
        onSave={saveAddMinutes}
        bolsa={isOwner ? null : bolsa}
      />

      <ChangePasswordModal
        user={changingPasswordFor}
        onClose={() => setChangingPasswordFor(null)}
      />

      <CreateUserModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        templates={templates}
        phoneNumbers={phoneNumbers}
        organizations={organizations}
        isOwner={isOwner}
        myNumberIds={myNumberIds}
        myMinutosAsignados={myMinutosAsignados}
        bolsa={bolsa}
        onCreated={refresh}
      />
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

function EditUserModal({ user, templates, organizations, phoneNumbers, isOwner, currentUserId, myNumberIds, myMinutosAsignados, bolsa, onClose, onSave, onSaved }) {
  // Tope de minutos para ESTE usuario = lo que ya tiene + lo sin repartir.
  const topeMinSeg = bolsa ? bolsa.sinRepartir + (user?.minutos_asignados_segundos || 0) : null;
  const [form, setForm] = useState(null);
  const [selectedNumeroIds, setSelectedNumeroIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // (owner multi-org) el catálogo global (`phoneNumbers`) que llega
  // como prop está filtrado por RLS a la organización DEL OWNER, no a
  // la del usuario que se está editando -- si el owner administra
  // varias organizaciones, eso mostraba números de una organización
  // distinta a la del usuario, y por eso el guardado se rechazaba
  // (con toda razón: un número de la organización A no se le puede
  // asignar a alguien de la organización B). Para el owner, el
  // catálogo se recarga según `form.organization_id`.
  const [ownerOrgNumbers, setOwnerOrgNumbers] = useState(null);

  useEffect(() => {
    if (user) {
      setForm({
        id: user.id,
        full_name: user.full_name || '',
        role: user.role,
        estado: user.estado,
        plantilla_id: user.plantilla_id || '',
        llamadas_habilitadas: user.llamadas_habilitadas,
        minutos_asignados: minutos(user.minutos_asignados_segundos),
        minutos_asignados_segundos_original: user.minutos_asignados_segundos || 0,
        organization_id: user.organization_id || '',
      });
      setError(null);

      supabase
        .from('user_phone_numbers')
        .select('phone_number_id')
        .eq('user_id', user.id)
        .then(({ data }) => setSelectedNumeroIds(new Set((data ?? []).map((r) => r.phone_number_id))));
    } else {
      setForm(null);
      setSelectedNumeroIds(new Set());
      setOwnerOrgNumbers(null);
    }
  }, [user]);

  useEffect(() => {
    if (!isOwner || !form?.organization_id) {
      setOwnerOrgNumbers(null);
      return;
    }
    supabase
      .from('phone_numbers')
      .select('id, numero, etiqueta')
      .eq('activo', true)
      .eq('organization_id', form.organization_id)
      .order('numero')
      .then(({ data }) => setOwnerOrgNumbers(data ?? []));
  }, [isOwner, form?.organization_id]);

  if (!user || !form) return null;

  const options = isOwner ? ownerOrgNumbers ?? [] : assignableNumbers(phoneNumbers, isOwner, myNumberIds);
  // Con la bolsa por organización, el admin SÍ puede cambiar sus propios
  // minutos: el tope es la bolsa (lo que ya tiene + lo sin repartir), y
  // la base de datos lo valida igual. Solo se bloquea si no hay bolsa
  // cargada (sin tope conocido).
  const minutosLocked = !isOwner && user.id === currentUserId && !bolsa;

  function toggleNumero(id) {
    setSelectedNumeroIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const err = await onSave(form);
    if (err) {
      setSaving(false);
      setError(err.message);
      return;
    }

    // Los números se guardan aparte del resto del perfil -- es una
    // tabla distinta (user_phone_numbers), así que se sincroniza por
    // diferencia: qué se agregó y qué se quitó desde que se abrió el
    // modal. A diferencia de antes, el modal ya NO se cierra hasta que
    // esto también termine bien -- si algo falla (ej. RLS bloqueando
    // el insert), el error queda visible aquí mismo en vez de perderse
    // en silencio después de que el modal ya se cerró.
    const { data: current } = await supabase.from('user_phone_numbers').select('phone_number_id').eq('user_id', user.id);
    const currentIds = new Set((current ?? []).map((r) => r.phone_number_id));

    const toAdd = [...selectedNumeroIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !selectedNumeroIds.has(id));

    if (toAdd.length > 0) {
      const { error: addError } = await supabase
        .from('user_phone_numbers')
        .insert(toAdd.map((phone_number_id) => ({ user_id: user.id, phone_number_id })));
      if (addError) {
        setSaving(false);
        setError(`El resto de los cambios se guardó, pero no se pudo asignar el número: ${addError.message}`);
        return;
      }
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('user_phone_numbers').delete().eq('user_id', user.id).in('phone_number_id', toRemove);
      if (removeError) {
        setSaving(false);
        setError(`El resto de los cambios se guardó, pero no se pudo quitar el número: ${removeError.message}`);
        return;
      }
    }

    setSaving(false);
    onClose();
    onSaved?.();
  }

  return (
    <Modal open={!!user} onClose={onClose} title="Editar usuario">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input label="Nombre completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />

        {isOwner && (
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Organización</span>
            <select className="input" value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })}>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Rol</span>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">Agente</option>
            <option value="admin">Administrador</option>
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Estado</span>
          <select className="input" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Plantilla</span>
          <select className="input" value={form.plantilla_id} onChange={(e) => setForm({ ...form, plantilla_id: e.target.value })}>
            <option value="">Sin plantilla</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={form.llamadas_habilitadas}
            onChange={(e) => setForm({ ...form, llamadas_habilitadas: e.target.checked })}
          />
          Llamadas habilitadas
        </label>

        <Input
          label="Minutos (saldo)"
          type="number"
          min={0}
          max={topeMinSeg != null ? minutos(topeMinSeg) : undefined}
          value={form.minutos_asignados}
          disabled={minutosLocked}
          onChange={(e) => setForm({ ...form, minutos_asignados: e.target.value })}
        />
        {!isOwner && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: -6 }}>
            {minutosLocked
              ? 'No se pudo cargar la bolsa de la organización; recarga la página.'
              : topeMinSeg != null
                ? `Es el saldo que le queda. Máximo ${minutos(topeMinSeg)} min (la organización tiene ${minutos(bolsa.sinRepartir)} min sin repartir). Si lo bajas, la diferencia vuelve a la bolsa; lo ya consumido no se puede recuperar.`
                : ''}
          </p>
        )}

        <div>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Números para llamar (caller ID)</span>
          {isOwner && ownerOrgNumbers === null ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Cargando catálogo…</p>
          ) : options.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              {isOwner
                ? 'Esta organización todavía no tiene números en su catálogo — agrégalos desde la pestaña "Números" mientras administras esa organización.'
                : 'Todavía no tienes ningún número asignado a ti mismo — pídele al dueño que te asigne uno antes de repartirlo.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem' }}>
              {options.map((n) => (
                <label key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={selectedNumeroIds.has(n.id)} onChange={() => toggleNumero(n.id)} />
                  {n.numero}{n.etiqueta ? ` — ${n.etiqueta}` : ''}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function AddMinutesModal({ user, onClose, onSave, bolsa }) {
  const [valor, setValor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setValor('');
    setError(null);
  }, [user]);

  if (!user) return null;

  async function handleSave() {
    setSaving(true);
    const err = await onSave(user, valor);
    setSaving(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!user} onClose={onClose} title={`Agregar minutos a ${user.full_name || 'usuario'}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Actualmente le quedan {Math.floor((user.minutos_asignados_segundos || 0) / 60)} minutos. Este valor se suma a lo que le queda.
        </p>
        {bolsa && (
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>
            La organización tiene {minutos(bolsa.sinRepartir)} min sin repartir de una bolsa de {minutos(bolsa.total)} min.
          </p>
        )}
        <Input label="Minutos a agregar" type="number" min={0} max={bolsa ? minutos(bolsa.sinRepartir) : undefined} value={valor} onChange={(e) => setValor(e.target.value)} />
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !valor}>{saving ? 'Guardando…' : 'Agregar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// Crear un usuario implica crear su cuenta de auth (auth.admin.inviteUserByEmail),
// lo cual requiere service_role -- por eso pasa por la Edge Function
// admin-create-user en vez de un insert directo desde el cliente.
function CreateUserModal({ open, onClose, templates, phoneNumbers, organizations, isOwner, myNumberIds, myMinutosAsignados, bolsa, onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'user', plantilla_id: '', llamadas_habilitadas: true, minutos_asignados: 0, organization_id: '' });
  const [selectedNumeroIds, setSelectedNumeroIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Mismo fix que en EditUserModal: para el owner, el catálogo debe
  // ser el de la organización elegida para este usuario nuevo, no el
  // de la propia organización del owner.
  const [ownerOrgNumbers, setOwnerOrgNumbers] = useState(null);

  useEffect(() => {
    if (!isOwner || !form.organization_id) {
      setOwnerOrgNumbers(null);
      return;
    }
    supabase
      .from('phone_numbers')
      .select('id, numero, etiqueta')
      .eq('activo', true)
      .eq('organization_id', form.organization_id)
      .order('numero')
      .then(({ data }) => setOwnerOrgNumbers(data ?? []));
  }, [isOwner, form.organization_id]);

  const options = isOwner ? ownerOrgNumbers ?? [] : assignableNumbers(phoneNumbers, isOwner, myNumberIds);

  function toggleNumero(id) {
    setSelectedNumeroIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Nombre y email son obligatorios.');
      return;
    }
    if (isOwner && !form.organization_id) {
      setError('Elige a qué organización pertenece este usuario.');
      return;
    }
    // (6) Mismo tope que en edición: un admin no puede repartir más
    // minutos de los que el owner le asignó a él.
    if (!isOwner && bolsa && Math.round(Number(form.minutos_asignados) || 0) * 60 > bolsa.sinRepartir) {
      setError(`La organización solo tiene ${minutos(bolsa.sinRepartir)} min sin repartir.`);
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: { ...form, phone_number_ids: [...selectedNumeroIds] },
    });

    setSaving(false);

    if (fnError || data?.error) {
      // El mensaje genérico de Supabase ("Edge Function returned a
      // non-2xx status code") no dice el motivo real -- el cuerpo con
      // el mensaje específico de admin-create-user viene en
      // fnError.context, no en fnError.message. Mismo parche que ya
      // tiene fetchToken() en lib/telnyx/client.js.
      let detail = data?.error || fnError?.message;
      if (fnError?.context) {
        try {
          const body = await fnError.context.json();
          if (body?.error) detail = body.error;
        } catch {
          // Si el cuerpo no se puede leer como JSON, nos quedamos con
          // el mensaje genérico -- mejor eso que romper aquí.
        }
      }
      setError(detail);
      return;
    }

    setForm({ full_name: '', email: '', role: 'user', plantilla_id: '', llamadas_habilitadas: true, minutos_asignados: 0, organization_id: '' });
    setSelectedNumeroIds(new Set());
    onCreated?.();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input label="Nombre completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        {isOwner ? (
          <>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Organización</span>
              <select className="input" value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })}>
                <option value="">Selecciona una organización</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>
              Como dueño, los usuarios que crees siempre quedan como Administrador de esa organización — para agentes, pídele al administrador de la organización que los cree él.
            </p>
          </>
        ) : (
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Rol</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Agente</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        )}

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Plantilla</span>
          <select className="input" value={form.plantilla_id} onChange={(e) => setForm({ ...form, plantilla_id: e.target.value })}>
            <option value="">Sin plantilla</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={form.llamadas_habilitadas}
            onChange={(e) => setForm({ ...form, llamadas_habilitadas: e.target.checked })}
          />
          Llamadas habilitadas
        </label>

        <Input
          label="Minutos iniciales"
          type="number"
          min={0}
          max={!isOwner && bolsa ? minutos(bolsa.sinRepartir) : undefined}
          value={form.minutos_asignados}
          onChange={(e) => setForm({ ...form, minutos_asignados: e.target.value })}
        />
        {!isOwner && bolsa && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', marginTop: -6 }}>
            La organización tiene {minutos(bolsa.sinRepartir)} min sin repartir.
          </p>
        )}

        <div>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Números para llamar (caller ID)</span>
          {isOwner && !form.organization_id ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Elige primero la organización.</p>
          ) : isOwner && ownerOrgNumbers === null ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Cargando catálogo…</p>
          ) : options.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              {isOwner
                ? 'Esta organización todavía no tiene números en su catálogo — agrégalos desde la pestaña "Números" mientras la administras.'
                : 'Todavía no tienes ningún número asignado a ti mismo — pídele al dueño que te asigne uno antes de repartirlo.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem' }}>
              {options.map((n) => (
                <label key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={selectedNumeroIds.has(n.id)} onChange={() => toggleNumero(n.id)} />
                  {n.numero}{n.etiqueta ? ` — ${n.etiqueta}` : ''}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>
          Se le envía un correo de invitación para que defina su propia contraseña.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Creando…' : 'Crear usuario'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// (3) El admin/owner cambia directamente la contraseña de un agente
// (no envía un correo de recuperación) -- por eso necesita
// service_role (auth.admin.updateUserById), y por eso pasa por una
// Edge Function nueva en vez de una llamada directa desde el cliente:
// mismo patrón que admin-create-user.
function ChangePasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPassword('');
    setConfirm('');
    setError(null);
    setDone(false);
  }, [user]);

  if (!user) return null;

  async function handleSave() {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke('admin-set-user-password', {
      body: { user_id: user.id, new_password: password },
    });

    setSaving(false);

    if (fnError || data?.error) {
      // Mismo parche que ya tiene fetchToken() en lib/telnyx/client.js y
      // handleSubmit() en CreateUserModal -- el mensaje real viene en
      // fnError.context, no en fnError.message.
      let detail = data?.error || fnError?.message;
      if (fnError?.context) {
        try {
          const body = await fnError.context.json();
          if (body?.error) detail = body.error;
        } catch {
          // Si el cuerpo no se puede leer como JSON, nos quedamos con
          // el mensaje genérico.
        }
      }
      setError(detail);
      return;
    }

    setDone(true);
  }

  return (
    <Modal open={!!user} onClose={onClose} title={`Cambiar contraseña de ${user.full_name || 'usuario'}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {done ? (
          <p style={{ fontSize: '0.88rem' }}>
            Contraseña actualizada. Avísale a {user.full_name || 'la persona'} para que la use en su próximo ingreso.
          </p>
        ) : (
          <>
            <Input label="Nueva contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input label="Confirmar contraseña" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
          </>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>{done ? 'Cerrar' : 'Cancelar'}</Button>
          {!done && (
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}