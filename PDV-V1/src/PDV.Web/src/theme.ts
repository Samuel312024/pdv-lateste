import { createTheme } from '@mui/material';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#174b8a'
    },
    secondary: {
      main: '#d17f34'
    },
    background: {
      default: '#eef3f6',
      paper: '#ffffff'
    },
    success: {
      main: '#2e7d32'
    }
  },
  shape: {
    borderRadius: 8
  },
  typography: {
    fontFamily: '"Segoe UI Variable", "Bahnschrift", "Trebuchet MS", sans-serif',
    h3: {
      fontWeight: 800
    },
    h4: {
      fontWeight: 700
    },
    h5: {
      fontWeight: 700
    },
    h6: {
      fontWeight: 700
    },
    button: {
      textTransform: 'none',
      fontWeight: 700
    }
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          '&:not(.MuiDialog-paper):not(.MuiDrawer-paper):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiAutocomplete-paper)': {
            borderRadius: '0 !important'
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(23, 75, 138, 0.08)',
          boxShadow: '0 14px 34px rgba(28, 45, 80, 0.07)',
          borderRadius: '0 !important'
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        size: 'small'
      },
      styleOverrides: {
        root: {
          minHeight: 34,
          padding: '7px 14px',
          borderRadius: '8px !important',
          fontSize: '0.9rem',
          lineHeight: 1.2,
          alignSelf: 'center',
          boxShadow: 'none'
        },
        contained: {
          boxShadow: 'none'
        },
        sizeSmall: {
          minHeight: 32,
          padding: '6px 12px',
          fontSize: '0.875rem'
        },
        sizeMedium: {
          minHeight: 36,
          padding: '7px 14px'
        },
        sizeLarge: {
          minHeight: 40,
          padding: '8px 18px',
          fontSize: '0.95rem'
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px !important',
          padding: 8
        },
        sizeSmall: {
          padding: 6
        },
        sizeLarge: {
          padding: 10
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: '8px !important'
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 30,
          borderRadius: '8px !important'
        },
        label: {
          paddingLeft: 10,
          paddingRight: 10
        }
      }
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 34,
          padding: '6px 12px',
          borderRadius: '8px !important'
        }
      }
    }
  }
});
