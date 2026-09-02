'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { readExcelFile } from '../../lib/excel/readExcel';
import { validateLeadRows } from '../../lib/validations/leads';

export default function ImportsPage() {
  const [fileName, setFileName] = useState(null);
  const [preview, setPreview] = useState(null); // { rows, total, validCount, invalidCount }
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setResult(null);
    setFileName(file.name);

    try {
      const { rows } = await readExcelFile(file);
      const validated = validateLeadRows(rows);
      setPreview(validated);
    } catch (err) {
      setErrorMsg('No se pudo leer el archivo: ' + err.message);
      setPreview(null);
    }
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setImporting(true);
    setErrorMsg(null);

    const validRows = preview.rows
      .filter((r) => r.valid)
      .map((r) => ({ name: r.name, phone: r.phone, address: r.address, email: r.email }));

    const { data, error } = await supabase.rpc('import_leads', {
      p_rows: validRows,
      p_file_name: fileName,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setResult(data);
      setPreview(null);
    }
    setImporting(false);
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Importar leads desde Excel</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
          Columnas esperadas: Nombre, Teléfono, Dirección (opcional), Correo electrónico (opcional).
        </p>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{errorMsg}</p>
      )}

      {preview && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Vista previa: {fileName}</h2>
          <p style={{ marginBottom: '1rem' }}>
            Registros encontrados: <strong>{preview.total}</strong> ·{' '}
            Válidos: <strong>{preview.validCount}</strong> ·{' '}
            Inválidos: <strong>{preview.invalidCount}</strong>
          </p>

          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.5rem' }}>Nombre</th>
                  <th style={{ padding: '0.5rem' }}>Teléfono</th>
                  <th style={{ padding: '0.5rem' }}>Dirección</th>
                  <th style={{ padding: '0.5rem' }}>Correo</th>
                  <th style={{ padding: '0.5rem' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.5rem' }}>{row.name || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>{row.phone || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>{row.address || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>{row.email || '—'}</td>
                    <td style={{ padding: '0.5rem', color: row.valid ? 'inherit' : 'var(--color-danger)' }}>
                      {row.valid ? 'Válido' : row.errors.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > 50 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              Mostrando los primeros 50 de {preview.total} registros.
            </p>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setPreview(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmImport}
              disabled={importing || preview.validCount === 0}
            >
              {importing ? 'Importando…' : `Importar ${preview.validCount} válidos`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Resultado de la importación</h2>
          <p>Total procesados: {result.total}</p>
          <p>Nuevos insertados: {result.inserted}</p>
          <p>Ya existentes (duplicados por teléfono): {result.duplicated}</p>
          <p>Inválidos: {result.invalid}</p>
          <a href="/leads" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
            Ver leads
          </a>
        </div>
      )}
    </main>
  );
}