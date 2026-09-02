import './globals.css';

export const metadata = {
  title: 'Plataforma de Leads',
  description: 'Organización de leads por embudos y etapas',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}