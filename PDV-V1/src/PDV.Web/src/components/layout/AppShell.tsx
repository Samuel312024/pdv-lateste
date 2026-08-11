import { useState, type ReactNode } from 'react';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';

const expandedDrawerWidth = 280;
const collapsedDrawerWidth = 92;
const storageKey = 'pdv-sidebar-collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => localStorage.getItem(storageKey) === 'true');
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const drawerWidth = isDesktop ? (desktopCollapsed ? collapsedDrawerWidth : expandedDrawerWidth) : expandedDrawerWidth;

  function handleMenuClick() {
    if (isDesktop) {
      setDesktopCollapsed((current) => {
        const next = !current;
        localStorage.setItem(storageKey, String(next));
        return next;
      });
      return;
    }

    setMobileOpen((current) => !current);
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppHeader drawerWidth={drawerWidth} onMenuClick={handleMenuClick} sidebarCollapsed={desktopCollapsed} />
      <Box component="nav" sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              borderRight: '1px solid rgba(23, 75, 138, 0.08)',
              background: 'linear-gradient(180deg, rgba(14, 40, 74, 0.98), rgba(28, 82, 129, 0.98))',
              color: '#ffffff',
              overflowX: 'hidden'
            }
          }}
        >
          <Sidebar
            closeMobileMenu={() => setMobileOpen(false)}
            collapsed={isDesktop ? desktopCollapsed : false}
            onToggleCollapsed={isDesktop ? handleMenuClick : undefined}
          />
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { lg: `calc(100% - ${drawerWidth}px)` },
          maxWidth: '100%',
          minWidth: 0,
          overflowX: 'hidden',
          pt: { xs: 11, md: 12 },
          px: { xs: 1.25, sm: 1.75, md: 2.25, xl: 2.75 },
          pb: { xs: 2.5, md: 4 }
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
