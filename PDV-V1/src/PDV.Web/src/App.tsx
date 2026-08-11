import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AccessDeniedCard } from './components/common/AccessDeniedCard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { BuyerPortalLayout } from './components/layout/BuyerPortalLayout';
import { CourierPortalLayout } from './components/layout/CourierPortalLayout';
import { useAuth } from './contexts/AuthContext';
import { CashierPage } from './pages/CashierPage';
import { CashierAccessPage } from './pages/CashierAccessPage';
import { ClientsPage } from './pages/ClientsPage';
import { CompanyFiscalPage } from './pages/CompanyFiscalPage';
import { DashboardPage } from './pages/DashboardPage';
import { CourierDeliveriesPage } from './pages/CourierDeliveriesPage';
import { DeliveryTrackingPage } from './pages/DeliveryTrackingPage';
import { FinancePage } from './pages/FinancePage';
import { HardwarePage } from './pages/HardwarePage';
import { LoginPage } from './pages/LoginPage';
import { NfePage } from './pages/NfePage';
import { OrdersPage } from './pages/OrdersPage';
import { PdvPage } from './pages/PdvPage';
import { PdvTouchKeyboardWindowPage } from './pages/PdvTouchKeyboardWindowPage';
import { PdvMonitorPage } from './pages/PdvMonitorPage';
import { PriceCheckPage } from './pages/PriceCheckPage';
import { MyOrdersPage } from './pages/MyOrdersPage';
import { ProductCatalogPage } from './pages/ProductCatalogPage';
import { ProductsPage } from './pages/ProductsPage';
import { RemoteScannerPage } from './pages/RemoteScannerPage';
import { ReportsPage } from './pages/ReportsPage';
import { ScannerMobilePage } from './pages/ScannerMobilePage';
import { StockPage } from './pages/StockPage';
import { TerminalActivationPage } from './pages/TerminalActivationPage';
import { TransportersPage } from './pages/TransportersPage';
import { UsersPage } from './pages/UsersPage';
import { canAccessAppPath, featureRouteAccessList, getDefaultAuthorizedPath } from './utils/featureAccess';

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function DefaultAppRoute() {
  const { session } = useAuth();
  return <Navigate to={getDefaultAuthorizedPath(session)} replace />;
}

function NoFeaturesPage() {
  return (
    <AccessDeniedCard
      title="Nenhuma funcionalidade liberada"
      message="Este usuario entrou no sistema, mas ainda nao recebeu nenhuma feature flag de modulo. Peca ao administrador para liberar as funcionalidades necessarias."
    />
  );
}

function PermissionPage({ path, children }: { path: string; children: ReactNode }) {
  const { session } = useAuth();
  const routeAccess = featureRouteAccessList.find((item) => item.path === path);

  if (!routeAccess || canAccessAppPath(session, path)) {
    return <>{children}</>;
  }

  return <AccessDeniedCard title={routeAccess.title} message={routeAccess.message} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage mode="internal" />} />
      <Route path="/acesso-caixa" element={<CashierAccessPage />} />
      <Route path="/ativacao-terminal" element={<TerminalActivationPage />} />
      <Route path="/pdv-touch" element={<PdvTouchKeyboardWindowPage />} />
      <Route path="/comprador/login" element={<LoginPage mode="buyer" />} />
      <Route path="/entregador/login" element={<LoginPage mode="courier" />} />
      <Route path="/scanner" element={<ScannerMobilePage />} />
      <Route path="/scanner-remoto/:sessaoId" element={<RemoteScannerPage />} />
      <Route path="/entrega/:codigoAcesso" element={<DeliveryTrackingPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/comprador" element={<BuyerPortalLayout />}>
          <Route index element={<Navigate to="/comprador/catalogo" replace />} />
          <Route path="catalogo" element={<PermissionPage path="/comprador/catalogo"><ProductCatalogPage mode="buyer" /></PermissionPage>} />
          <Route path="pedidos" element={<PermissionPage path="/comprador/pedidos"><MyOrdersPage mode="buyer" /></PermissionPage>} />
        </Route>
        <Route path="/entregador" element={<CourierPortalLayout />}>
          <Route index element={<Navigate to="/entregador/entregas" replace />} />
          <Route path="entregas" element={<PermissionPage path="/entregador/entregas"><CourierDeliveriesPage /></PermissionPage>} />
        </Route>
        <Route element={<ShellLayout />}>
          <Route path="/" element={<DefaultAppRoute />} />
          <Route path="/acesso-negado" element={<NoFeaturesPage />} />
          <Route path="/dashboard" element={<PermissionPage path="/dashboard"><DashboardPage /></PermissionPage>} />
          <Route path="/produtos" element={<PermissionPage path="/produtos"><ProductsPage /></PermissionPage>} />
          <Route path="/estoque" element={<PermissionPage path="/estoque"><StockPage /></PermissionPage>} />
          <Route path="/catalogo-produtos" element={<PermissionPage path="/catalogo-produtos"><ProductCatalogPage /></PermissionPage>} />
          <Route path="/pedidos" element={<PermissionPage path="/pedidos"><OrdersPage /></PermissionPage>} />
          <Route path="/meus-pedidos" element={<PermissionPage path="/meus-pedidos"><MyOrdersPage /></PermissionPage>} />
          <Route path="/consulta-preco" element={<PermissionPage path="/consulta-preco"><PriceCheckPage /></PermissionPage>} />
          <Route path="/clientes" element={<PermissionPage path="/clientes"><ClientsPage /></PermissionPage>} />
          <Route path="/transportadoras" element={<PermissionPage path="/transportadoras"><TransportersPage /></PermissionPage>} />
          <Route path="/financeiro" element={<PermissionPage path="/financeiro"><FinancePage /></PermissionPage>} />
          <Route path="/empresa-fiscal" element={<PermissionPage path="/empresa-fiscal"><CompanyFiscalPage /></PermissionPage>} />
          <Route path="/notas-fiscais" element={<PermissionPage path="/notas-fiscais"><NfePage /></PermissionPage>} />
          <Route path="/usuarios" element={<PermissionPage path="/usuarios"><UsersPage /></PermissionPage>} />
          <Route path="/monitor-operacional" element={<PermissionPage path="/monitor-operacional"><PdvMonitorPage /></PermissionPage>} />
          <Route path="/relatorios" element={<PermissionPage path="/relatorios"><ReportsPage /></PermissionPage>} />
          <Route path="/hardware" element={<PermissionPage path="/hardware"><HardwarePage /></PermissionPage>} />
          <Route path="/caixa" element={<PermissionPage path="/caixa"><CashierPage /></PermissionPage>} />
          <Route path="/pdv" element={<PermissionPage path="/pdv"><PdvPage /></PermissionPage>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
