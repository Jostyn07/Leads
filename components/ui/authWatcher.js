'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';

export default function AuthWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT también se dispara cuando falla la renovación del
      // refresh token (Supabase limpia la sesión sola en ese caso) — no
      // solo cuando alguien hace clic en "Cerrar sesión".
      if (event === 'SIGNED_OUT' && pathname !== '/login' && pathname !== '/') {
        router.replace('/login?expired=1');
      }
      if (event === 'SIGNED_IN' && session?.user) {
        checkEstadoOnce(session.user.id);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]);

  // Revisión de estado UNA sola vez al montar (sesión restaurada del
  // almacenamiento local, que no dispara SIGNED_IN) usando la sesión
  // ya en memoria -- getSession() es local, no llama al servidor.
  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;

    let channel = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      await checkEstadoOnce(session.user.id);

      // A partir de acá, nos enteramos de un cambio a inactivo en
      // tiempo real (Realtime), sin volver a llamar a getUser() ni
      // hacer polling contra el servidor de Auth.
      channel = supabase
        .channel(`profile-estado:${session.user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
          (payload) => {
            if (payload.new?.estado === 'inactivo') {
              supabase.auth.signOut().then(() => router.replace('/login?inactive=1'));
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function checkEstadoOnce(userId) {
    const { data } = await supabase.from('profiles').select('estado').eq('id', userId).single();
    if (data?.estado === 'inactivo') {
      await supabase.auth.signOut();
      router.replace('/login?inactive=1');
    }
  }

  return null;
}