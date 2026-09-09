'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import { getInitials, getAvatarColors } from '../../../components/leads/avatarColor';
import Button from '../../../components/ui/button';
import Input from '../../../components/ui/input';
import Modal from '../../../components/ui/modal';
import CardMenu from '../../../components/ui/cardMenu';
import DataTable from '../../../components/tables/dataTable';

const TABS = [
  { href: '/settings/usuarios', label: 'Usuarios' },
  { href: '/settings/plantillas', label: 'Plantillas de permisos' },
  { href: '/settings/actividad', label: 'Registro de actividad' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function minutos(segundos) {
  return Math.round((segundos || 0) / 60);
}

function rolLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Agente';
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
  const [stats, setStats] = useState(null);

  const [editingUser, setEditingUser] = useState(null);
  const [addingMinutesTo, setAddingMinutesTo] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
    loadStats();
  }, []);

  async function loadTemplates() {
    const { data } = await supabase.from('call_permission_templates').select('id, nombre').order('nombre');
    setTemplates(data ?? []);
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
         plantilla_id, call_permission_templates ( id, nombre )`,
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
  }

  async function toggleLlamadas(user) {
    const { error } = await supabase
      .from('profiles')
      .update({ llamadas_habilitadas: !user.llamadas_habilitadas })
      .eq('id', user.id);
    if (!error) refresh();
  }

  async function saveEdit(updated) {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: updated.full_name,
        role: updated.role,
        estado: updated.estado,
        plantilla_id: updated.plantilla_id || null,
        llamadas_habilitadas: updated.llamadas_habilitadas,
        minutos_asignados_segundos: Math.round(Number(updated.minutos_asignados) || 0) * 60,
      })
      .eq('id', updated.id);

    if (!error) {
      setEditingUser(null);
      refresh();
    }
    return error;
  }

  async function saveAddMinutes(user, minutosAAgregar) {
    const nuevoTotal = (user.minutos_asignados_segundos || 0) + Math.round(Number(minutosAAgregar) || 0) * 60;
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
    { key: 'asignados', label: 'Min. asignados', render: (u) => minutos(u.minutos_asignados_segundos) },
    { key: 'utilizados', label: 'Min. utilizados', render: (u) => minutos(u.minutos_utilizados_segundos) },
    {
      key: 'disponibles',
      label: 'Min. disponibles',
      render: (u) => {
        const asignados = minutos(u.minutos_asignados_segundos);
        const utilizados = minutos(u.minutos_utilizados_segundos);
        const disponibles = minutos(u.minutos_disponibles_segundos);
        const pct = asignados > 0 ? Math.min(100, (utilizados / asignados) * 100) : 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span style={{ fontSize: '0.82rem', flexShrink: 0 }}>{disponibles}</span>
          </div>
        );
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
    { key: 'ultimo_acceso', label: 'Último acceso', render: () => <span style={{ color: 'var(--color-text-tertiary)' }}>—</span> },
    {
      key: 'acciones',
      label: '',
      render: (u) => (
        <CardMenu
          items={[
            { label: 'Editar usuario', onClick: () => setEditingUser(u) },
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

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <StatCard icon="👥" value={stats.total} label="Usuarios totales" />
          <StatCard icon="🟢" value={stats.activos} label="Usuarios activos" color="var(--color-status-custom-text)" />
          <StatCard icon="🔴" value={stats.inactivos} label="Usuarios inactivos" color="var(--color-status-error-text)" />
          <StatCard icon="📞" value={stats.conLlamadas} label="Con permisos de llamadas" />
          <StatCard icon="⏱️" value={stats.minutosAsignados.toLocaleString('es')} label="Minutos asignados" />
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
        onClose={() => setEditingUser(null)}
        onSave={saveEdit}
      />

      <AddMinutesModal
        user={addingMinutesTo}
        onClose={() => setAddingMinutesTo(null)}
        onSave={saveAddMinutes}
      />

      <CreateUserModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} templates={templates} />
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

function EditUserModal({ user, templates, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
      });
      setError(null);
    } else {
      setForm(null);
    }
  }, [user]);

  if (!user || !form) return null;

  async function handleSave() {
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!user} onClose={onClose} title="Editar usuario">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input label="Nombre completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />

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
          label="Minutos asignados"
          type="number"
          min={0}
          value={form.minutos_asignados}
          onChange={(e) => setForm({ ...form, minutos_asignados: e.target.value })}
        />

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function AddMinutesModal({ user, onClose, onSave }) {
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
          Actualmente tiene {minutos(user.minutos_asignados_segundos)} minutos asignados. Este valor se suma a lo que ya tiene.
        </p>
        <Input label="Minutos a agregar" type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)} />
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !valor}>{saving ? 'Guardando…' : 'Agregar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// Crear un usuario implica crear su cuenta de auth (auth.admin.createUser),
// lo cual requiere service_role — no se puede hacer desde el cliente con
// la anon key. Este modal queda listo visualmente; el submit se conecta a
// la Edge Function `admin-create-user` cuando la construyamos.
function CreateUserModal({ open, onClose, templates }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'user', plantilla_id: '', llamadas_habilitadas: true, minutos_asignados: 0 });
  const [notice, setNotice] = useState(null);

  function handleSubmit() {
    setNotice('Falta conectar esto a la Edge Function admin-create-user (pendiente — necesita service_role).');
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input label="Nombre completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Rol</span>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">Agente</option>
            <option value="admin">Administrador</option>
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

        <Input label="Minutos iniciales" type="number" min={0} value={form.minutos_asignados} onChange={(e) => setForm({ ...form, minutos_asignados: e.target.value })} />

        {notice && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{notice}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>Crear usuario</Button>
        </div>
      </div>
    </Modal>
  );
}