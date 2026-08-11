import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import ShoppingBagRoundedIcon from '@mui/icons-material/ShoppingBagRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { AppBar, Badge, Box, Button, Chip, Container, Divider, IconButton, Menu, MenuItem, Stack, Toolbar, Typography } from '@mui/material';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { orderService } from '../../services/orderService';
import type { PedidoResumo } from '../../types';

export function BuyerPortalLayout() {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<BuyerPortalNotification[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const canShowNotifications = Boolean(session?.usuario.clienteId) && (
    session?.usuario.permissoes.includes('AcompanharPedidosCliente') ||
    session?.usuario.permissoes.includes('RealizarPedidoCliente')
  );
  const notificationsStorageKey = useMemo(
    () => session?.usuario.usuarioId ? `pdv:buyer-notifications:${session.usuario.usuarioId}` : null,
    [session?.usuario.usuarioId]
  );
  const unreadCount = notifications.filter((item) => !lastSeenAt || new Date(item.updatedAt).getTime() > new Date(lastSeenAt).getTime()).length;

  useEffect(() => {
    if (!notificationsStorageKey) {
      setLastSeenAt(null);
      return;
    }

    setLastSeenAt(window.localStorage.getItem(notificationsStorageKey));
  }, [notificationsStorageKey]);

  useEffect(() => {
    if (!canShowNotifications) {
      setNotifications([]);
      return;
    }

    let active = true;

    async function loadNotifications() {
      try {
        const result = await orderService.listMine();
        if (active) {
          setNotifications(buildBuyerNotifications(result));
        }
      } catch {
        if (active) {
          setNotifications([]);
        }
      }
    }

    void loadNotifications();
    const intervalId = window.setInterval(() => void loadNotifications(), 45000);
    const handleFocus = () => void loadNotifications();
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [canShowNotifications]);

  function handleLogout() {
    logout();
    navigate('/comprador/login');
  }

  function handleOpenNotifications(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);

    if (notificationsStorageKey) {
      const seenAt = new Date().toISOString();
      window.localStorage.setItem(notificationsStorageKey, seenAt);
      setLastSeenAt(seenAt);
    }
  }

  function handleCloseNotifications() {
    setAnchorEl(null);
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top left, rgba(255, 214, 153, 0.28), transparent 28%), linear-gradient(180deg, #fffaf2 0%, #f4f0ea 100%)'
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(255, 250, 242, 0.92)',
          color: '#1f2937',
          borderBottom: '1px solid rgba(31, 41, 55, 0.08)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <Toolbar sx={{ minHeight: 82 }}>
          <Container maxWidth="xl" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Chip
                size="small"
                icon={<AutoAwesomeRoundedIcon />}
                label="Portal de compras"
                sx={{ mb: 1, bgcolor: 'rgba(29, 78, 216, 0.10)', color: 'primary.main', fontWeight: 700 }}
              />
              <Typography sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>Catalogo do comprador</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {session?.usuario.nome ? `${session.usuario.nome}, ofertas e pedidos em um portal proprio.` : 'Ofertas e pedidos em um portal proprio.'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <Button
                component={NavLink}
                to="/comprador/catalogo"
                startIcon={<StorefrontRoundedIcon />}
                color="inherit"
                sx={{
                  borderRadius: 999,
                  px: 2,
                  '&.active': {
                    bgcolor: 'rgba(29, 78, 216, 0.12)',
                    color: 'primary.main'
                  }
                }}
              >
                Catalogo
              </Button>
              <Button
                component={NavLink}
                to="/comprador/pedidos"
                startIcon={<ShoppingBagRoundedIcon />}
                color="inherit"
                sx={{
                  borderRadius: 999,
                  px: 2,
                  '&.active': {
                    bgcolor: 'rgba(29, 78, 216, 0.12)',
                    color: 'primary.main'
                  }
                }}
              >
                Meus pedidos
              </Button>
            </Stack>

            {canShowNotifications ? (
              <>
                <IconButton color="inherit" onClick={handleOpenNotifications}>
                  <Badge badgeContent={unreadCount} color="error" max={99}>
                    <NotificationsRoundedIcon />
                  </Badge>
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleCloseNotifications}
                  PaperProps={{ sx: { width: 360, maxWidth: 'calc(100vw - 24px)', borderRadius: 3, mt: 1 } }}
                >
                  <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography sx={{ fontWeight: 900 }}>Notificacoes do pedido</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Atualizacoes recentes do seu carrinho, pedido e entrega.
                    </Typography>
                  </Box>
                  <Divider />
                  {notifications.length === 0 ? (
                    <MenuItem onClick={handleCloseNotifications}>
                      <Box>
                        <Typography sx={{ fontWeight: 700 }}>Sem novidades por enquanto</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Quando seus pedidos mudarem de etapa, as notificacoes aparecem aqui.
                        </Typography>
                      </Box>
                    </MenuItem>
                  ) : notifications.map((notification) => (
                    <MenuItem
                      key={`${notification.vendaId}:${notification.updatedAt}:${notification.title}`}
                      onClick={() => {
                        handleCloseNotifications();
                        navigate('/comprador/pedidos');
                      }}
                      sx={{ alignItems: 'flex-start', py: 1.5 }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 700 }}>{notification.title}</Typography>
                        <Typography variant="body2" color="text.secondary">{notification.description}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(notification.updatedAt)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Menu>
              </>
            ) : null}

            <Button color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>
              Sair
            </Button>
          </Container>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}

interface BuyerPortalNotification {
  vendaId: string;
  title: string;
  description: string;
  updatedAt: string;
}

function buildBuyerNotifications(orders: PedidoResumo[]) {
  return [...orders]
    .sort((left, right) => resolveNotificationTime(right).localeCompare(resolveNotificationTime(left)))
    .slice(0, 8)
    .map((order) => {
      const updatedAt = resolveNotificationTime(order);
      const liveLocation = order.entrega?.localizacaoAtual;

      if (liveLocation) {
        return {
          vendaId: order.vendaId,
          title: `${order.codigoAcompanhamento} com localizacao atualizada`,
          description: order.entrega?.nomeEntregador
            ? `${order.entrega.nomeEntregador} enviou uma nova posicao da entrega.`
            : 'O entregador atualizou a posicao em tempo real.',
          updatedAt
        } satisfies BuyerPortalNotification;
      }

      return {
        vendaId: order.vendaId,
        title: `${order.codigoAcompanhamento} · ${labelForStatus(order.pedidoStatus)}`,
        description: order.enderecoEntregaResumo ?? 'Seu pedido recebeu uma nova atualizacao.',
        updatedAt
      } satisfies BuyerPortalNotification;
    });
}

function resolveNotificationTime(order: PedidoResumo) {
  return order.entrega?.localizacaoAtual?.dataCaptura
    ?? order.dataUltimaAtualizacao
    ?? order.dataVenda;
}

function labelForStatus(status: string) {
  switch (status) {
    case 'Recebido': return 'Pedido recebido';
    case 'EmPreparacao': return 'Em preparacao';
    case 'ProntoParaRetirada': return 'Pronto para retirada';
    case 'SaiuParaEntrega': return 'Saiu para entrega';
    case 'Entregue': return 'Pedido entregue';
    case 'Cancelado': return 'Pedido cancelado';
    default: return status;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}
