import BackspaceRoundedIcon from '@mui/icons-material/BackspaceRounded';
import KeyboardReturnRoundedIcon from '@mui/icons-material/KeyboardReturnRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { Box, Button, Stack, Typography } from '@mui/material';

export type PdvTouchShortcutAction =
  | 'focusBarcode'
  | 'focusProductSearch'
  | 'focusClient'
  | 'openCashier'
  | 'supply'
  | 'withdrawal'
  | 'priceCheck'
  | 'operatorShift'
  | 'paymentCash'
  | 'paymentPix'
  | 'paymentDebit'
  | 'paymentCredit'
  | 'paymentVoucher'
  | 'paymentOther'
  | 'setConsumerFinal'
  | 'finalizeSale'
  | 'decrementLastItem'
  | 'removeLastItem'
  | 'clearSale'
  | 'cancel';

export interface PdvTouchInfoCard {
  label: string;
  value: string;
  tone?: 'neutral' | 'info' | 'warning' | 'success';
  action?: PdvTouchShortcutAction;
}

interface PdvTouchKeyboardProps {
  primaryMessage: string;
  secondaryMessage: string;
  currentCode: string;
  infoCards: PdvTouchInfoCard[];
  disabled?: boolean;
  onInfoCardAction?: (action: PdvTouchShortcutAction) => void;
  onDigit: (fragment: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onConfirm: () => void;
  onShortcut: (action: PdvTouchShortcutAction) => void;
}

interface KeyboardShortcut {
  label: string;
  action: PdvTouchShortcutAction;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'accent';
}

const shortcutRows: KeyboardShortcut[][] = [
  [
    { label: 'Abrir / Fechar Caixa', action: 'openCashier', tone: 'neutral' },
    { label: 'Suprimento', action: 'supply', tone: 'info' },
    { label: 'Entrada / Saida Operador', action: 'operatorShift', tone: 'info' },
    { label: 'Sangria', action: 'withdrawal', tone: 'info' },
    { label: 'Consulta Preco', action: 'priceCheck', tone: 'info' },
    { label: 'CPF / Cliente', action: 'focusClient', tone: 'neutral' }
  ],
  [
    { label: 'Outros Itens', action: 'focusProductSearch', tone: 'warning' },
    { label: 'Digitar Codigo', action: 'focusBarcode', tone: 'warning' },
    { label: 'Consumidor Final', action: 'setConsumerFinal', tone: 'neutral' },
    { label: 'Pix', action: 'paymentPix', tone: 'success' },
    { label: 'Dinheiro', action: 'paymentCash', tone: 'success' },
    { label: 'Vale Troca', action: 'paymentVoucher', tone: 'accent' },
    { label: 'Outras Formas Pgto', action: 'paymentOther', tone: 'accent' }
  ],
  [
    { label: 'Debito', action: 'paymentDebit', tone: 'neutral' },
    { label: 'Credito', action: 'paymentCredit', tone: 'neutral' },
    { label: 'Finalizar Venda', action: 'finalizeSale', tone: 'success' },
    { label: 'Ultimo Item -1', action: 'decrementLastItem', tone: 'warning' },
    { label: 'Remover Ultimo', action: 'removeLastItem', tone: 'warning' },
    { label: 'Limpar Venda', action: 'clearSale', tone: 'warning' },
  ],
  [
    { label: 'Sair / Cancelar', action: 'cancel', tone: 'warning' }
  ]
];

const keypadRows = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['0', '00']
] as const;

