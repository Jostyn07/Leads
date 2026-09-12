'use client';

import { useEffect, useRef, useState } from 'react';
import { getInitials, getAvatarColors } from '../leads/avatarColor';
import { RESULTADO_LABEL, RESULTADO_STYLE, pillStyle } from '../../lib/telefonia/resultados';
import { getTelnyxClient } from '../../lib/telnyx/client';
import { supabase } from '../../lib/supabase/client';

const STATUS_LABEL = {
  iniciando: 'Iniciando…',
  sonando: 'Sonando…',
  conectada: 'Llamada en curso',
  finalizando: 'Finalizando…',
};

// Estados que devuelve el SDK de Telnyx -> nuestras 4 etiquetas.
const TELNYX_STATE_MAP = {
  new: 'iniciando',
  requesting: 'iniciando',
  trying: 'iniciando',
  ringing: 'sonando',
  answering: 'sonando',
  active: 'conectada',
  held: 'conectada',
  hangup: 'finalizando',
  destroy: 'finalizando',
};

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// Telnyx exige E.164 (+1XXXXXXXXXX) -- tus leads guardan el teléfono
// como 10 dígitos planos, sin "+1". Sin esto, Telnyx rechaza la
// llamada casi al instante (se ve como si "colgara sola" enseguida).
function toE164(numero) {
  const raw = (numero || '').trim();
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// Requiere NEXT_PUBLIC_TELNYX_PHONE_NUMBER en tu .env.local (mismo valor
// que el secret TELNYX_PHONE_NUMBER de la Edge Function) -- es solo un
// número de teléfono, no es sensible, por eso puede ser público.
const CALLER_NUMBER = process.env.NEXT_PUBLIC_TELNYX_PHONE_NUMBER;

export default function CallInProgress({ call, onClose, onSaveResult }) {
  const [phase, setPhase] = useState('llamada'); // 'llamada' | 'resultado' | 'error'
  const [status, setStatus] = useState('iniciando');
  const [errorMsg, setErrorMsg] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [saving, setSaving] = useState(false);

  const intervalRef = useRef(null);
  const telnyxCallRef = useRef(null);
  const telnyxIDsRef = useRef(null); // capturado cuando el estado pasa a 'active'
  const myIdRef = useRef(null);
  const horaInicioRef = useRef(null);
  const notificationHandlerRef = useRef(null);
  const clientRef = useRef(null);

  // Coloca la llamada real al montar.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        myIdRef.current = user?.id ?? null;

        // Se revisa permiso/minutos ANTES de cada llamada individual,
        // no solo la primera de la sesión -- getTelnyxClient() reutiliza
        // la conexión WebRTC entre llamadas, así que sin este chequeo
        // aparte, alguien podría seguir llamando después de quedarse
        // sin minutos a mitad de sesión.
        const { data: canCall, error: canCallError } = await supabase.rpc('can_make_call');
        if (cancelled) return;
        if (canCallError || !canCall?.allowed) {
          setErrorMsg(canCall?.reason || canCallError?.message || 'No se pudo validar el permiso para llamar.');
          setPhase('error');
          return;
        }

        const client = await getTelnyxClient();
        if (cancelled) return;
        clientRef.current = client;

        // Escuchamos en el CLIENTE, no en el objeto call -- la versión
        // instalada del SDK no expone call.on() a pesar de que la
        // documentación de Telnyx lo muestre así (confirmado con el
        // error real: "telnyxCall.on is not a function"). El patrón
        // client.on('telnyx.notification', ...) sí está confirmado
        // (es el mismo que usan para llamadas entrantes).
        function handleNotification(notification) {
          if (notification.type !== 'callUpdate') return;
          const telnyxState = notification.call.state;
          const mapped = TELNYX_STATE_MAP[telnyxState] || 'iniciando';
          setStatus(mapped);

          if (telnyxState === 'active' && !telnyxIDsRef.current) {
            telnyxIDsRef.current = notification.call.telnyxIDs;
          }

          // El otro lado colgó (o hubo un fallo de red) sin que el
          // agente haya tocado "Finalizar llamada" -- igual pasamos a
          // la pantalla de resultado, no se pierde el registro.
          if (telnyxState === 'hangup' || telnyxState === 'destroy') {
            clearInterval(intervalRef.current);
            setPhase((p) => (p === 'llamada' ? 'resultado' : p));
          }
        }

        client.on('telnyx.notification', handleNotification);
        notificationHandlerRef.current = handleNotification;

        let telnyxCall = client.newCall({
          destinationNumber: toE164(call.numero),
          callerNumber: toE164(CALLER_NUMBER),
        });

        // Por si acaso, se soporta también que newCall() devuelva una
        // Promise en vez del objeto Call directamente.
        if (telnyxCall && typeof telnyxCall.then === 'function') {
          telnyxCall = await telnyxCall;
        }

        telnyxCallRef.current = telnyxCall;
        horaInicioRef.current = new Date().toISOString();
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'No se pudo iniciar la llamada.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
      if (clientRef.current && notificationHandlerRef.current) {
        clientRef.current.off('telnyx.notification', notificationHandlerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'llamada' && status === 'conectada') {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [phase, status]);

  const initials = getInitials(call.name || call.numero || '?');
  const colors = getAvatarColors(call.name || call.numero || '?');

  async function handleFinalizar() {
    clearInterval(intervalRef.current);
    try {
      await telnyxCallRef.current?.hangup();
    } catch {
      // Si ya estaba colgada del otro lado, hangup() puede rechazar --
      // no impide seguir a la pantalla de resultado.
    }
    setPhase('resultado');
  }

  function handleClose() {
    if (phase === 'llamada') {
      const ok = window.confirm('¿Finalizar la llamada?');
      if (!ok) return;
      telnyxCallRef.current?.hangup().catch(() => {});
    }
    onClose?.();
  }

  function toggleMute() {
    const telnyxCall = telnyxCallRef.current;
    if (!telnyxCall) return;
    if (muted) telnyxCall.unmuteAudio();
    else telnyxCall.muteAudio();
    setMuted((v) => !v);
  }

  function sendDigit(k) {
    telnyxCallRef.current?.dtmf(k);
  }

  async function handleGuardarResultado() {
    if (!resultado) return;
    setSaving(true);

    const ids = telnyxIDsRef.current || {};
    const { error } = await supabase.from('calls').insert({
      user_id: myIdRef.current,
      lead_id: call.leadId || null,
      tipo: call.leadId ? 'lead' : 'externa',
      numero: call.numero,
      estado_tecnico: 'finalizada',
      resultado,
      duracion_segundos: elapsed,
      telnyx_call_control_id: ids.telnyxCallControlId || null,
      telnyx_call_leg_id: ids.telnyxLegId || null,
      telnyx_call_session_id: ids.telnyxSessionId || null,
      hora_inicio: horaInicioRef.current,
      hora_fin: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      setErrorMsg('No se pudo guardar el registro de la llamada: ' + error.message);
      return;
    }

    await onSaveResult?.({ resultado, duracionSegundos: elapsed });
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
      {/* Elemento de audio donde se reproduce la voz remota -- lo usa
          getTelnyxClient() vía client.remoteElement. Oculto a propósito. */}
      <audio id="telnyx-remote-audio" autoPlay style={{ display: 'none' }} />

      <div className="card" style={{ width: 360, maxWidth: '90vw', padding: '1.25rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
          {phase === 'llamada' && (
            <button onClick={() => setMinimized(true)} aria-label="Minimizar" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1rem', padding: 4 }}>─</button>
          )}
          <button onClick={handleClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1rem', padding: 4 }}>✕</button>
        </div>

        {phase === 'error' ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 8 }}>No se pudo iniciar la llamada</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{errorMsg}</p>
          </div>
        ) : phase === 'llamada' ? (
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
              <CallControlButton active={muted} icon={muted ? '🔇' : '🎙️'} label="Silencio" onClick={toggleMute} />
              <CallControlButton active={showKeypad} icon="⌨" label="Teclado" onClick={() => setShowKeypad((v) => !v)} />
              <CallControlButton
                active={speakerOn}
                icon="🔊"
                label="Altavoz"
                // El SDK de Telnyx no expone selección de dispositivo de
                // salida directamente -- esto usaría HTMLMediaElement
                // .setSinkId() del elemento <audio> si el navegador lo
                // soporta. Por ahora solo alterna el ícono.
                onClick={() => setSpeakerOn((v) => !v)}
              />
            </div>

            {showKeypad && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1.3rem' }}>
                {KEYPAD_KEYS.map((k) => (
                  <button key={k} className="btn btn-secondary" onClick={() => sendDigit(k)} style={{ padding: '0.6rem 0', fontSize: '1rem' }}>
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

            {errorMsg && <p style={{ color: 'var(--color-danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{errorMsg}</p>}

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