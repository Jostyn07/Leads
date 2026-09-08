'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';

export default function AuthWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      // SIGNED_OUT también se dispara cuando falla la renovación del
      // refresh token (Supabase limpia la sesión sola en ese caso) — no
      // solo cuando alguien hace clic en "Cerrar sesión".
      if (event === 'SIGNED_OUT' && pathname !== '/login' && pathname !== '/') {
        router.replace('/login?expired=1');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}