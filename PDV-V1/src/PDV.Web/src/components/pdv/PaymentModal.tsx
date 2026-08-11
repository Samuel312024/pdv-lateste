import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { digitalChargeService } from '../../services/digitalChargeService';
import type { CobrancaDigital, FinalizarVendaPagamentoRequest, FormaPagamento, PagamentoCapturaModo } from '../../types';
import { formatCurrency } from '../../utils/format';
import { getErrorMessage } from '../../utils/http';
import { getPaymentMethodMeta, paymentMethods } from '../../utils/paymentMethods';
import { MoneyInput } from '../common/MoneyInput';

interface PaymentRow extends FinalizarVendaPagamentoRequest {
  integratedCharge: CobrancaDigital | null;
  integratedBusyAction: 'creating' | 'refreshing' | null;
  integratedError: string | null;
}

interface PaymentModalProps {
  open: boolean;
  total: number;
  loading?: boolean;
  allowEmitNfe?: boolean;
  initialPaymentMethod?: FormaPagamento;
  selectedClientId?: string | null;
  selectedClientName?: string | null;
  onRequestClientRegistration?: () => void;
  onClose: () => void;
  onConfirm: (result: { payments: FinalizarVendaPagamentoRequest[]; emitirNfe: boolean }) => void;
}

const paymentCaptureModes: Array<{ value: PagamentoCapturaModo; label: string; helper: string }> = [
  {
    value: 'ManualAssistido',
    label: 'Manual assistido',
    helper: 'Use quando o pagamento ja foi confirmado fora do sistema e voce so precisa registrar a referencia, autorizacao ou comprovante.'
  },
  {
    value: 'Simulado',
    label: 'Simulado',
    helper: 'Use apenas para testes. O sistema aprova internamente e gera uma referencia simulada sem cobrar de verdade.'
  },
  {
    value: 'Integrado',
    label: 'Integrado Efí',
    helper: 'Usa a Efí para gerar cobranca real com QR Pix, boleto de apoio ou link seguro de pagamento com acompanhamento de status dentro do PDV.'
  }
];

const operationProviderOptions = [
  { value: 'RegistroManual', label: 'Registro manual' },
  { value: 'BancoApp', label: 'App do banco' },
  { value: 'MercadoPago', label: 'Mercado Pago' },
  { value: 'PagBank', label: 'PagBank' },
  { value: 'InfinitePay', label: 'InfinitePay' },
  { value: 'Stone', label: 'Stone' },
  { value: 'Ton', label: 'Ton' },
  { value: 'SumUp', label: 'SumUp' },
  { value: 'POSExterno', label: 'POS externo / avulso' },
  { value: 'Outro', label: 'Outro' }
];

const cardBrandOptions = [
  { value: 'Visa', label: 'Visa' },
  { value: 'Mastercard', label: 'Mastercard' },
  { value: 'Elo', label: 'Elo' },
  { value: 'Amex', label: 'Amex' },
  { value: 'Hipercard', label: 'Hipercard' },
  { value: 'Cabal', label: 'Cabal' },
  { value: 'Outro', label: 'Outro' }
];

const voucherBrandOptions = [
  { value: 'Alelo', label: 'Alelo' },
  { value: 'VR', label: 'VR' },
  { value: 'Ticket', label: 'Ticket' },
  { value: 'Pluxee', label: 'Pluxee / Sodexo' },
  { value: 'Flash', label: 'Flash' },
  { value: 'Caju', label: 'Caju' },
  { value: 'iFoodBeneficios', label: 'iFood Beneficios' },
  { value: 'Outro', label: 'Outro' }
];

