'use client';

import { useState } from 'react';
import Input from '../ui/input';
import Button from '../ui/button';

export default function LeadDetailForm({ lead, onSave, saving }) {
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone);
  const [address, setAddress] = useState(lead.address || '');
  const [email, setEmail] = useState(lead.email || '');

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || null,
      email: email.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
      <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      <Input label="Dirección (opcional)" value={address} onChange={(e) => setAddress(e.target.value)} />
      <Input
        label="Correo electrónico (opcional)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" disabled={saving} style={{ justifySelf: 'start' }}>
        {saving ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  );
}