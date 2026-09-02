'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase/client';
import { signOut } from '../../lib/supabase/auth';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/leads', label: 'Leads', icon: '👥' },
  { href: '/funnels', label: 'Embudos', icon: '🔀' },
  { href: '/imports', label: 'Importar', icon: '📥' },
  { href: '/settings', label: 'Configuración', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/') return;
    loadProfile();
  }, [pathname]);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
    setProfile({ email: user.email, fullName: data?.full_name });
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  if (pathname === '/login' || pathname === '/') return null;

  const displayName = profile?.fullName || profile?.email || 'Cuenta';

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'var(--sidebar-width)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 30,
      }}
    >
      <div style={{ padding: '1.25rem 1rem', fontWeight: 700, fontSize: '1.05rem' }}>
        Leads
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 0.6rem' }}>
        {LINKS.map((link) => {
          const active = pathname?.startsWith(link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
                fontWeight: active ? 600 : 400,
                background: active ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text)',
              }}
            >
              <span aria-hidden>{link.icon}</span>
              {link.label}
            </a>
          );
        })}
      </nav>

      {/* Usuario, esquina inferior. Click → menú con opción de cerrar sesión. */}
      <div style={{ position: 'relative', padding: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
        {menuOpen && (
          <div
            className="card"
            style={{ position: 'absolute', bottom: '100%', left: '0.75rem', right: '0.75rem', marginBottom: 8, padding: '0.5rem' }}
          >
            <button
              onClick={handleSignOut}
              className="btn btn-secondary"
              style={{ width: '100%', color: 'var(--color-danger)', justifyContent: 'flex-start' }}
            >
              Cerrar sesión
            </button>
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--color-text)',
            padding: '0.4rem',
            borderRadius: 'var(--radius)',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              flexShrink: 0,
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
        </button>
      </div>
    </aside>
  );
}