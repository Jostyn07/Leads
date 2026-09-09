'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';

// Cada cuánto se revisa si el usuario sigue activo mientras la app está
// abierta — cubre el caso de alguien que YA tenía sesión iniciada cuando
// un admin lo marca como inactivo desde Usuarios.
const CHECK_INTERVAL_MS = 60_000;

export default function AuthWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  async function checkEstado(userId) {
    const { data } = await supabase.from('profiles').select('estado').eq('id', userId).single();
    if (data?.estado === 'inactivo') {
      await supabase.auth.signOut();
      router.replace('/login?inactive=1');
    }
  }

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT también se dispara cuando falla la renovación del
      // refresh token (Supabase limpia la sesión sola en ese caso) — no
      // solo cuando alguien hace clic en "Cerrar sesión".
      if (event === 'SIGNED_OUT' && pathname !== '/login' && pathname !== '/') {
        router.replace('/login?expired=1');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        checkEstado(session.user.id);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;

    // Revisión inmediata al montar (cubre una sesión ya restaurada del
    // almacenamiento local, que no dispara SIGNED_IN) + revisión periódica.
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) checkEstado(user.id);
    })();

    const interval = setInterval(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) checkEstado(user.id);
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}