export function PdvTouchKeyboard({
  primaryMessage,
  secondaryMessage,
  currentCode,
  infoCards,
  disabled = false,
  onInfoCardAction,
  onDigit,
  onBackspace,
  onClear,
  onConfirm,
  onShortcut
}: PdvTouchKeyboardProps) {
  return (
    <Stack spacing={2.25}>
      <Box
        sx={{
          borderRadius: 3,
          border: '2px solid rgba(47, 62, 70, 0.28)',
          bgcolor: '#8bb58d',
          px: 2.5,
          py: 1.75,
          minHeight: 108,
          boxShadow: 'inset 0 1px 12px rgba(20, 32, 20, 0.18)'
        }}
      >
        <Typography
          sx={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#142014',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {primaryMessage}
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontFamily: '"Roboto Mono", monospace',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#142014',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {secondaryMessage}
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontFamily: '"Roboto Mono", monospace',
            fontSize: 13,
            color: '#203120',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {currentCode ? `CODIGO ${currentCode}` : 'AGUARDANDO LEITURA OU DIGITACAO'}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 1.25,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: `repeat(${Math.max(infoCards.length, 4)}, minmax(0, 1fr))`
          }
        }}
      >
        {infoCards.map((card) => (
          <Box
            key={card.label}
            role={card.action ? 'button' : undefined}
            tabIndex={card.action ? 0 : undefined}
            onClick={card.action ? () => onInfoCardAction?.(card.action!) : undefined}
            onKeyDown={card.action
              ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onInfoCardAction?.(card.action!);
                }
              }
              : undefined}
            sx={buildInfoCardSx(card.tone ?? 'neutral', Boolean(card.action && onInfoCardAction))}
          >
            <Typography variant="caption" sx={{ opacity: 0.82, textTransform: 'uppercase', letterSpacing: 0.9 }}>
              {card.label}
            </Typography>
            <Typography sx={{ mt: 0.65, fontWeight: 900, fontSize: 18, lineHeight: 1.15 }}>
              {card.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {shortcutRows.map((row, rowIndex) => (
        <Box
          key={`shortcut-row-${rowIndex}`}
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${Math.min(row.length, 3)}, minmax(0, 1fr))`,
              md: `repeat(${row.length}, minmax(0, 1fr))`
            }
          }}
        >
          {row.map((shortcut) => (
            <Button
              key={shortcut.label}
              variant="contained"
              disabled={disabled}
              onClick={() => onShortcut(shortcut.action)}
              sx={buildShortcutButtonSx(shortcut.tone)}
            >
              {shortcut.label}
            </Button>
          ))}
        </Box>
      ))}

      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: {
            xs: '1fr',
            lg: '1.25fr 0.75fr'
          }
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: {
              xs: 'repeat(3, minmax(0, 1fr))',
              md: 'repeat(5, minmax(0, 1fr))'
            }
          }}
        >
          {keypadRows.flat().map((digit) => (
            <Button
              key={digit}
              variant="contained"
              disabled={disabled}
              onClick={() => onDigit(digit)}
              sx={buildNumericButtonSx()}
            >
              {digit}
            </Button>
          ))}
        </Box>

        <Stack
          spacing={1}
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(3, minmax(0, 1fr))',
              lg: '1fr'
            }
          }}
        >
          <Button
            variant="contained"
            disabled={disabled}
            startIcon={<BackspaceRoundedIcon />}
            onClick={onBackspace}
            sx={buildActionButtonSx('#5f6b73')}
          >
            Apagar
          </Button>
          <Button
            variant="contained"
            disabled={disabled}
            startIcon={<RestartAltRoundedIcon />}
            onClick={onClear}
            sx={buildActionButtonSx('#d17f34')}
          >
            Limpar
          </Button>
          <Button
            variant="contained"
            disabled={disabled}
            startIcon={<KeyboardReturnRoundedIcon />}
            onClick={onConfirm}
            sx={buildActionButtonSx('#174b8a', 2)}
          >
            Confirmar
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

function buildInfoCardSx(tone: NonNullable<PdvTouchInfoCard['tone']>, interactive = false) {
  const palette = {
    neutral: { background: 'rgba(255,255,255,0.78)', color: '#24323d', border: 'rgba(36, 50, 61, 0.08)' },
    info: { background: 'rgba(121, 205, 211, 0.18)', color: '#123542', border: 'rgba(18, 53, 66, 0.08)' },
    warning: { background: 'rgba(242, 197, 114, 0.22)', color: '#5a3c10', border: 'rgba(90, 60, 16, 0.08)' },
    success: { background: 'rgba(125, 200, 139, 0.22)', color: '#17341d', border: 'rgba(23, 52, 29, 0.08)' }
  }[tone];

  return {
    minHeight: 78,
    borderRadius: 2.5,
    px: 1.5,
    py: 1.35,
    border: `1px solid ${palette.border}`,
    bgcolor: palette.background,
    color: palette.color,
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
    ...(interactive
      ? {
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 18px rgba(17, 24, 39, 0.10)'
        },
        '&:focus-visible': {
          outline: '2px solid rgba(23, 75, 138, 0.45)',
          outlineOffset: 2
        }
      }
      : null)
  };
}

function buildShortcutButtonSx(tone: KeyboardShortcut['tone']) {
  const palette = {
    neutral: { background: '#f2f4f7', color: '#24323d', hover: '#e7ebf0' },
    info: { background: '#79cdd3', color: '#123542', hover: '#68c1c9' },
    warning: { background: '#f2c572', color: '#5a3c10', hover: '#ecb95c' },
    success: { background: '#7dc88b', color: '#17341d', hover: '#6dbe7d' },
    accent: { background: '#d8d0a4', color: '#473e17', hover: '#cfc68f' }
  }[tone];

  return {
    minHeight: 64,
    borderRadius: 2.5,
    px: 1,
    py: 1.25,
    boxShadow: '0 6px 16px rgba(17, 24, 39, 0.12)',
    fontSize: 12.5,
    fontWeight: 800,
    lineHeight: 1.15,
    textAlign: 'center',
    textTransform: 'none',
    backgroundColor: palette.background,
    color: palette.color,
    '&:hover': {
      backgroundColor: palette.hover
    }
  };
}

function buildNumericButtonSx() {
  return {
    minHeight: 82,
    borderRadius: 2.5,
    boxShadow: '0 6px 16px rgba(17, 24, 39, 0.12)',
    fontSize: 24,
    fontWeight: 900,
    backgroundColor: '#ffffff',
    color: '#1f2937',
    '&:hover': {
      backgroundColor: '#f5f7fb'
    }
  };
}

function buildActionButtonSx(backgroundColor: string, flex = 1) {
  return {
    minHeight: 82,
    flex,
    borderRadius: 2.5,
    boxShadow: '0 6px 16px rgba(17, 24, 39, 0.12)',
    fontSize: 15,
    fontWeight: 800,
    textTransform: 'none',
    backgroundColor,
    color: '#ffffff',
    '&:hover': {
      backgroundColor
    }
  };
}
