import DeliveryDiningRoundedIcon from '@mui/icons-material/DeliveryDiningRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import { AppBar, Box, Button, Chip, Container, Stack, Toolbar, Typography } from '@mui/material';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function CourierPortalLayout() {
  const { logout, session } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/entregador/login');
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top left, rgba(125, 211, 252, 0.24), transparent 24%), linear-gradient(180deg, #f5fbff 0%, #eef5fb 100%)'
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(245, 251, 255, 0.92)',
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
                icon={<DeliveryDiningRoundedIcon />}
                label="Portal do entregador"
                sx={{ mb: 1, bgcolor: 'rgba(29, 78, 216, 0.10)', color: 'primary.main', fontWeight: 700 }}
              />
              <Typography sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>Entregas designadas</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {session?.usuario.nome ? `${session.usuario.nome}, acompanhe suas rotas e compartilhe o GPS ao vivo.` : 'Acompanhe suas rotas e compartilhe o GPS ao vivo.'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <Button
                component={NavLink}
                to="/entregador/entregas"
                startIcon={<RouteRoundedIcon />}
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
                Minhas entregas
              </Button>
            </Stack>

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
