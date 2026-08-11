import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScannerActionBar } from '../components/scanner/ScannerActionBar';
import { useAuth } from '../contexts/AuthContext';
import { useScanner } from '../hooks/useScanner';
import { terminalService, type TerminalPdvPayload } from '../services/terminalService';
import type {
  TerminalPerfilImpressora,
  TerminalPerfilInstalacao,
  TerminalPerfilScanner,
  TerminalPerfilTeclado,
  TerminalPdv,
  Venda
} from '../types';
import { formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import { getPdvInstallerDownloadUrl, getPdvInstallerDownloadUrlAbsolute } from '../utils/installer';
import { printSaleReceipt } from '../utils/receiptPrinter';
import {
  getTerminalKeyboardLabel,
  getTerminalPrinterLabel,
  getTerminalScannerLabel,
  resolveReceiptPaperWidth,
  terminalKeyboardOptions,
  terminalPrinterOptions,
  terminalScannerOptions
} from '../utils/terminalPeripheralProfiles';
import { ufOptions } from '../utils/ufs';

type HardwareTab = 'diagnostico' | 'terminais';

interface TerminalActivationSnapshot {
  codigoTerminal: string;
  nomeTerminal: string;
  chaveAtivacao: string;
  chaveGeradaEm: string;
}

const TERMINAL_INSTALLATION_OPTIONS: Array<{ value: TerminalPerfilInstalacao; label: string; description: string }> = [
  { value: 'PRD', label: 'PRD', description: 'Producao real da loja, pronta para operar com perifericos oficiais.' },
  { value: 'HML', label: 'HML', description: 'Homologacao com o fluxo normal de testes da operacao.' },
  {
    value: 'HML_PERIFERICOS_MOCK',
    label: 'HML + perifericos mock',
    description: 'Homologacao com simulacao de hardware quando a bancada ainda nao esta pronta.'
  },
  {
    value: 'HML_COMPLETO_MOCK',
    label: 'HML completo mock',
    description: 'Fluxo todo mockado para bancada, treinamento e validacao acelerada.'
  }
];

const INITIAL_TERMINAL_FORM: TerminalPdvPayload = {
  nomeTerminal: '',
  lojaNome: '',
  estadoUf: '',
  numeroPdv: 1,
  perfilInstalacao: 'PRD',
  perfilImpressora: 'TERMICA_80MM',
  perfilScanner: 'HIBRIDO',
  perfilTeclado: 'PADRAO_PDV',
  impressaoAutomatica: true,
  observacao: ''
};

export function HardwarePage() {
  const [activeTab, setActiveTab] = useState<HardwareTab>('diagnostico');
  const [scannerValue, setScannerValue] = useState('');
  const [recentCodes, setRecentCodes] = useState<string[]>([]);
  const [terminalForm, setTerminalForm] = useState<TerminalPdvPayload>(INITIAL_TERMINAL_FORM);
  const [terminals, setTerminals] = useState<TerminalPdv[]>([]);
  const [loadingTerminals, setLoadingTerminals] = useState(false);
  const [savingTerminal, setSavingTerminal] = useState(false);
  const [terminalActionId, setTerminalActionId] = useState<string | null>(null);
  const [latestActivation, setLatestActivation] = useState<TerminalActivationSnapshot | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const terminalNameInputRef = useRef<HTMLInputElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { session, hasPermission } = useAuth();
  const installerDownloadUrl = getPdvInstallerDownloadUrl();

  const canManageTerminals = hasPermission('GerenciarUsuarios') || Boolean(session?.usuario.isMaster);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (activeTab === 'terminais' && canManageTerminals) {
        terminalNameInputRef.current?.focus();
        return;
      }

      scannerInputRef.current?.focus();
    });
  }, [activeTab, canManageTerminals]);

  useEffect(() => {
    if (!canManageTerminals) {
      return;
    }

    void loadTerminals();
  }, [canManageTerminals]);

  function registerCode(code: string) {
    const normalized = code.trim();
    if (!normalized) {
      return;
    }

    setScannerValue(normalized);
    setRecentCodes((current) => [normalized, ...current.filter((item) => item !== normalized)].slice(0, 8));
    enqueueSnackbar(`Codigo lido: ${normalized}`, { variant: 'success' });
    requestAnimationFrame(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    });
  }

  function handleKeyboardScanner(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    registerCode(scannerValue);
  }

  useScanner(async (event) => {
    if (activeTab !== 'diagnostico') {
      return;
    }

    registerCode(event.codigoBarras);
  });

  const terminalStats = useMemo(
    () => ({
      total: terminals.length,
      ativos: terminals.filter((item) => item.ativo).length,
      ativados: terminals.filter((item) => item.ativo && item.ativado).length,
      pendentes: terminals.filter((item) => item.ativo && !item.ativado).length
    }),
    [terminals]
  );

  const sampleSale = useMemo<Venda>(
    () => ({
      vendaId: '00000000-0000-0000-0000-000000000001',
      empresaId: session?.usuario.empresaId ?? '00000000-0000-0000-0000-000000000001',
      caixaId: '00000000-0000-0000-0000-000000000002',
      usuarioId: session?.usuario.usuarioId ?? '00000000-0000-0000-0000-000000000003',
      clienteId: null,
      clienteNome: null,
      numeroVenda: 'TESTE-HARDWARE',
      dataVenda: new Date().toISOString(),
      subtotal: 29.9,
      descontoTotal: 0,
      total: 29.9,
      status: 'Finalizada',
      ehPedido: false,
      atendimentoTipo: null,
      pedidoStatus: null,
      codigoAcompanhamento: null,
      contatoNome: null,
      contatoTelefone: null,
      observacaoPedido: null,
      enderecoEntregaResumo: null,
      dataUltimaAtualizacaoPedido: null,
      motivoCancelamento: null,
      itens: [
        {
          vendaItemId: '00000000-0000-0000-0000-000000000004',
          produtoId: '00000000-0000-0000-0000-000000000005',
          produtoNome: 'Produto de teste para impressao',
          quantidade: 1,
          valorUnitario: 29.9,
          desconto: 0,
          total: 29.9
        }
      ],
      pagamentos: [
        {
          vendaPagamentoId: '00000000-0000-0000-0000-000000000006',
          formaPagamento: 'Dinheiro',
          capturaModo: 'ManualAssistido',
          statusTransacao: 'Aprovada',
          provedorOperacao: 'CaixaPresencial',
          referenciaTransacao: null,
          codigoAutorizacao: null,
          bandeiraCartao: null,
          ultimosDigitosCartao: null,
          parcelas: null,
          observacaoOperacao: null,
          dataCaptura: new Date().toISOString(),
          valorPago: 50,
          troco: 20.1
        }
      ]
    }),
    [session]
  );

  async function loadTerminals() {
    setLoadingTerminals(true);

    try {
      const response = await terminalService.list();
      setTerminals(response);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoadingTerminals(false);
    }
  }

  async function handleCreateTerminal() {
    setSavingTerminal(true);

    try {
      const payload: TerminalPdvPayload = {
        ...terminalForm,
        nomeTerminal: terminalForm.nomeTerminal.trim(),
        lojaNome: normalizeOptionalText(terminalForm.lojaNome),
        estadoUf: normalizeUf(terminalForm.estadoUf),
        observacao: normalizeOptionalText(terminalForm.observacao)
      };

      const response = await terminalService.create(payload);
      setLatestActivation({
        codigoTerminal: response.terminal.codigoTerminal,
        nomeTerminal: response.terminal.nomeTerminal,
        chaveAtivacao: response.chaveAtivacao,
        chaveGeradaEm: response.terminal.chaveGeradaEm
      });
      setTerminalForm((current) => ({
        ...INITIAL_TERMINAL_FORM,
        numeroPdv: current.numeroPdv + 1,
        lojaNome: current.lojaNome
      }));
      enqueueSnackbar(`Terminal ${response.terminal.codigoTerminal} pronto para instalacao.`, { variant: 'success' });
      await loadTerminals();
      requestAnimationFrame(() => terminalNameInputRef.current?.focus());
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setSavingTerminal(false);
    }
  }

  async function handleRegenerateKey(terminal: TerminalPdv) {
    setTerminalActionId(terminal.terminalPdvId);

    try {
      const response = await terminalService.regenerateKey(terminal.terminalPdvId);
      setLatestActivation({
        codigoTerminal: response.codigoTerminal,
        nomeTerminal: terminal.nomeTerminal,
        chaveAtivacao: response.chaveAtivacao,
        chaveGeradaEm: response.chaveGeradaEm
      });
      enqueueSnackbar(`Nova chave gerada para ${response.codigoTerminal}.`, { variant: 'success' });
      await loadTerminals();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setTerminalActionId(null);
    }
  }

  async function handleToggleTerminal(terminal: TerminalPdv) {
    setTerminalActionId(terminal.terminalPdvId);

    try {
      const updated = await terminalService.updateStatus(terminal.terminalPdvId, { ativo: !terminal.ativo });
      setTerminals((current) => current.map((item) => (item.terminalPdvId === updated.terminalPdvId ? updated : item)));
      enqueueSnackbar(
        updated.ativo
          ? `Terminal ${updated.codigoTerminal} reativado.`
          : `Terminal ${updated.codigoTerminal} bloqueado para novas ativacoes.`,
        { variant: 'success' }
      );
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setTerminalActionId(null);
    }
  }

  async function handleCopyValue(value: string | null | undefined, successMessage: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      enqueueSnackbar(successMessage, { variant: 'success' });
    } catch {
      enqueueSnackbar('Nao foi possivel copiar agora.', { variant: 'warning' });
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Hardware e automacao</Typography>
        <Typography color="text.secondary">
          Teste scanner e impressora agora. Na nova aba de terminais, o admin prepara instalacao, ativacao e ciclo de vida dos PDVs.
        </Typography>
      </Box>

      <Tabs value={activeTab} onChange={(_, value: HardwareTab) => setActiveTab(value)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="diagnostico" label="Diagnostico local" />
        <Tab value="terminais" label="Terminais e ativacao" />
      </Tabs>

      {activeTab === 'diagnostico' ? (
        <Stack spacing={3}>
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            Scanner comum de mercado geralmente funciona como teclado. Basta manter o campo em foco e ler o codigo.
          </Alert>

          <Grid container spacing={2.5}>
            <Grid item xs={12} lg={7}>
              <Card sx={{ borderRadius: 5 }}>
                <CardContent>
                  <Stack spacing={2.5}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <PrecisionManufacturingRoundedIcon color="primary" />
                      <Typography variant="h6">Scanner de codigo</Typography>
                    </Stack>

                    <TextField
                      label="Campo de teste do leitor"
                      value={scannerValue}
                      onChange={(event) => setScannerValue(event.target.value)}
                      onKeyDown={handleKeyboardScanner}
                      inputRef={scannerInputRef}
                      helperText="Passe um scanner USB/Bluetooth, use a camera deste dispositivo ou abra a sessao no celular."
                      fullWidth
                    />

                    <ScannerActionBar
                      contexto="hardware-teste-scanner"
                      title="Teste de scanner"
                      description="Leia codigo de barras ou QR Code neste navegador. O resultado aparece no campo de teste."
                      defaultMode="Auto"
                      availableModes={['CodigoBarras', 'QrCode', 'Auto']}
                      onDetected={(code) => registerCode(code)}
                      onFocusInput={() => scannerInputRef.current?.focus()}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} lg={5}>
              <Card sx={{ borderRadius: 5, height: '100%' }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6">Ultimas leituras</Typography>
                    {recentCodes.length === 0 ? (
                      <Typography color="text.secondary">
                        Nenhuma leitura ainda. Passe um leitor, use a camera ou pareie com o celular.
                      </Typography>
                    ) : (
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {recentCodes.map((code) => (
                          <Chip key={code} label={code} color="primary" variant="outlined" />
                        ))}
                      </Stack>
                    )}

                    <Box sx={{ pt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Ultima atualizacao
                      </Typography>
                      <Typography>{formatDateTime(new Date().toISOString())}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ borderRadius: 5 }}>
            <CardContent>
              <Stack spacing={2.5}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <PrintRoundedIcon color="secondary" />
                  <Typography variant="h6">Impressora do sistema</Typography>
                </Stack>
                <Typography color="text.secondary">
                  O comprovante simples usa a impressora configurada no navegador e no sistema operacional. Isso atende muito bem impressora comum e varias termicas compartilhadas pela estacao.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<PrintRoundedIcon />}
                  onClick={() => printSaleReceipt(sampleSale, session, { paperWidth: resolveReceiptPaperWidth(terminalForm.perfilImpressora) })}
                  sx={{ width: { xs: '100%', md: 'fit-content' } }}
                >
                  Imprimir comprovante de teste
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      ) : (
        <Stack spacing={3}>
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
              <Typography>
                Este modulo prepara o cadastro do terminal, gera a chave de ativacao e deixa a base pronta para o instalador profissional do PDV.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="primary"
                component="a"
                href={installerDownloadUrl}
                startIcon={<DownloadRoundedIcon />}
              >
                Baixar instalador
              </Button>
            </Stack>
          </Alert>

          {!canManageTerminals ? (
            <Alert severity="warning" sx={{ borderRadius: 4 }}>
              Somente administradores com acesso a usuarios podem cadastrar terminais, gerar chaves e controlar ativacoes.
            </Alert>
          ) : (
            <>
              {latestActivation ? (
                <Alert severity="success" sx={{ borderRadius: 4 }}>
                  <Stack spacing={1.25}>
                    <Typography variant="subtitle1">Terminal pronto para instalacao</Typography>
                    <Typography>
                      {latestActivation.nomeTerminal} · <strong>{latestActivation.codigoTerminal}</strong>
                    </Typography>
                    <Typography>
                      Chave de ativacao: <strong>{latestActivation.chaveAtivacao}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Gerada em {formatDateTime(latestActivation.chaveGeradaEm)}. Guarde a chave agora: por seguranca, o sistema exibe o valor aberto apenas nesta resposta.
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() =>
                          void handleCopyValue(latestActivation.codigoTerminal, 'Codigo do terminal copiado para o instalador.')
                        }
                      >
                        Copiar codigo
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() =>
                          void handleCopyValue(latestActivation.chaveAtivacao, 'Chave de ativacao copiada para o instalador.')
                        }
                      >
                        Copiar chave
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() =>
                          void handleCopyValue(
                            getInstallerActivationUrl(latestActivation.codigoTerminal),
                            'Link da tela de ativacao copiado para o instalador.'
                          )
                        }
                      >
                        Copiar link da ativacao
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() =>
                          void handleCopyValue(
                            getPdvInstallerDownloadUrlAbsolute(),
                            'Link direto do instalador copiado.'
                          )
                        }
                      >
                        Copiar link do instalador
                      </Button>
                    </Stack>
                  </Stack>
                </Alert>
              ) : null}

              <Grid container spacing={2.5}>
                <Grid item xs={12} xl={5}>
                  <Card sx={{ borderRadius: 5 }}>
                    <CardContent>
                      <Stack spacing={2.5}>
                        <Box>
                          <Typography variant="h6">Novo terminal de loja</Typography>
                          <Typography color="text.secondary">
                            Gere o codigo do terminal e a chave de ativacao que o instalador usara no primeiro boot.
                          </Typography>
                        </Box>

                        <TextField
                          label="Nome do terminal"
                          value={terminalForm.nomeTerminal}
                          onChange={(event) => setTerminalForm((current) => ({ ...current, nomeTerminal: event.target.value }))}
                          inputRef={terminalNameInputRef}
                          placeholder="Ex.: Frente caixa 01"
                          fullWidth
                        />

                        <Grid container spacing={2}>
                          <Grid item xs={12} md={7}>
                            <TextField
                              label="Loja / unidade"
                              value={terminalForm.lojaNome ?? ''}
                              onChange={(event) => setTerminalForm((current) => ({ ...current, lojaNome: event.target.value }))}
                              placeholder="Ex.: Loja Centro"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={12} md={5}>
                            <TextField
                              select
                              label="UF"
                              value={terminalForm.estadoUf ?? ''}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  estadoUf: event.target.value
                                }))
                              }
                              fullWidth
                            >
                              <MenuItem value="">Selecione</MenuItem>
                              {ufOptions.map((uf) => (
                                <MenuItem key={uf} value={uf}>
                                  {uf}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>
                        </Grid>

                        <Grid container spacing={2}>
                          <Grid item xs={12} md={5}>
                            <TextField
                              label="Numero do PDV"
                              type="number"
                              value={terminalForm.numeroPdv}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  numeroPdv: Math.max(1, Number(event.target.value) || 1)
                                }))
                              }
                              inputProps={{ min: 1 }}
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={12} md={7}>
                            <TextField
                              select
                              label="Perfil de instalacao"
                              value={terminalForm.perfilInstalacao}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  perfilInstalacao: event.target.value as TerminalPerfilInstalacao
                                }))
                              }
                              fullWidth
                            >
                              {TERMINAL_INSTALLATION_OPTIONS.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>
                        </Grid>

                        <Typography variant="body2" color="text.secondary">
                          {
                            TERMINAL_INSTALLATION_OPTIONS.find((item) => item.value === terminalForm.perfilInstalacao)?.description
                          }
                        </Typography>

                        <Divider />

                        <Box>
                          <Typography variant="subtitle1">Perifericos do terminal</Typography>
                          <Typography color="text.secondary">
                            Defina como este PDV trabalha com impressora termica, scanner e teclado padrao da operacao.
                          </Typography>
                        </Box>

                        <Grid container spacing={2}>
                          <Grid item xs={12} md={4}>
                            <TextField
                              select
                              label="Impressora"
                              value={terminalForm.perfilImpressora}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  perfilImpressora: event.target.value as TerminalPerfilImpressora
                                }))
                              }
                              fullWidth
                            >
                              {terminalPrinterOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <TextField
                              select
                              label="Scanner"
                              value={terminalForm.perfilScanner}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  perfilScanner: event.target.value as TerminalPerfilScanner
                                }))
                              }
                              fullWidth
                            >
                              {terminalScannerOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <TextField
                              select
                              label="Teclado"
                              value={terminalForm.perfilTeclado}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  perfilTeclado: event.target.value as TerminalPerfilTeclado
                                }))
                              }
                              fullWidth
                            >
                              {terminalKeyboardOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Grid>
                        </Grid>

                        <Typography variant="body2" color="text.secondary">
                          {terminalPrinterOptions.find((item) => item.value === terminalForm.perfilImpressora)?.description}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {terminalScannerOptions.find((item) => item.value === terminalForm.perfilScanner)?.description}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {terminalKeyboardOptions.find((item) => item.value === terminalForm.perfilTeclado)?.description}
                        </Typography>

                        <FormControlLabel
                          control={(
                            <Switch
                              checked={terminalForm.impressaoAutomatica}
                              onChange={(event) =>
                                setTerminalForm((current) => ({
                                  ...current,
                                  impressaoAutomatica: event.target.checked
                                }))
                              }
                            />
                          )}
                          label="Imprimir comprovante automaticamente ao finalizar a venda"
                        />

                        <TextField
                          label="Observacao operacional"
                          value={terminalForm.observacao ?? ''}
                          onChange={(event) => setTerminalForm((current) => ({ ...current, observacao: event.target.value }))}
                          placeholder="Ex.: Terminal perto do estoque, impressora Zebra 1."
                          multiline
                          minRows={3}
                          fullWidth
                        />

                        <Button
                          variant="contained"
                          disabled={savingTerminal}
                          onClick={() => void handleCreateTerminal()}
                          sx={{ width: { xs: '100%', md: 'fit-content' } }}
                        >
                          {savingTerminal ? 'Gerando terminal...' : 'Gerar terminal e chave'}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} xl={7}>
                  <Stack spacing={2.5}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={3}>
                        <Card sx={{ borderRadius: 4 }}>
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Total
                            </Typography>
                            <Typography variant="h5">{terminalStats.total}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Card sx={{ borderRadius: 4 }}>
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Ativos
                            </Typography>
                            <Typography variant="h5">{terminalStats.ativos}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Card sx={{ borderRadius: 4 }}>
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Ativados
                            </Typography>
                            <Typography variant="h5">{terminalStats.ativados}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <Card sx={{ borderRadius: 4 }}>
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Pendentes
                            </Typography>
                            <Typography variant="h5">{terminalStats.pendentes}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>

                    <Card sx={{ borderRadius: 5 }}>
                      <CardContent>
                        <Stack spacing={2.5}>
                          <Box>
                            <Typography variant="h6">Parque de terminais</Typography>
                            <Typography color="text.secondary">
                              Cada terminal fica pronto para o instalador online/local, com codigo proprio, chave e rastreio do ultimo dispositivo ativado.
                            </Typography>
                          </Box>

                          {loadingTerminals ? (
                            <Typography color="text.secondary">Carregando terminais...</Typography>
                          ) : terminals.length === 0 ? (
                            <Alert severity="info" sx={{ borderRadius: 4 }}>
                              Nenhum terminal cadastrado ainda. Gere o primeiro terminal ao lado para iniciar o parque da loja.
                            </Alert>
                          ) : (
                            <Stack spacing={2}>
                              {terminals.map((terminal) => {
                                const statusChip = terminal.ativo
                                  ? terminal.ativado
                                    ? { label: 'Ativado', color: 'success' as const }
                                    : { label: 'Pendente ativacao', color: 'warning' as const }
                                  : { label: 'Bloqueado', color: 'default' as const };

                                const busy = terminalActionId === terminal.terminalPdvId;

                                return (
                                  <Card key={terminal.terminalPdvId} variant="outlined" sx={{ borderRadius: 4 }}>
                                    <CardContent>
                                      <Stack spacing={1.75}>
                                        <Stack
                                          direction={{ xs: 'column', md: 'row' }}
                                          spacing={1.25}
                                          alignItems={{ xs: 'flex-start', md: 'center' }}
                                          justifyContent="space-between"
                                        >
                                            <Stack spacing={0.5}>
                                              <Typography variant="h6">{terminal.nomeTerminal}</Typography>
                                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                <Chip label={terminal.codigoTerminal} color="primary" variant="outlined" />
                                                <Chip label={statusChip.label} color={statusChip.color} />
                                                <Chip label={`Perfil ${getInstallationProfileLabel(terminal.perfilInstalacao)}`} variant="outlined" />
                                                <Chip label={getTerminalPrinterLabel(terminal.perfilImpressora)} variant="outlined" />
                                                <Chip label={getTerminalScannerLabel(terminal.perfilScanner)} variant="outlined" />
                                                <Chip label={getTerminalKeyboardLabel(terminal.perfilTeclado)} variant="outlined" />
                                              </Stack>
                                            </Stack>

                                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                            <Button
                                              size="small"
                                              variant="outlined"
                                              startIcon={<ContentCopyRoundedIcon />}
                                              onClick={() =>
                                                void handleCopyValue(terminal.codigoTerminal, `Codigo ${terminal.codigoTerminal} copiado.`)
                                              }
                                            >
                                              Copiar codigo
                                            </Button>
                                            <Button
                                              size="small"
                                              variant="outlined"
                                              onClick={() => void handleRegenerateKey(terminal)}
                                              disabled={busy}
                                            >
                                              {busy ? 'Gerando chave...' : 'Nova chave'}
                                            </Button>
                                            <Button
                                              size="small"
                                              variant={terminal.ativo ? 'outlined' : 'contained'}
                                              color={terminal.ativo ? 'inherit' : 'primary'}
                                              onClick={() => void handleToggleTerminal(terminal)}
                                              disabled={busy}
                                            >
                                              {terminal.ativo ? 'Bloquear terminal' : 'Reativar terminal'}
                                            </Button>
                                          </Stack>
                                        </Stack>

                                        <Grid container spacing={1.5}>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Loja / unidade
                                            </Typography>
                                            <Typography>{terminal.lojaNome || '-'}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={2}>
                                            <Typography variant="body2" color="text.secondary">
                                              PDV
                                            </Typography>
                                            <Typography>{terminal.numeroPdv}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={2}>
                                            <Typography variant="body2" color="text.secondary">
                                              UF
                                            </Typography>
                                            <Typography>{terminal.estadoUf || '-'}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Chave de ativação
                                            </Typography>
                                            <Typography>{terminal.chaveAtivacaoMascara}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Impressora
                                            </Typography>
                                            <Typography>{getTerminalPrinterLabel(terminal.perfilImpressora)}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Scanner
                                            </Typography>
                                            <Typography>{getTerminalScannerLabel(terminal.perfilScanner)}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Teclado
                                            </Typography>
                                            <Typography>{getTerminalKeyboardLabel(terminal.perfilTeclado)}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Autoimpressao
                                            </Typography>
                                            <Typography>{terminal.impressaoAutomatica ? 'Ligada' : 'Desligada'}</Typography>
                                          </Grid>
                                        </Grid>

                                        <Divider />

                                        <Grid container spacing={1.5}>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Cadastro
                                            </Typography>
                                            <Typography>{formatDateTime(terminal.dataCadastro)}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Ultima chave
                                            </Typography>
                                            <Typography>{formatDateTime(terminal.chaveGeradaEm)}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Ultima sincronizacao
                                            </Typography>
                                            <Typography>{formatDateTime(terminal.ultimaSincronizacaoEm)}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Host
                                            </Typography>
                                            <Typography>{terminal.nomeHost || '-'}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Dispositivo
                                            </Typography>
                                            <Typography>{terminal.dispositivoIdentificador || '-'}</Typography>
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <Typography variant="body2" color="text.secondary">
                                              Versoes
                                            </Typography>
                                            <Typography>
                                              {(terminal.versaoInstalador || '-') + ' / ' + (terminal.versaoAplicativo || '-')}
                                            </Typography>
                                          </Grid>
                                        </Grid>

                                        {terminal.observacao ? (
                                          <Alert severity="info" sx={{ borderRadius: 3 }}>
                                            {terminal.observacao}
                                          </Alert>
                                        ) : null}
                                      </Stack>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Stack>
                </Grid>
              </Grid>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function normalizeOptionalText(value: string | null) {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeUf(value: string | null) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toUpperCase().slice(0, 2) : null;
}

function getInstallationProfileLabel(profile: string) {
  return TERMINAL_INSTALLATION_OPTIONS.find((item) => item.value === profile)?.label ?? profile;
}

function getInstallerActivationUrl(codigoTerminal: string) {
  const url = new URL('/ativacao-terminal', window.location.origin);
  url.searchParams.set('codigo', codigoTerminal);
  return url.toString();
}
