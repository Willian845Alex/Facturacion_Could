import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { UserRole } from '@facturacion-ec/shared';
import LoginPage from './pages/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import InvoicesPage from './pages/invoices/InvoicesPage'
import TicketPage from './pages/invoices/TicketPage';
import ClientsPage from './pages/clients/ClientsPage';
import ProductsPage from './pages/products/ProductsPage';
import SettingsPage from './pages/settings/SettingsPage';
import ReportsPage from './pages/reports/ReportsPage'
import SalesReportPage from './pages/reports/SalesReportPage'
import AtsReportPage from './pages/reports/AtsReportPage'
import InventoryReportPage from './pages/reports/InventoryReportPage';
import InventoryPage from './pages/inventory/InventoryPage';
import CashRegisterHistoryPage from './pages/cash-register/CashRegisterHistoryPage';
import UsersPage from './pages/users/UsersPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== UserRole.ADMIN) return <NoAccess />;
  return <>{children}</>;
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-24">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Sin permisos</h2>
      <p className="text-sm text-gray-500 max-w-xs">
        No tienes acceso a esta sección. Contacta al administrador si necesitas acceso.
      </p>
      <a href="/dashboard"
        className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
        Volver al inicio
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <DashboardLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="cash-register" element={<CashRegisterHistoryPage />} />
        <Route path="reports" element={<AdminRoute><ReportsPage /></AdminRoute>}>
          <Route index element={<Navigate to="/reports/sales" replace />} />
          <Route path="sales" element={<SalesReportPage />} />
          <Route path="ats" element={<AtsReportPage />} />
          <Route path="inventory" element={<InventoryReportPage />} />
        </Route>
        <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
      </Route>
      <Route path="/ticket/:id" element={<TicketPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
