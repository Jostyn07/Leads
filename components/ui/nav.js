'use client';

import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leads', label: 'Leads' },
  { href: '/funnels', label: 'Embudos' },
  { href: '/imports', label: 'Importar' },
  { href: '/settings', label: 'Configuración' },
];

export default function Nav() {
  const pathname = usePathname();

  if (pathname === '/login' || pathname === '/') return null;

  return (
    <nav
      style={{
        display: 'flex',
        gap: '1rem',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      {LINKS.map((link) => {
        const active = pathname?.startsWith(link.href);
        return (
          <a
            key={link.href}
            href={link.href}
            style={{
              fontSize: '0.9rem',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--color-primary)' : 'var(--color-text)',
            }}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}