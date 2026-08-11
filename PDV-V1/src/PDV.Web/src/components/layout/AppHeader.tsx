import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import { AppBar, Box, Button, Chip, IconButton, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isBuyerUser } from '../../utils/featureAccess';
import { ScannerStatusIndicator } from '../scanner/ScannerStatusIndicator';

interface AppHeaderProps {
  drawerWidth: number;
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}

export function AppHeader({ drawerWidth, onMenuClick, sidebarCollapsed }: AppHeaderProps) {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const hideScannerForBuyer = isBuyerUser(session);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <AppBar
      elevation={0}
      sx={{
        width: { lg: `calc(100% - ${drawerWidth}px)` },
        ml: { lg: `${drawerWidth}px` },
        background: 'rgba(246, 243, 236, 0.85)',
        color: '#17324f',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(23, 75, 138, 0.08)'
      }}
    >
      <Toolbar
        sx={{
          gap: { xs: 1.25, md: 2 },
          minHeight: { xs: 74, md: 86 },
          py: 1
        }}
      >
        <Tooltip title={sidebarCollapsed ? 'Abrir menu lateral' : 'Recolher menu lateral'}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={onMenuClick}
            aria-label={sidebarCollapsed ? 'Abrir menu lateral' : 'Recolher menu lateral'}
          >
            {sidebarCollapsed ? <MenuRoundedIcon /> : <MenuOpenRoundedIcon />}
          </IconButton>
        </Tooltip>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>PDV Control Hub</Typography>
          <Typography variant="body2" color="text.secondary">
            PDV, usuarios, pedidos, estoque, financeiro e fiscal em um unico painel.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end" sx={{ minWidth: 0 }}>
          {session ? (
            <Chip
              icon={<BadgeRoundedIcon />}
              label={`${session.usuario.nome} · ${session.usuario.perfil}`}
              variant="outlined"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                maxWidth: 320,
                borderColor: 'rgba(23, 75, 138, 0.18)',
                bgcolor: 'rgba(255, 255, 255, 0.78)',
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }
              }}
            />
          ) : null}
          {!hideScannerForBuyer ? (
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <ScannerStatusIndicator />
            </Box>
          ) : null}
          <Button color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>
            Sair
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
