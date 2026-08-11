import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import ShoppingBagRoundedIcon from '@mui/icons-material/ShoppingBagRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded';
import { Box, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography } from '@mui/material';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessAppPath } from '../../utils/featureAccess';

interface SidebarProps {
  closeMobileMenu: () => void;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ closeMobileMenu, collapsed, onToggleCollapsed }: SidebarProps) {
  const { session } = useAuth();
  const user = session?.usuario ?? null;

  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardRoundedIcon />, visible: canAccessAppPath(user, '/dashboard') },
    { to: '/produtos', label: 'Produtos', icon: <Inventory2RoundedIcon />, visible: canAccessAppPath(user, '/produtos') },
    { to: '/estoque', label: 'Estoque', icon: <InventoryRoundedIcon />, visible: canAccessAppPath(user, '/estoque') },
    { to: '/catalogo-produtos', label: 'Catalogo digital', icon: <StorefrontRoundedIcon />, visible: canAccessAppPath(user, '/catalogo-produtos') },
    { to: '/pedidos', label: 'Pedidos', icon: <ShoppingBagRoundedIcon />, visible: canAccessAppPath(user, '/pedidos') },
    { to: '/meus-pedidos', label: 'Meus pedidos', icon: <ShoppingBagRoundedIcon />, visible: canAccessAppPath(user, '/meus-pedidos') },
    { to: '/consulta-preco', label: 'Consulta preco', icon: <SearchRoundedIcon />, visible: canAccessAppPath(user, '/consulta-preco') },
    { to: '/clientes', label: 'Clientes', icon: <PeopleRoundedIcon />, visible: canAccessAppPath(user, '/clientes') },
    { to: '/transportadoras', label: 'Transportadoras', icon: <LocalShippingRoundedIcon />, visible: canAccessAppPath(user, '/transportadoras') },
    { to: '/financeiro', label: 'Financeiro', icon: <AccountBalanceWalletRoundedIcon />, visible: canAccessAppPath(user, '/financeiro') },
    { to: '/empresa-fiscal', label: 'Empresa fiscal', icon: <BusinessRoundedIcon />, visible: canAccessAppPath(user, '/empresa-fiscal') },
    { to: '/notas-fiscais', label: 'NF-e', icon: <ReceiptLongRoundedIcon />, visible: canAccessAppPath(user, '/notas-fiscais') },
    { to: '/usuarios', label: 'Usuarios', icon: <ManageAccountsRoundedIcon />, visible: canAccessAppPath(user, '/usuarios') },
    { to: '/monitor-operacional', label: 'Operacao ao vivo', icon: <PointOfSaleRoundedIcon />, visible: canAccessAppPath(user, '/monitor-operacional') },
    { to: '/relatorios', label: 'Relatorios', icon: <QueryStatsRoundedIcon />, visible: canAccessAppPath(user, '/relatorios') },
    { to: '/hardware', label: 'Hardware', icon: <PrecisionManufacturingRoundedIcon />, visible: canAccessAppPath(user, '/hardware') },
    { to: '/caixa', label: 'Caixa', icon: <SavingsRoundedIcon />, visible: canAccessAppPath(user, '/caixa') },
    { to: '/pdv', label: 'PDV', icon: <PointOfSaleRoundedIcon />, visible: canAccessAppPath(user, '/pdv') }
  ].filter((item) => item.visible);

  return (
    <Box sx={{ height: '100%', px: 2.5, py: 3 }}>
      <Stack
        direction={collapsed ? 'column' : 'row'}
        alignItems="center"
        justifyContent="space-between"
        spacing={collapsed ? 1 : 1.5}
        sx={{ mb: collapsed ? 3 : 0.5 }}
      >
        <Typography variant="h5" sx={{ fontWeight: 900, textAlign: collapsed ? 'center' : 'left' }}>
          {collapsed ? 'PDV' : 'PDV Control Hub'}
        </Typography>
        {onToggleCollapsed ? (
          <Tooltip title={collapsed ? 'Expandir menu' : 'Recolher menu'} placement={collapsed ? 'right' : 'bottom'}>
            <IconButton
              onClick={onToggleCollapsed}
              size="small"
              aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              sx={{
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.18)',
                bgcolor: 'rgba(255,255,255,0.08)',
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.16)'
                }
              }}
            >
              {collapsed ? <KeyboardDoubleArrowRightRoundedIcon fontSize="small" /> : <KeyboardDoubleArrowLeftRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
      {!collapsed && (
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', mb: 4 }}>
          Plataforma operacional para vendas, usuarios, pedidos, estoque, caixa, financeiro e fiscal.
        </Typography>
      )}

      <List sx={{ display: 'grid', gap: 1 }}>
        {items.map((item) => (
          <Tooltip key={item.to} title={collapsed ? item.label : ''} placement="right">
            <ListItemButton
              component={NavLink}
              to={item.to}
              onClick={closeMobileMenu}
              sx={{
                borderRadius: 3,
                color: 'rgba(255,255,255,0.78)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1.25 : 2,
                '&.active': {
                  bgcolor: 'rgba(255,255,255,0.16)',
                  color: '#ffffff'
                }
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 40, mr: collapsed ? 0 : 1 }}>{item.icon}</ListItemIcon>
              {!collapsed && <ListItemText primary={item.label} />}
            </ListItemButton>
          </Tooltip>
        ))}
      </List>

      {items.length === 0 && (
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', mt: 3 }}>
          Nenhum modulo foi liberado para este usuario ainda.
        </Typography>
      )}
    </Box>
  );
}
