'use client';

import { useState } from 'react';
import Input from '../ui/input';
import Button from '../ui/button';

export default function LeadCreateForm({ onCreate, saving, errorMsg }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onCreate(
      {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
        email: email.trim() || null,
      },
      () => {
        // limpia el formulario solo si la creación fue exitosa
        setName('');
        setPhone('');
        setAddress('');
        setEmail('');
      }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Input label="Dirección (opcional)" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input
          label="Correo electrónico (opcional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{errorMsg}</p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? 'Creando…' : 'Crear lead'}
      </Button>
    </form>
  );
}