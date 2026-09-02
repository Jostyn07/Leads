import './globals.css';
import Sidebar from '../components/ui/sidebar';
import BackgroundPicker from '../components/ui/backgroundPicker';
import AppShell from '../components/ui/appShell';

export const metadata = {
  title: 'Plataforma de Leads',
  description: 'Organización de leads por embudos y etapas',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <BackgroundPicker />
        <Sidebar />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}