export function PaymentModal({
  open,
  total,
  loading = false,
  allowEmitNfe = false,
  initialPaymentMethod = 'Dinheiro',
  selectedClientId = null,
  selectedClientName = null,
  onRequestClientRegistration,
  onClose,
  onConfirm
}: PaymentModalProps) {
  const [payments, setPayments] = useState<PaymentRow[]>([createPaymentRow(initialPaymentMethod, 0)]);
  const [emitNfe, setEmitNfe] = useState(false);
  const normalizedTotal = roundCurrencyValue(total);

  useEffect(() => {
    if (open) {
      setPayments([createPaymentRow(initialPaymentMethod, normalizedTotal)]);
      setEmitNfe(false);
    }
  }, [initialPaymentMethod, open, normalizedTotal]);

  const positivePayments = useMemo(() => payments.filter((payment) => payment.valorPago > 0), [payments]);
  const totalPago = roundCurrencyValue(positivePayments.reduce((sum, payment) => sum + payment.valorPago, 0));
  const faltante = roundCurrencyValue(Math.max(normalizedTotal - totalPago, 0));
  const troco = roundCurrencyValue(Math.max(totalPago - normalizedTotal, 0));
  const totalDinheiro = payments
    .filter((payment) => payment.formaPagamento === 'Dinheiro')
    .reduce((sum, payment) => sum + payment.valorPago, 0);
  const totalDinheiroArredondado = roundCurrencyValue(totalDinheiro);
  const trocoValido = troco === 0 || totalDinheiroArredondado >= troco;
  const allPaymentMethodsUsed = payments.length >= paymentMethods.length;
  const paymentErrors = payments.map((payment) => validatePaymentRow(payment, selectedClientId));
  const hasPaymentErrors = paymentErrors.some(Boolean);
  const hasSimulatedPayments = positivePayments.some((payment) => payment.capturaModo === 'Simulado' && payment.formaPagamento !== 'Dinheiro');
  const canConfirm = positivePayments.length > 0 && totalPago >= normalizedTotal && trocoValido && !loading && !hasPaymentErrors;

  useEffect(() => {
    if (!open) {
      return;
    }

    const pendingIntegratedRows = payments.filter(
      (payment) => payment.capturaModo === 'Integrado' && payment.integratedCharge?.status === 'Pendente'
    );
    if (pendingIntegratedRows.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      pendingIntegratedRows.forEach((payment) => {
        const index = payments.indexOf(payment);
        if (index >= 0) {
          void refreshIntegratedCharge(index);
        }
      });
    }, 8000);

    return () => window.clearInterval(interval);
  }, [open, payments]);

  function updatePayment(index: number, nextPayment: PaymentRow) {
    setPayments((current) => current.map((payment, rowIndex) => (rowIndex === index ? nextPayment : payment)));
  }

  function addPaymentRow() {
    if (allPaymentMethodsUsed) {
      return;
    }

    const usedMethods = new Set(payments.map((payment) => payment.formaPagamento));
    const nextMethod = paymentMethods.find((payment) => !usedMethods.has(payment.value))?.value ?? 'Pix';
    setPayments((current) => [...current, createPaymentRow(nextMethod, 0)]);
  }

  function fillRemaining(index: number) {
    if (faltante <= 0) {
      return;
    }

    setPayments((current) =>
      current.map((payment, rowIndex) =>
        rowIndex === index
          ? {
              ...payment,
              valorPago: roundCurrencyValue(payment.valorPago + faltante),
              integratedCharge: payment.capturaModo === 'Integrado' ? null : payment.integratedCharge,
              integratedError: payment.capturaModo === 'Integrado' ? 'O valor foi alterado. Gere uma nova cobranca integrada para continuar.' : payment.integratedError
            }
          : payment
      )
    );
  }

  function handleConfirm() {
    if (!canConfirm) {
      return;
    }

    onConfirm({
      payments: positivePayments.map(sanitizePaymentRowForRequest),
      emitirNfe: allowEmitNfe && emitNfe
    });
  }

  async function createIntegratedCharge(index: number) {
    const payment = payments[index];
    if (!payment || (payment.formaPagamento !== 'Pix' && payment.formaPagamento !== 'CartaoCredito')) {
      return;
    }

    if (!selectedClientId) {
      updatePayment(index, {
        ...payment,
        integratedError: 'Selecione um cliente com cadastro completo para gerar a cobranca integrada.'
      });
      return;
    }

    if (payment.valorPago <= 0) {
      updatePayment(index, {
        ...payment,
        integratedError: 'Informe um valor valido antes de gerar a cobranca integrada.'
      });
      return;
    }

    updatePayment(index, { ...payment, integratedBusyAction: 'creating', integratedError: null });

    try {
      const charge = await digitalChargeService.createCheckout({
        clienteId: selectedClientId,
        valor: payment.valorPago,
        descricao:
          payment.formaPagamento === 'CartaoCredito'
            ? `Pagamento em cartao de credito no PDV${selectedClientName ? ` - ${selectedClientName}` : ''}`
            : `Pagamento Pix no PDV${selectedClientName ? ` - ${selectedClientName}` : ''}`,
        documentoReferencia: null,
        formaPagamento: payment.formaPagamento
      });

      updatePayment(index, {
        ...payment,
        capturaModo: 'Integrado',
        integratedBusyAction: null,
        integratedError: null,
        integratedCharge: charge
      });
    } catch (error) {
      updatePayment(index, {
        ...payment,
        integratedBusyAction: null,
        integratedError: getErrorMessage(error)
      });
    }
  }

  async function refreshIntegratedCharge(index: number) {
    const payment = payments[index];
    const chargeId = payment?.integratedCharge?.cobrancaDigitalId;
    if (!payment || !chargeId) {
      return;
    }

    updatePayment(index, { ...payment, integratedBusyAction: 'refreshing', integratedError: null });

    try {
      const charge = await digitalChargeService.getById(chargeId, true);
      updatePayment(index, {
        ...payment,
        integratedBusyAction: null,
        integratedError: null,
        integratedCharge: charge
      });
    } catch (error) {
      updatePayment(index, {
        ...payment,
        integratedBusyAction: null,
        integratedError: getErrorMessage(error)
      });
    }
  }

  async function copyIntegratedValue(value: string | null | undefined) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Keep the action silent to avoid interrupting the checkout flow.
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Finalizar venda</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <SummaryCard label="Total da venda" value={formatCurrency(normalizedTotal)} tone="primary" />
            <SummaryCard
              label={faltante > 0 ? 'Valor faltante' : 'Troco previsto'}
              value={formatCurrency(faltante > 0 ? faltante : troco)}
              tone={faltante > 0 ? 'warning' : 'success'}
            />
            <SummaryCard label="Total informado" value={formatCurrency(totalPago)} tone="neutral" />
          </Stack>

          <Alert severity="info" icon={<PointOfSaleRoundedIcon fontSize="inherit" />}>
            Use dinheiro, Pix, debito, credito e voucher de forma combinada. Troco so e permitido quando houver valor
            suficiente em dinheiro.
          </Alert>

          <Alert severity="info" sx={{ borderRadius: 3 }}>
            Sem maquininha fisica, os meios eletronicos podem funcionar de tres formas: <strong>manual assistido</strong>, quando voce
            ja recebeu fora do sistema e so registra os dados da operacao, <strong>integrado Efí</strong>, quando o sistema gera a cobranca real
            por Pix ou link seguro de cartao, ou <strong>simulado</strong>, somente para teste.
          </Alert>

          {hasSimulatedPayments && (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              Existe pagamento em modo simulado nesta venda. Ele nao realiza cobranca real e deve ser usado apenas para teste, homologacao
              ou demonstracao.
            </Alert>
          )}

          {allowEmitNfe && (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Marque a opcao abaixo para gerar a NF-e junto com a venda. Se a base fiscal estiver incompleta, a nota vai nascer em rascunho com pendencias para revisao.
            </Alert>
          )}

          {allowEmitNfe && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={emitNfe}
                  onChange={(event) => setEmitNfe(event.target.checked)}
                />
              }
              label="Gerar NF-e desta venda ao confirmar o pagamento"
            />
          )}

          {payments.map((payment, index) => {
            const method = getPaymentMethodMeta(payment.formaPagamento);
            const rowError = paymentErrors[index];
            const nonCash = payment.formaPagamento !== 'Dinheiro';
            const cardLike = payment.formaPagamento === 'CartaoCredito' || payment.formaPagamento === 'CartaoDebito';
            const pixLike = payment.formaPagamento === 'Pix';
            const voucherLike = payment.formaPagamento === 'Voucher';
            const integratedRealFlow = payment.capturaModo === 'Integrado' && (pixLike || payment.formaPagamento === 'CartaoCredito');
            const canUseIntegratedFlow = pixLike || payment.formaPagamento === 'CartaoCredito';
            const captureModeOptions = canUseIntegratedFlow
              ? paymentCaptureModes
              : paymentCaptureModes.filter((option) => option.value !== 'Integrado');

            return (
              <Box
                key={`${payment.formaPagamento}-${index}`}
                sx={{
                  p: 2,
                  borderRadius: 4,
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  bgcolor: 'rgba(248, 250, 252, 0.9)'
                }}
              >
                <Stack spacing={1.75}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                      select
                      label="Forma de pagamento"
                      value={payment.formaPagamento}
                      onChange={(event) =>
                        updatePayment(index, createPaymentRow(event.target.value as FormaPagamento, payment.valorPago))
                      }
                      fullWidth
                    >
                      {paymentMethods.map((option) => (
                        <MenuItem
                          key={option.value}
                          value={option.value}
                          disabled={payments.some(
                            (currentPayment, rowIndex) =>
                              rowIndex !== index && currentPayment.formaPagamento === option.value
                          )}
                        >
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <MoneyInput
                      label="Valor informado"
                      value={payment.valorPago}
                      onChange={(value) =>
                        updatePayment(index, {
                          ...payment,
                          valorPago: roundCurrencyValue(value),
                          integratedCharge: payment.capturaModo === 'Integrado' ? null : payment.integratedCharge,
                          integratedError: payment.capturaModo === 'Integrado' ? 'O valor foi alterado. Gere uma nova cobranca integrada para continuar.' : payment.integratedError
                        })
                      }
                      fullWidth
                    />
                    <Button variant="outlined" onClick={() => fillRemaining(index)} disabled={faltante <= 0}>
                      Completar
                    </Button>
                    <IconButton
                      color="error"
                      onClick={() => setPayments((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                      disabled={payments.length === 1}
                    >
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {method.description}
                    {!method.acceptsChange ? ' Este meio nao gera troco.' : ' Este meio pode receber o troco da venda.'}
                  </Typography>

                  {nonCash && (
                    <>
                      <TextField
                        select
                        label="Processamento do pagamento"
                        value={payment.capturaModo ?? 'ManualAssistido'}
                        onChange={(event) =>
                          updatePayment(index, {
                            ...payment,
                            capturaModo: event.target.value as PagamentoCapturaModo,
                            parcelas:
                              payment.formaPagamento === 'CartaoCredito' && event.target.value === 'Integrado'
                                ? 1
                                : payment.parcelas
                          })
                        }
                        fullWidth
                      >
                        {captureModeOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {paymentCaptureModes.find((option) => option.value === payment.capturaModo)?.helper}
                      </Typography>

                      {payment.formaPagamento === 'CartaoDebito' && (
                        <Alert severity="info" sx={{ borderRadius: 3 }}>
                          A Efí nao expoe debito online neste fluxo de checkout. Para debito, mantenha o registro manual assistido
                          ou use outro adquirente especifico.
                        </Alert>
                      )}

                      {integratedRealFlow ? (
                        <Box
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            border: '1px solid rgba(22, 163, 74, 0.18)',
                            bgcolor: 'rgba(240, 253, 244, 0.8)'
                          }}
                        >
                          <Stack spacing={1.5}>
                            <Alert severity={payment.integratedCharge?.status === 'Paga' ? 'success' : 'info'} sx={{ borderRadius: 3 }}>
                              {!selectedClientId
                                ? 'Selecione um cliente com documento, telefone, e-mail e endereco completo para gerar a cobranca integrada.'
                                : payment.integratedCharge
                                  ? `Cobranca ${payment.integratedCharge.chargeIdExterno ?? payment.integratedCharge.cobrancaDigitalId} em ${payment.integratedCharge.status}.`
                                  : pixLike
                                    ? 'Gere a cobranca integrada para exibir QR Pix, linha digitavel e links profissionais.'
                                    : 'Gere o link seguro para o cliente concluir o pagamento com cartao de credito na pagina da Efí.'}
                            </Alert>

                            {payment.formaPagamento === 'CartaoCredito' && (
                              <Alert severity="info" sx={{ borderRadius: 3 }}>
                                O cliente conclui o pagamento em um link seguro da Efí. Quando o status ficar aprovado ou pago,
                                a venda pode ser confirmada no PDV. Neste fluxo atual, o checkout integrado registra parcela unica.
                              </Alert>
                            )}

                            {payment.integratedCharge?.pixQrCodeImageUrl && (
                              <Box
                                component="img"
                                src={payment.integratedCharge.pixQrCodeImageUrl}
                                alt="QR Pix"
                                sx={{
                                  width: 220,
                                  maxWidth: '100%',
                                  alignSelf: 'center',
                                  borderRadius: 3,
                                  bgcolor: '#ffffff',
                                  p: 1
                                }}
                              />
                            )}

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                              {!selectedClientId && onRequestClientRegistration && (
                                <Button variant="outlined" onClick={onRequestClientRegistration}>
                                  Cadastrar comprador
                                </Button>
                              )}
                              <Button
                                variant="contained"
                                onClick={() => void createIntegratedCharge(index)}
                                disabled={isIntegratedBusy(payment) || !selectedClientId || payment.valorPago <= 0}
                              >
                                {payment.integratedBusyAction === 'creating'
                                  ? pixLike
                                    ? 'Gerando QR Pix...'
                                    : 'Gerando link...'
                                  : payment.integratedCharge
                                  ? pixLike
                                    ? 'Gerar nova cobranca'
                                    : 'Gerar novo link'
                                  : pixLike
                                    ? 'Gerar QR Pix'
                                    : 'Gerar link seguro'}
                              </Button>
                              <Button
                                variant="outlined"
                                startIcon={<RefreshRoundedIcon />}
                                onClick={() => void refreshIntegratedCharge(index)}
                                disabled={isIntegratedBusy(payment) || !payment.integratedCharge}
                              >
                                {payment.integratedBusyAction === 'refreshing' ? 'Atualizando...' : 'Atualizar status'}
                              </Button>
                            </Stack>

                            {payment.integratedCharge && (
                              <>
                                {payment.integratedCharge.pixCopiaECola && (
                                  <TextField
                                    label="Pix copia e cola"
                                    value={payment.integratedCharge.pixCopiaECola}
                                    fullWidth
                                    multiline
                                    minRows={3}
                                    InputProps={{ readOnly: true }}
                                  />
                                )}
                                {payment.formaPagamento === 'CartaoCredito' && (
                                  <TextField
                                    label="Link de pagamento seguro"
                                    value={payment.integratedCharge.linkCobranca ?? ''}
                                    fullWidth
                                    InputProps={{ readOnly: true }}
                                  />
                                )}
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                                  {payment.integratedCharge.pixCopiaECola && (
                                    <Button
                                      variant="text"
                                      startIcon={<ContentCopyRoundedIcon />}
                                      onClick={() => void copyIntegratedValue(payment.integratedCharge?.pixCopiaECola)}
                                      disabled={!payment.integratedCharge.pixCopiaECola}
                                    >
                                      Copiar Pix
                                    </Button>
                                  )}
                                  {payment.formaPagamento === 'CartaoCredito' && (
                                    <Button
                                      variant="text"
                                      startIcon={<ContentCopyRoundedIcon />}
                                      onClick={() => void copyIntegratedValue(payment.integratedCharge?.linkCobranca)}
                                      disabled={!payment.integratedCharge.linkCobranca}
                                    >
                                      Copiar link
                                    </Button>
                                  )}
                                  <Button
                                    variant="text"
                                    startIcon={<OpenInNewRoundedIcon />}
                                    component="a"
                                    href={payment.integratedCharge.linkBoleto ?? payment.integratedCharge.linkCobranca ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    disabled={!payment.integratedCharge.linkBoleto && !payment.integratedCharge.linkCobranca}
                                  >
                                    Abrir cobranca
                                  </Button>
                                  <Button
                                    variant="text"
                                    startIcon={<OpenInNewRoundedIcon />}
                                    component="a"
                                    href={payment.integratedCharge.linkPdf ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    disabled={!payment.integratedCharge.linkPdf}
                                  >
                                    Abrir PDF
                                  </Button>
                                </Stack>
                                {payment.integratedCharge.linhaDigitavel && (
                                  <TextField
                                    label="Linha digitavel"
                                    value={payment.integratedCharge.linhaDigitavel}
                                    fullWidth
                                    InputProps={{ readOnly: true }}
                                  />
                                )}
                              </>
                            )}
                          </Stack>
                        </Box>
                      ) : (
                        <>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                            <TextField
                              label={pixLike ? 'Referencia Pix / txid / e2eId' : 'Referencia da transacao'}
                              value={payment.referenciaTransacao ?? ''}
                              onChange={(event) => updatePayment(index, { ...payment, referenciaTransacao: event.target.value || null })}
                              fullWidth
                            />
                            {cardLike || voucherLike ? (
                              <TextField
                                label="Codigo autorizacao / NSU"
                                value={payment.codigoAutorizacao ?? ''}
                                onChange={(event) => updatePayment(index, { ...payment, codigoAutorizacao: event.target.value || null })}
                                fullWidth
                              />
                            ) : (
                              <TextField
                                select
                                label="Origem / provedor"
                                value={payment.provedorOperacao ?? ''}
                                onChange={(event) => updatePayment(index, { ...payment, provedorOperacao: event.target.value || null })}
                                fullWidth
                              >
                                <MenuItem value="">Selecione</MenuItem>
                                {operationProviderOptions.map((option) => (
                                  <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                  </MenuItem>
                                ))}
                              </TextField>
                            )}
                          </Stack>

                          {(cardLike || voucherLike) && (
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                              <TextField
                                select
                                label="Provedor / terminal"
                                value={payment.provedorOperacao ?? ''}
                                onChange={(event) => updatePayment(index, { ...payment, provedorOperacao: event.target.value || null })}
                                fullWidth
                              >
                                <MenuItem value="">Selecione</MenuItem>
                                {operationProviderOptions.map((option) => (
                                  <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <TextField
                                select
                                label={voucherLike ? 'Bandeira / convenio' : 'Bandeira do cartao'}
                                value={payment.bandeiraCartao ?? ''}
                                onChange={(event) => updatePayment(index, { ...payment, bandeiraCartao: event.target.value || null })}
                                fullWidth
                              >
                                <MenuItem value="">Selecione</MenuItem>
                                {(voucherLike ? voucherBrandOptions : cardBrandOptions).map((option) => (
                                  <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                  </MenuItem>
                                ))}
                              </TextField>
                              {cardLike && (
                                <TextField
                                  label="Ultimos 4 do cartao"
                                  value={payment.ultimosDigitosCartao ?? ''}
                                  onChange={(event) =>
                                    updatePayment(index, {
                                      ...payment,
                                      ultimosDigitosCartao: event.target.value.replace(/\D/g, '').slice(0, 4) || null
                                    })
                                  }
                                  fullWidth
                                />
                              )}
                              {payment.formaPagamento === 'CartaoCredito' && (
                                <TextField
                                  label="Parcelas"
                                  type="number"
                                  value={payment.parcelas ?? 1}
                                  onChange={(event) =>
                                    updatePayment(index, {
                                      ...payment,
                                      parcelas: Number(event.target.value) || 1
                                    })
                                  }
                                  inputProps={{ min: 1, max: 24 }}
                                  disabled={payment.capturaModo === 'Integrado'}
                                  fullWidth
                                />
                              )}
                            </Stack>
                          )}

                          <TextField
                            label="Observacao da operacao"
                            value={payment.observacaoOperacao ?? ''}
                            onChange={(event) => updatePayment(index, { ...payment, observacaoOperacao: event.target.value || null })}
                            helperText={
                              payment.capturaModo === 'Simulado'
                                ? 'Em modo simulado, o sistema gera aprovacao interna sem cobrar de verdade.'
                                : 'Exemplos: pago no app do banco, link quitado, terminal avulso, comprovante conferido.'
                            }
                            fullWidth
                          />
                        </>
                      )}
                    </>
                  )}

                  {rowError && (
                    <Alert severity="warning" sx={{ borderRadius: 3 }}>
                      {rowError}
                    </Alert>
                  )}
                  {payment.integratedError && (
                    <Alert severity="error" sx={{ borderRadius: 3 }}>
                      {payment.integratedError}
                    </Alert>
                  )}
                </Stack>
              </Box>
            );
          })}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addPaymentRow} disabled={allPaymentMethodsUsed || loading}>
              Adicionar outro meio
            </Button>
            <Button
              variant="text"
              onClick={() => setPayments([createPaymentRow(initialPaymentMethod, normalizedTotal)])}
              disabled={loading || (payments.length === 1 && payments[0]?.formaPagamento === initialPaymentMethod && payments[0]?.valorPago === normalizedTotal)}
            >
              Voltar para pagamento unico
            </Button>
          </Stack>

          {allPaymentMethodsUsed && (
            <Alert severity="info">
              Todos os meios de pagamento disponiveis ja foram adicionados nesta venda.
            </Alert>
          )}

          {!trocoValido && (
            <Alert severity="error">
              O troco previsto esta maior que o total informado em dinheiro. Ajuste os valores ou adicione dinheiro na
              composicao do pagamento.
            </Alert>
          )}

          {faltante > 0 && (
            <Alert severity="warning">
              Ainda faltam {formatCurrency(faltante)} para concluir a venda.
            </Alert>
          )}

          {troco > 0 && trocoValido && (
            <Alert severity="success">
              Troco previsto de {formatCurrency(troco)}. O caixa vai registrar apenas o liquido recebido em dinheiro.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
          Confirmar venda
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  tone: 'primary' | 'warning' | 'success' | 'neutral';
}

function SummaryCard({ label, value, tone }: SummaryCardProps) {
  const backgrounds = {
    primary: 'linear-gradient(135deg, rgba(23, 75, 138, 0.14), rgba(23, 75, 138, 0.06))',
    warning: 'linear-gradient(135deg, rgba(209, 127, 52, 0.18), rgba(209, 127, 52, 0.07))',
    success: 'linear-gradient(135deg, rgba(46, 125, 50, 0.18), rgba(46, 125, 50, 0.07))',
    neutral: 'linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.04))'
  } as const;

  return (
    <Box
      sx={{
        flex: 1,
        p: 2.25,
        borderRadius: 4,
        background: backgrounds[tone]
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.75 }}>
        {value}
      </Typography>
    </Box>
  );
}

function createPaymentRow(formaPagamento: FormaPagamento, valorPago: number): PaymentRow {
  return {
    formaPagamento,
    valorPago: roundCurrencyValue(valorPago),
    capturaModo: formaPagamento === 'Dinheiro' ? 'ManualAssistido' : 'ManualAssistido',
    provedorOperacao: null,
    referenciaTransacao: null,
    codigoAutorizacao: null,
    bandeiraCartao: null,
    ultimosDigitosCartao: null,
    parcelas: formaPagamento === 'CartaoCredito' ? 1 : null,
    observacaoOperacao: null,
    integratedCharge: null,
    integratedBusyAction: null,
    integratedError: null
  };
}

function isIntegratedBusy(payment: PaymentRow) {
  return payment.integratedBusyAction !== null;
}

function roundCurrencyValue(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function validatePaymentRow(payment: PaymentRow, selectedClientId: string | null) {
  if (payment.valorPago <= 0) {
    return null;
  }

  if (payment.formaPagamento === 'Dinheiro') {
    return null;
  }

  if (payment.capturaModo === 'Integrado') {
    if (payment.formaPagamento !== 'Pix' && payment.formaPagamento !== 'CartaoCredito') {
      return 'A cobranca integrada desta fase esta disponivel para Pix e cartao de credito.';
    }

    if (payment.formaPagamento === 'CartaoCredito' && (payment.parcelas ?? 1) !== 1) {
      return 'No link integrado da Efí, o fluxo atual do PDV confirma cartao de credito em parcela unica.';
    }

    if (!selectedClientId) {
      return 'Selecione um cliente com cadastro completo para gerar a cobranca integrada.';
    }

    if (!payment.integratedCharge) {
      return 'Gere a cobranca integrada antes de confirmar a venda.';
    }

    if (Math.abs(payment.integratedCharge.valorOriginal - payment.valorPago) > 0.01) {
      return 'O valor do Pix integrado mudou. Gere uma nova cobranca para continuar.';
    }

    if (payment.integratedCharge.status !== 'Paga') {
      return `A cobranca integrada ainda esta em ${payment.integratedCharge.status}. Aguarde a quitacao antes de confirmar.`;
    }

    return null;
  }

  if (payment.capturaModo === 'Simulado') {
    return null;
  }

  if (payment.formaPagamento === 'Pix' && !payment.referenciaTransacao?.trim()) {
    return 'Informe a referencia do Pix, como txid, e2eId ou comprovante.';
  }

  if (
    (payment.formaPagamento === 'CartaoCredito' || payment.formaPagamento === 'CartaoDebito' || payment.formaPagamento === 'Voucher') &&
    !payment.referenciaTransacao?.trim() &&
    !payment.codigoAutorizacao?.trim()
  ) {
    return 'Informe a referencia da transacao ou o codigo de autorizacao para este meio de pagamento.';
  }

  if (payment.ultimosDigitosCartao && payment.ultimosDigitosCartao.length !== 4) {
    return 'Ultimos digitos do cartao devem conter 4 numeros.';
  }

  if (payment.formaPagamento === 'CartaoCredito' && payment.parcelas !== null && (payment.parcelas < 1 || payment.parcelas > 24)) {
    return 'Parcelas do cartao de credito devem ficar entre 1 e 24.';
  }

  return null;
}

function sanitizePaymentRowForRequest(payment: PaymentRow): FinalizarVendaPagamentoRequest {
  const integratedCharge = payment.integratedCharge;
  const integratedObservation = payment.capturaModo === 'Integrado' && integratedCharge
    ? payment.formaPagamento === 'CartaoCredito'
      ? `Cobranca digital Efí ${integratedCharge.chargeIdExterno ?? integratedCharge.cobrancaDigitalId} confirmada no link seguro de cartao.`
      : `Cobranca digital Efí ${integratedCharge.chargeIdExterno ?? integratedCharge.cobrancaDigitalId} confirmada como paga.`
    : null;

  return {
    formaPagamento: payment.formaPagamento,
    valorPago: Number(payment.valorPago.toFixed(2)),
    capturaModo: payment.formaPagamento === 'Dinheiro' ? 'ManualAssistido' : payment.capturaModo === 'Integrado' ? 'ManualAssistido' : payment.capturaModo,
    provedorOperacao: payment.capturaModo === 'Integrado' ? 'Efi' : emptyToNull(payment.provedorOperacao),
    referenciaTransacao: payment.capturaModo === 'Integrado'
      ? integratedCharge?.chargeIdExterno ?? integratedCharge?.cobrancaDigitalId ?? null
      : emptyToNull(payment.referenciaTransacao),
    codigoAutorizacao: emptyToNull(payment.codigoAutorizacao),
    bandeiraCartao: emptyToNull(payment.bandeiraCartao),
    ultimosDigitosCartao: emptyToNull(payment.ultimosDigitosCartao),
    parcelas: payment.formaPagamento === 'CartaoCredito' ? (payment.parcelas ?? 1) : null,
    observacaoOperacao: emptyToNull(
      [payment.observacaoOperacao, integratedObservation].filter(Boolean).join(' ')
    )
  };
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
