'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
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

export default function PlantillasPage() {
  const [templates, setTemplates] = useState([]);
  const [usageByTemplate, setUsageByTemplate] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [editingTemplate, setEditingTemplate] = useState(null); // null = cerrado, {} = crear, {id,...} = editar
  const [deletingTemplate, setDeletingTemplate] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: templatesData, error: templatesError }, { data: profilesData }] = await Promise.all([
      supabase.from('call_permission_templates').select('id, nombre, llamadas_habilitadas, created_at').order('nombre'),
      supabase.from('profiles').select('plantilla_id'),
    ]);

    if (templatesError) {
      setErrorMsg(templatesError.message);
    } else {
      setTemplates(templatesData ?? []);
      // Cuántos usuarios tiene asignada cada plantilla — calculado en el
      // cliente, igual que los stats de Usuarios (son pocas filas).
      const counts = {};
      (profilesData ?? []).forEach((p) => {
        if (p.plantilla_id) counts[p.plantilla_id] = (counts[p.plantilla_id] || 0) + 1;
      });
      setUsageByTemplate(counts);
    }
    setLoading(false);
  }

  async function handleSave(form) {
    const payload = { nombre: form.nombre.trim(), llamadas_habilitadas: form.llamadas_habilitadas };

    const { error } = form.id
      ? await supabase.from('call_permission_templates').update(payload).eq('id', form.id)
      : await supabase.from('call_permission_templates').insert(payload);

    if (!error) {
      setEditingTemplate(null);
      load();
    }
    return error;
  }

  async function handleDelete(template) {
    const { error } = await supabase.from('call_permission_templates').delete().eq('id', template.id);
    if (!error) {
      setDeletingTemplate(null);
      load();
    }
    return error;
  }

  const columns = [
    { key: 'nombre', label: 'Nombre', render: (t) => <span style={{ fontWeight: 600 }}>{t.nombre}</span> },
    {
      key: 'llamadas',
      label: 'Llamadas',
      render: (t) => (
        <span
          className="status-pill"
          style={
            t.llamadas_habilitadas
              ? { background: 'var(--color-status-custom-bg)', color: 'var(--color-status-custom-text)', borderColor: 'var(--color-status-custom-border)' }
              : { background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', borderColor: 'var(--color-status-error-border)' }
          }
        >
          {t.llamadas_habilitadas ? 'Sí' : 'No'}
        </span>
      ),
    },
    {
      key: 'usuarios',
      label: 'Usuarios asignados',
      render: (t) => usageByTemplate[t.id] || 0,
    },
    {
      key: 'acciones',
      label: '',
      render: (t) => (
        <CardMenu
          items={[
            { label: 'Editar plantilla', onClick: () => setEditingTemplate(t) },
            { label: 'Eliminar plantilla', onClick: () => setDeletingTemplate(t), danger: true },
          ]}
        />
      ),
    },
  ];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 750, letterSpacing: '-0.02em' }}>Plantillas de permisos</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Grupos reutilizables de permisos — por ahora, solo "Llamadas" (punto 9 del doc: sin permisos separados de historial/grabaciones/descargas).
          </p>
        </div>
        <Button onClick={() => setEditingTemplate({})}>+ Nueva plantilla</Button>
      </div>

      <div className="tabs-bar">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} className={`tab-link${t.href === '/settings/plantillas' ? ' active' : ''}`}>
            {t.label}
          </a>
        ))}
      </div>

      {errorMsg && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>}

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <DataTable columns={columns} rows={templates} emptyMessage="Todavía no hay plantillas. Crea la primera con “+ Nueva plantilla”." />
      )}

      <TemplateModal template={editingTemplate} onClose={() => setEditingTemplate(null)} onSave={handleSave} />

      <ConfirmDeleteModal
        template={deletingTemplate}
        usageCount={deletingTemplate ? usageByTemplate[deletingTemplate.id] || 0 : 0}
        onClose={() => setDeletingTemplate(null)}
        onConfirm={handleDelete}
      />
    </main>
  );
}

function TemplateModal({ template, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (template) {
      setForm({
        id: template.id || null,
        nombre: template.nombre || '',
        llamadas_habilitadas: template.llamadas_habilitadas ?? true,
      });
      setError(null);
    } else {
      setForm(null);
    }
  }, [template]);

  if (!template || !form) return null;

  async function handleSave() {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!template} onClose={onClose} title={form.id ? 'Editar plantilla' : 'Nueva plantilla'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Input
          label="Nombre"
          placeholder="Ej. Agente estándar"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={form.llamadas_habilitadas}
            onChange={(e) => setForm({ ...form, llamadas_habilitadas: e.target.checked })}
          />
          Llamadas habilitadas
        </label>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({ template, usageCount, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!template) return null;

  async function handleConfirm() {
    setDeleting(true);
    const err = await onConfirm(template);
    setDeleting(false);
    if (err) setError(err.message);
  }

  return (
    <Modal open={!!template} onClose={onClose} title="Eliminar plantilla">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.9rem' }}>
          ¿Eliminar <strong>{template.nombre}</strong>?
        </p>
        {usageCount > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-status-default-text)' }}>
            {usageCount} usuario{usageCount === 1 ? '' : 's'} tiene{usageCount === 1 ? '' : 'n'} esta plantilla asignada — quedará{usageCount === 1 ? '' : 'n'} sin plantilla, no se les quita el permiso de llamadas que ya tengan.
          </p>
        )}
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={deleting}>{deleting ? 'Eliminando…' : 'Eliminar'}</Button>
        </div>
      </div>
    </Modal>
  );
}