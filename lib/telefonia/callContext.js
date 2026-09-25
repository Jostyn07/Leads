'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import CallInProgress from '../../components/telefonia/callInProgress';

// Llamada activa GLOBAL de la app. Vive en el layout raíz, fuera de
// cualquier página o tarjeta: aunque la lista de leads se recargue,
// cambies de página, de vista (cuadrícula/lista) o navegues a otra
// sección, la llamada NO se desmonta -- así siempre se registra en
// `calls` y el webhook de Telnyx puede asociar la grabación.
const CallContext = createContext(null);

export function CallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null);
  const onSavedRef = useRef(null);

  // call = { name, numero, leadId }
  // opts.onSaved = callback opcional al guardar (p. ej. refrescar la lista)
  const startCall = useCallback((call, opts = {}) => {
    setActiveCall((current) => {
      if (current) {
        window.alert('Ya hay una llamada en curso. Finalízala antes de iniciar otra.');
        return current;
      }
      onSavedRef.current = opts.onSaved || null;
      return call;
    });
  }, []);

  function handleClose() {
    setActiveCall(null);
    onSavedRef.current = null;
  }

  async function handleSaved(result) {
    // Aviso global para que cualquier pantalla (llamadas, leads, detalle)
    // refresque su información si está abierta.
    window.dispatchEvent(new CustomEvent('calls:changed', { detail: result }));
    await onSavedRef.current?.(result);
  }

  return (
    <CallContext.Provider value={{ activeCall, startCall }}>
      {children}
      {activeCall && (
        <CallInProgress
          // key nueva por llamada: estado limpio en cada marcación
          key={`${activeCall.leadId || activeCall.numero}-${activeCall._ts}`}
          call={activeCall}
          onClose={handleClose}
          onSaveResult={handleSaved}
        />
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall() debe usarse dentro de <CallProvider>.');
  return ctx;
}