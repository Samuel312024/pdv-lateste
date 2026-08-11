import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CashierAccessPanel } from '../components/cashier/CashierAccessPanel';
import { Loading } from '../components/common/Loading';
import { ManagerOverrideDialog } from '../components/common/ManagerOverrideDialog';
import { MoneyInput } from '../components/common/MoneyInput';
import { useAuth } from '../contexts/AuthContext';
import { cashService } from '../services/cashService';
import type { Caixa, LiberacaoGerentePayload } from '../types';
import { hasCashierAccess } from '../utils/cashierAccess';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';

type CashAction = 'sangria' | 'suprimento' | 'fechamento' | null;

interface PendingManagerCashAction {
  action: 'abertura' | 'sangria' | 'suprimento' | 'fechamento';
  amount: number;
  note: string;
}

export function CashierPage() {
  const [loading, setLoading] = useState(true);
  const [cashier, setCashier] = useState<Caixa | null>(null);
  const [openingAmount, setOpeningAmount] = useState(0);
  const [action, setAction] = useState<CashAction>(null);
  const [actionAmount, setActionAmount] = useState(0);
  const [actionNote, setActionNote] = useState('');
  const [pendingManagerAction, setPendingManagerAction] = useState<PendingManagerCashAction | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, session } = useAuth();
  const navigate = useNavigate();
  const accessGranted = hasCashierAccess(session);

  useEffect(() => {
    if (!accessGranted) {
      setLoading(false);
      setCashier(null);
      return;
    }

    void loadCashier();
  }, [accessGranted, session?.usuario.usuarioId]);

  async function loadCashier() {
    setLoading(true);
    try {
      const result = await cashService.getOpen();
      setCashier(result);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function openCashier(liberacaoGerente?: LiberacaoGerentePayload | null) {
    try {
      const result = await cashService.open(openingAmount, liberacaoGerente);
      setCashier(result);
      enqueueSnackbar('Caixa aberto com sucesso.', { variant: 'success' });
      return true;
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      return false;
    }
  }

  async function executeAction(liberacaoGerente?: LiberacaoGerentePayload | null) {
    try {
      if (action === 'sangria') {
        setCashier(await cashService.sangria(actionAmount, actionNote, liberacaoGerente));
        enqueueSnackbar('Sangria registrada.', { variant: 'success' });
      }

      if (action === 'suprimento') {
        setCashier(await cashService.suprimento(actionAmount, actionNote, liberacaoGerente));
        enqueueSnackbar('Suprimento registrado.', { variant: 'success' });
      }

      if (action === 'fechamento') {
        setCashier(await cashService.close(actionAmount, actionNote, liberacaoGerente));
        enqueueSnackbar('Caixa fechado com sucesso.', { variant: 'success' });
      }

      setAction(null);
      setActionAmount(0);
      setActionNote('');
      await loadCashier();
      return true;
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      return false;
    }
  }

  async function handleOpenCashier() {
    setPendingManagerAction({ action: 'abertura', amount: openingAmount, note: '' });
  }

  async function handleAction() {
    if (action === 'sangria' && !hasPermission('SangriaCaixa')) {
      setPendingManagerAction({ action: 'sangria', amount: actionAmount, note: actionNote });
      return;
    }

    if (action === 'suprimento' && !hasPermission('SuprimentoCaixa')) {
      setPendingManagerAction({ action: 'suprimento', amount: actionAmount, note: actionNote });
      return;
    }

    if (action === 'fechamento' && !hasPermission('FecharCaixa')) {
      setPendingManagerAction({ action: 'fechamento', amount: actionAmount, note: actionNote });
      return;
    }

    await executeAction();
  }

  async function handleManagerApproval(payload: LiberacaoGerentePayload) {
    if (!pendingManagerAction) {
      return;
    }

    if (pendingManagerAction.action === 'abertura') {
      const success = await openCashier(payload);
      if (success) {
        setPendingManagerAction(null);
      }
      return;
    }

    const success = await executeAction(payload);
    if (success) {
      setPendingManagerAction(null);
    }
  }

  if (loading) {
    return <Loading message="Verificando caixa..." />;
  }

  if (!accessGranted) {
    return (
      <CashierAccessPanel
        accessPath="/caixa"
        embedded
        onAuthenticated={() => void loadCashier()}
      />
    );
  }

  if (!cashier) {
    return (
      <>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4">Abrir caixa</Typography>
            <Typography color="text.secondary">Sem caixa aberto para este usuario. Abra o caixa antes de vender.</Typography>
          </Box>

          <Card sx={{ maxWidth: 480, borderRadius: 5 }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography color="text.secondary">
                  A abertura do caixa exige o cracha ou e-mail e a senha do gerente autorizador.
                </Typography>
                <MoneyInput label="Valor inicial" value={openingAmount} onChange={setOpeningAmount} fullWidth />
                <Button variant="contained" onClick={() => void handleOpenCashier()}>
                  Abrir caixa com gerente
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <ManagerOverrideDialog
          open={Boolean(pendingManagerAction)}
          actionCode={resolveManagerActionCode(pendingManagerAction?.action ?? null)}
          title={resolveManagerActionTitle(pendingManagerAction?.action ?? null)}
          description={resolveManagerActionDescription(pendingManagerAction?.action ?? null)}
          confirmLabel="Liberar caixa"
          onCancel={() => setPendingManagerAction(null)}
          onConfirm={(payload) => handleManagerApproval(payload)}
        />
      </>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Caixa</Typography>
        <Typography color="text.secondary">Acompanhe abertura, entradas manuais, saidas e fechamento do expediente.</Typography>
      </Box>

      <Grid container spacing={2.5}>
        {[
          { label: 'Abertura', value: formatDateTime(cashier.dataAbertura) },
          { label: 'Valor inicial', value: formatCurrency(cashier.valorInicial) },
          { label: 'Total vendido', value: formatCurrency(cashier.valorTotalVendas) },
          { label: 'Dinheiro esperado', value: formatCurrency(cashier.valorEsperadoEmDinheiro) },
          { label: 'Recebido em dinheiro', value: formatCurrency(cashier.valorDinheiro) },
          { label: 'Recebido em Pix', value: formatCurrency(cashier.valorPix) },
          { label: 'Recebido em debito', value: formatCurrency(cashier.valorCartaoDebito) },
          { label: 'Recebido em credito', value: formatCurrency(cashier.valorCartaoCredito) },
          { label: 'Recebido em voucher', value: formatCurrency(cashier.valorVoucher) },
          { label: 'Sangrias', value: formatCurrency(cashier.valorSangria) },
          { label: 'Suprimentos', value: formatCurrency(cashier.valorSuprimento) }
        ].map((card) => (
          <Grid key={card.label} item xs={12} sm={6} lg={4}>
            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Typography color="text.secondary">{card.label}</Typography>
                <Typography variant="h6" sx={{ mt: 1 }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <Button variant="contained" startIcon={<PointOfSaleRoundedIcon />} onClick={() => navigate('/pdv')}>
          Ir para o PDV
        </Button>
        <Button variant="outlined" onClick={() => setAction('sangria')}>
          Registrar sangria
        </Button>
        <Button variant="outlined" onClick={() => setAction('suprimento')}>
          Registrar suprimento
        </Button>
        <Button color="error" variant="outlined" onClick={() => setAction('fechamento')}>
          Fechar caixa
        </Button>
      </Stack>

      <Dialog open={Boolean(action)} onClose={() => setAction(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {action === 'sangria' && 'Registrar sangria'}
          {action === 'suprimento' && 'Registrar suprimento'}
          {action === 'fechamento' && 'Fechar caixa'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {action === 'fechamento' && cashier && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 4,
                  bgcolor: 'rgba(23, 75, 138, 0.06)',
                  border: '1px solid rgba(23, 75, 138, 0.08)'
                }}
              >
                <Stack spacing={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Fechamento detalhado do caixa
                  </Typography>
                  <Typography variant="body2">Total vendido: {formatCurrency(cashier.valorTotalVendas)}</Typography>
                  <Typography variant="body2">Recebido em dinheiro: {formatCurrency(cashier.valorDinheiro)}</Typography>
                  <Typography variant="body2">Recebido em Pix: {formatCurrency(cashier.valorPix)}</Typography>
                  <Typography variant="body2">Recebido em debito: {formatCurrency(cashier.valorCartaoDebito)}</Typography>
                  <Typography variant="body2">Recebido em credito: {formatCurrency(cashier.valorCartaoCredito)}</Typography>
                  <Typography variant="body2">Recebido em voucher: {formatCurrency(cashier.valorVoucher)}</Typography>
                  <Typography variant="body2">Sangrias: {formatCurrency(cashier.valorSangria)}</Typography>
                  <Typography variant="body2">Suprimentos: {formatCurrency(cashier.valorSuprimento)}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Dinheiro esperado no caixa: {formatCurrency(cashier.valorEsperadoEmDinheiro)}
                  </Typography>
                  {actionAmount > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Diferenca projetada com o valor contado: {formatCurrency(actionAmount - cashier.valorEsperadoEmDinheiro)}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            <MoneyInput
              label={action === 'fechamento' ? 'Valor contado em dinheiro' : 'Valor'}
              value={actionAmount}
              onChange={setActionAmount}
              fullWidth
            />
            <TextField
              label="Observacao"
              value={actionNote}
              onChange={(event) => setActionNote(event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setAction(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleAction()}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
      <ManagerOverrideDialog
        open={Boolean(pendingManagerAction)}
        actionCode={resolveManagerActionCode(pendingManagerAction?.action ?? null)}
        title={resolveManagerActionTitle(pendingManagerAction?.action ?? null)}
        description={resolveManagerActionDescription(pendingManagerAction?.action ?? null)}
        confirmLabel="Liberar caixa"
        onCancel={() => setPendingManagerAction(null)}
        onConfirm={(payload) => handleManagerApproval(payload)}
      />
    </Stack>
  );
}

function resolveManagerActionCode(action: PendingManagerCashAction['action'] | null) {
  switch (action) {
    case 'abertura':
      return 'AbrirCaixa';
    case 'sangria':
      return 'SangriaCaixa';
    case 'suprimento':
      return 'SuprimentoCaixa';
    case 'fechamento':
      return 'FecharCaixa';
    default:
      return 'AbrirCaixa';
  }
}

function resolveManagerActionTitle(action: PendingManagerCashAction['action'] | null) {
  switch (action) {
    case 'abertura':
      return 'Liberacao gerencial para abrir caixa';
    case 'sangria':
      return 'Liberacao gerencial para sangria';
    case 'suprimento':
      return 'Liberacao gerencial para suprimento';
    case 'fechamento':
      return 'Liberacao gerencial para fechar caixa';
    default:
      return 'Liberacao gerencial';
  }
}

function resolveManagerActionDescription(action: PendingManagerCashAction['action'] | null) {
  switch (action) {
    case 'abertura':
      return 'Para abrir o caixa, informe o cracha ou e-mail do gerente e confirme a senha para registrar a autorizacao.';
    case 'sangria':
      return 'A sangria solicitada depende de liberacao gerencial. Informe o cracha ou e-mail do gerente e confirme a senha para prosseguir.';
    case 'suprimento':
      return 'O suprimento solicitado depende de liberacao gerencial. Informe o cracha ou e-mail do gerente e confirme a senha para prosseguir.';
    case 'fechamento':
      return 'O fechamento do caixa depende de liberacao gerencial para este operador. Informe o cracha ou e-mail do gerente e confirme a senha para concluir.';
    default:
      return 'Informe o cracha ou e-mail do gerente e confirme a senha para liberar esta operacao.';
  }
}
