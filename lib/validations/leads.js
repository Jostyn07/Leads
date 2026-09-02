// Validaciones de una fila de lead, usadas tanto en el formulario
// individual como en la vista previa de importación de Excel.

export function validateLeadRow(row) {
  const errors = [];

  const name = (row.name ?? row.nombre ?? '').toString().trim();
  const phone = (row.phone ?? row.telefono ?? '').toString().trim();
  const address = (row.address ?? row.direccion ?? '').toString().trim() || null;
  const email = (row.email ?? row.correo ?? '').toString().trim() || null;

  if (!name) errors.push('Falta el nombre');
  if (!phone) errors.push('Falta el teléfono');
  // El correo es opcional: si viene, se valida el formato básico;
  // si no viene, queda como null sin generar error.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Correo con formato inválido');
  }

  return {
    name,
    phone,
    address,
    email,
    valid: errors.length === 0,
    errors,
  };
}

export function validateLeadRows(rows) {
  const validated = rows.map(validateLeadRow);
  return {
    rows: validated,
    total: validated.length,
    validCount: validated.filter((r) => r.valid).length,
    invalidCount: validated.filter((r) => !r.valid).length,
  };
}