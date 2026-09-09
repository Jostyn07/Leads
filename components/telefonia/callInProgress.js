'use client';

import { useEffect, useRef, useState } from 'react';
import { getInitials, getAvatarColors } from '../leads/avatarColor';
import { RESULTADO_LABEL, RESULTADO_STYLE, pillStyle } from '../../lib/telefonia/resultados';

const STATUS_LABEL = {
  iniciando: 'Iniciando…',
  sonando: 'Sonando…',
  conectada: 'Llamada en curso',
  finalizando: 'Finalizando…',
};

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/**
 * Ventana flotante de llamada. Hoy es una cáscara visual completa —
 * mute/teclado/altavoz no tocan audio real todavía porque no existe el
 * objeto Call del Voice SDK de Twilio. Cuando conectemos esa fase:
 *   - `status` debe venerar de los eventos reales del Device de Twilio
 *     (device.on('connect'), call.on('ringing'), etc.) en vez del valor
 *     por defecto 'conectada' que usamos acá.
 *   - los botones de silencio/altavoz deben llamar a call.mute(bool) /
 *     al output device real, marcados con TODO abajo.
 *   - el teclado debe llamar a call.sendDigits(digit).
 *   - onSaveResult debe insertar en la tabla `calls` (y su fila en
 *     call_recordings cuando el webhook de Twilio la entregue), en vez
 *     de solo recibir el callback.
 */
export default function CallInProgress({ call, status = 'conectada', onClose, onSaveResult }) {
  const [phase, setPhase] = useState('llamada'); // 'llamada' | 'resultado'
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (phase === 'llamada' && status === 'conectada') {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [phase, status]);

  const initials = getInitials(call.name || call.numero || '?');
  const colors = getAvatarColors(call.name || call.numero || '?');

  function handleFinalizar() {
    clearInterval(intervalRef.current);
    setPhase('resultado');
  }

  function handleClose() {
    if (phase === 'llamada') {
      const ok = window.confirm('¿Finalizar la llamada?');
      if (!ok) return;
    }
    onClose?.();
  }

  async function handleGuardarResultado() {
    if (!resultado) return;
    setSaving(true);
    await onSaveResult?.({ resultado, duracionSegundos: elapsed });
    setSaving(false);
    onClose?.();
  }

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        className="card"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.6rem 1rem',
          cursor: 'pointer',
          zIndex: 60,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-status-custom-text)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{call.name || call.numero}</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{formatTimer(elapsed)}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
      }}
    >
      <div className="card" style={{ width: 360, maxWidth: '90vw', padding: '1.25rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
          <button onClick={() => setMinimized(true)} aria-label="Minimizar" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1rem', padding: 4 }}>─</button>
          <button onClick={handleClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1rem', padding: 4 }}>✕</button>
        </div>

        {phase === 'llamada' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: '1.1rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-status-custom-text)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-status-custom-text)', fontWeight: 600 }}>{STATUS_LABEL[status]}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: colors.bg,
                  color: colors.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1.4rem',
                  marginBottom: '0.6rem',
                }}
              >
                {initials}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{call.name || 'Número externo'}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{call.numero}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.6rem', fontVariantNumeric: 'tabular-nums' }}>
                {formatTimer(elapsed)}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                background: 'var(--color-status-error-bg)',
                border: `1px solid var(--color-status-error-border)`,
                borderRadius: 'var(--radius)',
                padding: '0.6rem 0.75rem',
                marginBottom: '1.1rem',
              }}
            >
              <span aria-hidden style={{ color: 'var(--color-status-error-text)' }}>●</span>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text)' }}>
                Esta llamada está siendo grabada. Es tu responsabilidad informar a la persona contactada que la llamada está siendo grabada.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.4rem', marginBottom: showKeypad ? '0.8rem' : '1.3rem' }}>
              <CallControlButton
                active={muted}
                icon={muted ? '🔇' : '🎙️'}
                label="Silencio"
                // TODO: llamar a call.mute(!muted) del Voice SDK cuando exista
                onClick={() => setMuted((v) => !v)}
              />
              <CallControlButton active={showKeypad} icon="⌨" label="Teclado" onClick={() => setShowKeypad((v) => !v)} />
              <CallControlButton
                active={speakerOn}
                icon="🔊"
                label="Altavoz"
                // TODO: cambiar el output device real cuando exista el Voice SDK
                onClick={() => setSpeakerOn((v) => !v)}
              />
            </div>

            {showKeypad && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1.3rem' }}>
                {KEYPAD_KEYS.map((k) => (
                  <button
                    key={k}
                    className="btn btn-secondary"
                    // TODO: llamar a call.sendDigits(k) del Voice SDK cuando exista
                    onClick={() => console.log('DTMF (pendiente de Twilio):', k)}
                    style={{ padding: '0.6rem 0', fontSize: '1rem' }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleFinalizar}
              style={{
                width: '100%',
                background: 'var(--color-danger)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                padding: '0.85rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              🔴 Finalizar llamada
            </button>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Llamada finalizada</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1.1rem', fontSize: '0.88rem' }}>
              <Row label="Lead / número" value={call.name || call.numero} />
              <Row label="Duración" value={formatTimer(elapsed)} />
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.6rem' }}>Resultado</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.25rem' }}>
              {Object.entries(RESULTADO_LABEL).map(([value, label]) => {
                const selected = resultado === value;
                const variant = RESULTADO_STYLE[value];
                return (
                  <button
                    key={value}
                    onClick={() => setResultado(value)}
                    className="status-pill"
                    style={{
                      ...pillStyle(variant),
                      justifyContent: 'center',
                      padding: '0.5rem 0.4rem',
                      cursor: 'pointer',
                      border: selected ? `2px solid var(--color-status-${variant}-text)` : `1px solid var(--color-status-${variant}-border)`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cerrar sin guardar</button>
              <button className="btn btn-primary" onClick={handleGuardarResultado} disabled={!resultado || saving}>
                {saving ? 'Guardando…' : 'Guardar resultado'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CallControlButton({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: 'none',
        border: 'none',
        color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          background: active ? 'var(--color-primary-soft)' : 'var(--color-btn-secondary-bg)',
          border: '1px solid var(--color-border)',
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: '0.72rem' }}>{label}</span>
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}