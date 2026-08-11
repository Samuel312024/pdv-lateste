import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableContainer,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetachableDialog } from '../components/common/DetachableDialog';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { nfeService } from '../services/nfeService';
import type { NotaFiscal, NotaFiscalResumo, NotaFiscalStatus, NotaFiscalVendaDisponivel } from '../types';
import { readDetachedDialogSession, removeDetachedDialogSession } from '../utils/detachedDialogSession';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';

interface NfeDetachedSession {
  selectedNoteId: string | null;
  selectedNote: NotaFiscal | null;
}

const NFE_DETAIL_PATH = '/notas-fiscais';
type NoteListFilterStatus = 'Todas' | 'ComPendencias' | NotaFiscalStatus;
const noteStatusFilterOptions: Array<{ value: NoteListFilterStatus; label: string }> = [
  { value: 'Todas', label: 'Todos os status' },
  { value: 'ComPendencias', label: 'Com pendencias' },
  { value: 'Rascunho', label: 'Rascunho' },
  { value: 'PendenteTransmissao', label: 'Pronta para transmitir' },
  { value: 'Autorizada', label: 'Autorizada' },
  { value: 'Rejeitada', label: 'Rejeitada' },
  { value: 'Cancelada', label: 'Cancelada' }
];

export function NfePage() {
  const [loading, setLoading] = useState(true);
  const [refreshingSales, setRefreshingSales] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [transmittingNoteId, setTransmittingNoteId] = useState<string | null>(null);
  const [saleSearchTerm, setSaleSearchTerm] = useState('');
  const [notesSearchTerm, setNotesSearchTerm] = useState('');
  const [notesStatusFilter, setNotesStatusFilter] = useState<NoteListFilterStatus>('Todas');
  const [observacoes, setObservacoes] = useState('');
  const [notes, setNotes] = useState<NotaFiscalResumo[]>([]);
  const [eligibleSales, setEligibleSales] = useState<NotaFiscalVendaDisponivel[]>([]);
  const [selectedSale, setSelectedSale] = useState<NotaFiscalVendaDisponivel | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NotaFiscal | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuth();
  const theme = useTheme();
  const compactNotesLayout = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams] = useSearchParams();
  const detachedWindow = searchParams.get('detachedWindow') === '1';
  const detachedSessionKey = searchParams.get('detachedSession');
  const hydratedDetachedSessionRef = useRef<string | null>(null);

  const canView = hasPermission('VisualizarNotasFiscais');
  const canIssue = hasPermission('EmitirNotasFiscais');

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    void loadPage();
  }, [canView]);

  useEffect(() => {
    if (loading || !canView || !detachedWindow || !detachedSessionKey || hydratedDetachedSessionRef.current === detachedSessionKey) {
      return;
    }

    const sessionData = readDetachedDialogSession<NfeDetachedSession>(detachedSessionKey);
    hydratedDetachedSessionRef.current = detachedSessionKey;

    if (!sessionData) {
      return;
    }

    setSelectedNoteId(sessionData.selectedNoteId);
    setSelectedNote(sessionData.selectedNote);

    if (sessionData.selectedNote) {
      setDetailLoading(false);
      setDetailOpen(true);
      return;
    }

    if (sessionData.selectedNoteId) {
      void openDetail(sessionData.selectedNoteId);
    }
  }, [canView, detachedSessionKey, detachedWindow, loading]);

  async function loadPage() {
    setLoading(true);
    try {
      const [notesResult, salesResult] = await Promise.all([
        nfeService.list(),
        nfeService.listEligibleSales()
      ]);

      setNotes(notesResult);
      setEligibleSales(salesResult);
      if (selectedSale && !salesResult.some((item) => item.vendaId === selectedSale.vendaId)) {
        setSelectedSale(null);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function searchEligibleSales() {
    setRefreshingSales(true);
    try {
      const result = await nfeService.listEligibleSales(saleSearchTerm);
      setEligibleSales(result);
      if (selectedSale && !result.some((item) => item.vendaId === selectedSale.vendaId)) {
        setSelectedSale(null);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRefreshingSales(false);
    }
  }

  async function refreshNotesList() {
    const notesResult = await nfeService.list();
    setNotes(notesResult);
  }

  async function handleIssueFromSale() {
    if (!selectedSale) {
      enqueueSnackbar('Selecione uma venda finalizada para gerar a NF-e.', { variant: 'warning' });
      return;
    }

    setIssuing(true);
    try {
      const note = await nfeService.issueFromSale(selectedSale.vendaId, {
        observacoes: observacoes.trim() || null
      });

      enqueueSnackbar(
        note.prontaParaTransmissao
          ? `NF-e ${note.serie}/${note.numero} gerada e pronta para transmissao na SEFAZ em ${describeAmbiente(note.ambiente)}.`
          : `NF-e ${note.serie}/${note.numero} gerada em rascunho com ${note.pendencias.length} pendencia(s).`,
        { variant: note.prontaParaTransmissao ? 'success' : 'warning' }
      );

      setSelectedSale(null);
      setObservacoes('');
      await loadPage();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setIssuing(false);
    }
  }

  async function handleTransmit(noteId: string) {
    if (!canIssue) {
      enqueueSnackbar('Seu perfil nao possui permissao para transmitir NF-e.', { variant: 'warning' });
      return;
    }

    setTransmittingNoteId(noteId);
    try {
      const response = await nfeService.transmit(noteId);
      enqueueSnackbar(response.mensagem, { variant: response.autorizada ? 'success' : 'warning' });
      await refreshNotesList();

      if (selectedNoteId === noteId || selectedNote?.notaFiscalId === noteId) {
        setSelectedNoteId(response.notaFiscal.notaFiscalId);
        setSelectedNote(response.notaFiscal);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setTransmittingNoteId(null);
    }
  }

  async function openDetail(noteId: string) {
    setSelectedNoteId(noteId);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const note = await nfeService.getById(noteId);
      setSelectedNote(note);
    } catch (error) {
      closeDetailDialog();
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetailDialog() {
    setDetailOpen(false);
    setDetailLoading(false);
    setSelectedNote(null);
    setSelectedNoteId(null);

    if (!detachedWindow) {
      return;
    }

    removeDetachedDialogSession(detachedSessionKey);
    window.close();
  }

  if (loading) {
    return <Loading message="Carregando modulo de NF-e..." />;
  }

  if (!canView) {
    return (
      <Alert severity="error" sx={{ borderRadius: 4 }}>
        Seu perfil nao possui acesso ao modulo de NF-e.
      </Alert>
    );
  }

  const notesReady = notes.filter((item) => item.status === 'PendenteTransmissao' && item.prontaParaTransmissao).length;
  const notesAuthorized = notes.filter((item) => item.status === 'Autorizada').length;
  const notesRejected = notes.filter((item) => item.status === 'Rejeitada').length;
  const notesDraft = notes.filter((item) => item.status === 'Rascunho').length;
  const notesCancelled = notes.filter((item) => item.status === 'Cancelada').length;
  const normalizedNotesSearchTerm = normalizeSearchValue(notesSearchTerm);
  const filteredNotes = notes.filter((note) => {
    const matchesStatus = notesStatusFilter === 'Todas'
      ? true
      : notesStatusFilter === 'ComPendencias'
        ? note.quantidadePendencias > 0
        : note.status === notesStatusFilter;

    if (!matchesStatus) {
      return false;
    }

    if (!normalizedNotesSearchTerm) {
      return true;
    }

    return normalizeSearchValue([
      note.serie,
      note.numero,
      note.numeroVenda,
      note.destinatarioNome,
      note.destinatarioDocumento,
      note.chaveAcesso,
      formatNotaOrigem(note.origem),
      buildStatusLabel(note)
    ].filter(Boolean).join(' ')).includes(normalizedNotesSearchTerm);
  });

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ width: '100%', minWidth: 0 }}>
      <Box>
        <Typography variant="h4">Emissao de NF-e</Typography>
        <Typography color="text.secondary">
          Gere notas fiscais a partir de vendas finalizadas, acompanhe pendencias e prepare a base para a transmissao.
        </Typography>
      </Box>

      <Alert severity="info" icon={<ReceiptLongRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4 }}>
        Este modulo ja transmite NF-e conforme o ambiente configurado na empresa, desde que certificado digital, cliente completo e tributacao suportada estejam prontos. Cancelamento SEFAZ e contingencia ainda nao entram nesta etapa.
      </Alert>

      <Grid container spacing={{ xs: 2, lg: 2.5 }} alignItems="stretch">
        <Grid item xs={12} lg={4} xl={3}>
          <Stack spacing={2} sx={{ position: { xl: 'sticky' }, top: { xl: 96 }, alignSelf: 'flex-start' }}>
            <Card sx={{ borderRadius: 5 }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.25 } }}>
                <Stack spacing={2}>
                  <Typography variant="h6">Emitir a partir de venda</Typography>
                  <Typography color="text.secondary">
                    Escolha uma venda finalizada sem NF-e para gerar a nota agora.
                  </Typography>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                    <ListFilterField
                      label="Buscar venda"
                      value={saleSearchTerm}
                      onChange={(event) => setSaleSearchTerm(event.target.value)}
                      placeholder="Numero da venda ou cliente"
                      fullWidth
                    />
                    <Button
                      variant="outlined"
                      startIcon={<RefreshRoundedIcon />}
                      onClick={() => void searchEligibleSales()}
                      disabled={refreshingSales}
                    >
                      Buscar
                    </Button>
                  </Stack>

                  <Autocomplete
                    fullWidth
                    options={eligibleSales}
                    value={selectedSale}
                    onChange={(_, value) => setSelectedSale(value)}
                    isOptionEqualToValue={(option, value) => option.vendaId === value.vendaId}
                    getOptionLabel={(option) => `${option.numeroVenda} · ${option.destinatarioNome}`}
                    noOptionsText="Nenhuma venda elegivel encontrada"
                    renderOption={(props, option) => (
                      <Box component="li" {...props} sx={{ py: 1.25 }}>
                        <Box>
                          <Typography sx={{ fontWeight: 700 }}>{option.numeroVenda}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {option.destinatarioNome} · {formatCurrency(option.total)} · {formatDateTime(option.dataVenda)}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Venda elegivel"
                        helperText="A lista mostra vendas finalizadas sem NF-e vinculada."
                      />
                    )}
                  />

                  <TextField
                    label="Observacoes da NF-e"
                    value={observacoes}
                    onChange={(event) => setObservacoes(event.target.value)}
                    helperText="Opcional: observacoes internas para o time fiscal."
                    fullWidth
                    multiline
                    minRows={3}
                  />

                  {!canIssue && (
                    <Alert severity="warning" sx={{ borderRadius: 3 }}>
                      Seu perfil pode consultar NF-e, mas nao pode emitir novas notas.
                    </Alert>
                  )}

                  <Button
                    variant="contained"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => void handleIssueFromSale()}
                    disabled={!canIssue || !selectedSale || issuing}
                    fullWidth
                  >
                    Gerar NF-e da venda
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 5 }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.25 } }}>
                <Stack spacing={2}>
                  <Typography variant="h6">Resumo operacional</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    <Chip color="info" icon={<ReceiptLongRoundedIcon />} label={`${notesReady} prontas para transmitir`} />
                    <Chip color="success" icon={<VerifiedRoundedIcon />} label={`${notesAuthorized} autorizadas`} />
                    <Chip color="error" icon={<WarningAmberRoundedIcon />} label={`${notesRejected} rejeitadas`} />
                    <Chip color="warning" icon={<WarningAmberRoundedIcon />} label={`${notesDraft} em rascunho`} />
                    <Chip variant="outlined" label={`${notesCancelled} canceladas`} />
                  </Stack>
                  <Typography color="text.secondary">
                    {eligibleSales.length} venda(s) aguardando geracao de NF-e na lista atual.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={8} xl={9}>
          <Card sx={{ borderRadius: 5 }}>
            <CardContent sx={{ p: { xs: 1.5, sm: 2, xl: 2.25 } }}>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={1.5}
                  alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                >
                  <Box>
                    <Typography variant="h6">Notas recentes</Typography>
                    <Typography color="text.secondary">
                      Ultimas NF-e geradas pelo PDV ou manualmente neste modulo.
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshRoundedIcon />}
                    onClick={() => void loadPage()}
                    disabled={loading}
                  >
                    Atualizar
                  </Button>
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <ListFilterField
                    label="Filtrar notas"
                    value={notesSearchTerm}
                    onChange={(event) => setNotesSearchTerm(event.target.value)}
                    placeholder="NF-e, venda, destinatario ou documento"
                    fullWidth
                  />
                  <TextField
                    select
                    label="Status"
                    value={notesStatusFilter}
                    onChange={(event) => setNotesStatusFilter(event.target.value as NoteListFilterStatus)}
                    sx={{ minWidth: { xs: '100%', md: 240 } }}
                  >
                    {noteStatusFilterOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                {notes.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Nenhuma NF-e gerada ainda. Use a coluna ao lado ou marque a emissao direta no fechamento da venda.
                  </Alert>
                ) : filteredNotes.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Nenhuma NF-e combina com os filtros atuais.
                  </Alert>
                ) : compactNotesLayout ? (
                  <Stack spacing={1.5}>
                    {filteredNotes.map((note) => (
                      <Box
                        key={note.notaFiscalId}
                        sx={{
                          border: '1px solid rgba(15, 23, 42, 0.08)',
                          p: 1.75
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 800 }}>
                                NF-e {note.serie}/{note.numero}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {formatNotaOrigem(note.origem)}{note.numeroVenda ? ` · ${note.numeroVenda}` : ''}
                              </Typography>
                            </Box>
                            <Chip size="small" color={resolveStatusColor(note)} label={buildStatusLabel(note)} />
                          </Stack>

                          <Box>
                            <Typography sx={{ fontWeight: 700 }}>{note.destinatarioNome}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {note.destinatarioDocumento ?? 'Sem documento'}
                            </Typography>
                          </Box>

                          <Stack direction="row" flexWrap="wrap" gap={1.5}>
                            <Typography variant="body2">
                              <strong>Total:</strong> {formatCurrency(note.valorTotal)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              <strong>Emissao:</strong> {formatDateTime(note.dataEmissao)}
                            </Typography>
                          </Stack>

                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            {canIssue && canTransmitNote(note) ? (
                              <Button
                                size="small"
                                startIcon={<SendRoundedIcon />}
                                onClick={() => void handleTransmit(note.notaFiscalId)}
                                disabled={transmittingNoteId === note.notaFiscalId}
                                fullWidth
                              >
                                {transmittingNoteId === note.notaFiscalId ? 'Transmitindo...' : 'Transmitir'}
                              </Button>
                            ) : null}
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<VisibilityRoundedIcon />}
                              onClick={() => void openDetail(note.notaFiscalId)}
                              fullWidth
                            >
                              Detalhes
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <TableContainer
                    sx={{
                      width: '100%',
                      maxHeight: { md: 520, xl: 620 },
                      overflowX: 'auto',
                      overflowY: 'auto',
                      scrollbarGutter: 'stable both-edges',
                      borderRadius: 4,
                      border: '1px solid rgba(15, 23, 42, 0.08)'
                    }}
                  >
                    <Table
                      stickyHeader
                      size="small"
                      sx={{
                        minWidth: 1020,
                        '& .MuiTableCell-root': {
                          px: 1.5,
                          py: 1.35,
                          verticalAlign: 'top',
                          borderColor: 'rgba(15, 23, 42, 0.08)'
                        }
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>NF-e</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>Origem</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>Venda</TableCell>
                          <TableCell>Destinatario</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>Total</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>Emissao</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Acoes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredNotes.map((note) => (
                          <TableRow key={note.notaFiscalId} hover>
                            <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', minWidth: 86 }}>
                              {note.serie}/{note.numero}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 78 }}>
                              {formatNotaOrigem(note.origem)}
                            </TableCell>
                            <TableCell sx={{ minWidth: 150, wordBreak: 'break-word' }}>
                              {note.numeroVenda ?? '-'}
                            </TableCell>
                            <TableCell sx={{ minWidth: 280 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {note.destinatarioNome}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {note.destinatarioDocumento ?? 'Sem documento'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 92 }}>
                              {formatCurrency(note.valorTotal)}
                            </TableCell>
                            <TableCell sx={{ minWidth: 190 }}>
                              <Chip
                                size="small"
                                color={resolveStatusColor(note)}
                                label={buildStatusLabel(note)}
                              />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 112 }}>
                              {formatDateTime(note.dataEmissao)}
                            </TableCell>
                            <TableCell align="right" sx={{ minWidth: 210 }}>
                              <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                                {canIssue && canTransmitNote(note) ? (
                                  <Button
                                    size="small"
                                    startIcon={<SendRoundedIcon />}
                                    onClick={() => void handleTransmit(note.notaFiscalId)}
                                    disabled={transmittingNoteId === note.notaFiscalId}
                                  >
                                    {transmittingNoteId === note.notaFiscalId ? 'Transmitindo...' : 'Transmitir'}
                                  </Button>
                                ) : null}
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<VisibilityRoundedIcon />}
                                  onClick={() => void openDetail(note.notaFiscalId)}
                                >
                                  Detalhes
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <DetachableDialog
        open={detailOpen}
        onClose={closeDetailDialog}
        title="Detalhes da NF-e"
        maxWidth="lg"
        contentSx={{ pt: 2 }}
        detachedWindow={detachedWindow}
        detachPath={NFE_DETAIL_PATH}
        detachPayload={{
          selectedNoteId,
          selectedNote
        } satisfies NfeDetachedSession}
        onDetach={closeDetailDialog}
        actionsSx={{ px: 3, pb: 3 }}
        windowTitle={selectedNote ? `NF-e ${selectedNote.serie}/${selectedNote.numero}` : 'Detalhes da NF-e'}
        actions={
          <>
            {selectedNote && canIssue && canTransmitNote(selectedNote) ? (
              <Button
                variant="contained"
                startIcon={<SendRoundedIcon />}
                onClick={() => void handleTransmit(selectedNote.notaFiscalId)}
                disabled={transmittingNoteId === selectedNote.notaFiscalId}
              >
                {transmittingNoteId === selectedNote.notaFiscalId ? 'Transmitindo...' : 'Transmitir agora'}
              </Button>
            ) : null}
            <Button onClick={closeDetailDialog}>Fechar</Button>
          </>
        }
      >
          {detailLoading || !selectedNote ? (
            <Loading message="Carregando detalhes da NF-e..." />
          ) : (
            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <Chip
                  color={resolveStatusColor(selectedNote)}
                  label={buildStatusLabel(selectedNote)}
                />
                <Chip variant="outlined" label={`NF-e ${selectedNote.serie}/${selectedNote.numero}`} />
                <Chip variant="outlined" label={`Origem ${formatNotaOrigem(selectedNote.origem)}`} />
                <Chip variant="outlined" label={`Venda ${selectedNote.numeroVenda ?? 'sem vinculo'}`} />
              </Stack>

              {selectedNote.status === 'Autorizada' ? (
                <Alert severity="success" sx={{ borderRadius: 3 }}>
                  NF-e autorizada pela SEFAZ em {describeAmbiente(selectedNote.ambiente)}.
                  {selectedNote.protocoloAutorizacao ? ` Protocolo ${selectedNote.protocoloAutorizacao}.` : ''}
                </Alert>
              ) : selectedNote.status === 'Rejeitada' ? (
                <Alert severity="error" sx={{ borderRadius: 3 }}>
                  {selectedNote.mensagemStatusSefaz ?? 'A NF-e foi devolvida pela SEFAZ sem autorizacao.'}
                </Alert>
              ) : selectedNote.prontaParaTransmissao ? (
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Esta NF-e esta pronta para transmissao no ambiente de {describeAmbiente(selectedNote.ambiente)}.
                </Alert>
              ) : null}

              {selectedNote.pendencias.length > 0 ? (
                <Stack spacing={1}>
                  {selectedNote.pendencias.map((warning) => (
                    <Alert key={warning} severity="warning" sx={{ borderRadius: 3 }}>
                      {warning}
                    </Alert>
                  ))}
                </Stack>
              ) : (
                <Alert severity="success" sx={{ borderRadius: 3 }}>
                  Nenhuma pendencia fiscal encontrada nesta NF-e.
                </Alert>
              )}

              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6">Retorno da SEFAZ</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <MetaField label="Chave de acesso" value={selectedNote.chaveAcesso ?? 'Ainda nao gerada'} />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <MetaField
                          label="Codigo SEFAZ"
                          value={selectedNote.codigoStatusSefaz?.toString() ?? 'Sem retorno'}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <MetaField
                          label="Protocolo"
                          value={selectedNote.protocoloAutorizacao ?? 'Sem protocolo'}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <MetaField
                          label="Data de transmissao"
                          value={selectedNote.dataTransmissao ? formatDateTime(selectedNote.dataTransmissao) : 'Ainda nao transmitida'}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <MetaField
                          label="Data de autorizacao"
                          value={selectedNote.dataAutorizacao ? formatDateTime(selectedNote.dataAutorizacao) : 'Sem autorizacao'}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <MetaField
                          label="Mensagem da SEFAZ"
                          value={selectedNote.mensagemStatusSefaz ?? 'Nenhuma mensagem retornada ate o momento.'}
                        />
                      </Grid>
                    </Grid>
                  </Stack>
                </CardContent>
              </Card>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent>
                      <Stack spacing={1}>
                        <Typography variant="h6">Emitente</Typography>
                        <Typography sx={{ fontWeight: 700 }}>{selectedNote.emitente.razaoSocial}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {[
                            selectedNote.emitente.cnpj,
                            selectedNote.emitente.inscricaoEstadualIsento
                              ? 'IE isenta'
                              : selectedNote.emitente.inscricaoEstadual,
                            selectedNote.emitente.regimeTributario
                          ].filter(Boolean).join(' · ')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {buildEnderecoCompacto(selectedNote.emitente)}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent>
                      <Stack spacing={1}>
                        <Typography variant="h6">Destinatario</Typography>
                        <Typography sx={{ fontWeight: 700 }}>{selectedNote.destinatario.nome}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {[
                            selectedNote.destinatario.documento,
                            selectedNote.destinatario.telefone,
                            selectedNote.destinatario.email
                          ].filter(Boolean).join(' · ') || 'Sem documento, telefone ou e-mail.'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {buildEnderecoCompacto(selectedNote.destinatario)}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Card variant="outlined" sx={{ borderRadius: 4 }}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Itens da NF-e</Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Produto</TableCell>
                          <TableCell>Classificacao</TableCell>
                          <TableCell>Tributacao</TableCell>
                          <TableCell>Quantidade</TableCell>
                          <TableCell>Unitario</TableCell>
                          <TableCell>Desconto</TableCell>
                          <TableCell>Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedNote.itens.map((item) => (
                          <TableRow key={item.notaFiscalItemId} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {item.produtoNome}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Unidade {item.unidadeMedida}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">NCM {item.ncm ?? '-'}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                CFOP {item.cfop ?? '-'} · Origem {item.origemFiscal ?? '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {['CSOSN ' + item.csosn, 'CST ICMS ' + item.cstIcms].filter((value) => !value.endsWith('null')).join(' · ') || 'Sem ICMS'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {['PIS ' + item.cstPis, 'COFINS ' + item.cstCofins].filter((value) => !value.endsWith('null')).join(' · ')}
                              </Typography>
                            </TableCell>
                            <TableCell>{item.quantidade.toFixed(3)}</TableCell>
                            <TableCell>{formatCurrency(item.valorUnitario)}</TableCell>
                            <TableCell>{formatCurrency(item.desconto)}</TableCell>
                            <TableCell>{formatCurrency(item.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Divider />

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <SummaryBox label="Produtos" value={formatCurrency(selectedNote.valorProdutos)} />
                      <SummaryBox label="Descontos" value={formatCurrency(selectedNote.valorDesconto)} />
                      <SummaryBox label="Total NF-e" value={formatCurrency(selectedNote.valorTotal)} />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {selectedNote.observacoes && (
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Observacoes internas: {selectedNote.observacoes}
                </Alert>
              )}

              {selectedNote.xmlEnvio || selectedNote.xmlRetorno ? (
                <Card variant="outlined" sx={{ borderRadius: 4 }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Typography variant="h6">XML tecnico</Typography>
                      {selectedNote.xmlEnvio ? (
                        <TextField
                          label="XML enviado"
                          value={selectedNote.xmlEnvio}
                          fullWidth
                          multiline
                          minRows={8}
                          InputProps={{ readOnly: true }}
                        />
                      ) : null}
                      {selectedNote.xmlRetorno ? (
                        <TextField
                          label="XML de retorno"
                          value={selectedNote.xmlRetorno}
                          fullWidth
                          multiline
                          minRows={8}
                          InputProps={{ readOnly: true }}
                        />
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              ) : null}
            </Stack>
          )}
      </DetachableDialog>
    </Stack>
  );
}

function resolveStatusColor(note: Pick<NotaFiscalResumo, 'status' | 'prontaParaTransmissao'> | Pick<NotaFiscal, 'status' | 'prontaParaTransmissao'>) {
  if (note.status === 'Autorizada') {
    return 'success' as const;
  }

  if (note.status === 'Rejeitada') {
    return 'error' as const;
  }

  if (note.status === 'Cancelada') {
    return 'default' as const;
  }

  if (note.status === 'PendenteTransmissao' || note.prontaParaTransmissao) {
    return 'info' as const;
  }

  return 'warning' as const;
}

function buildStatusLabel(note: Pick<NotaFiscalResumo, 'status' | 'prontaParaTransmissao' | 'quantidadePendencias'> | Pick<NotaFiscal, 'status' | 'prontaParaTransmissao' | 'pendencias'>) {
  if (note.status === 'Autorizada') {
    return 'Autorizada';
  }

  if (note.status === 'Rejeitada') {
    return 'Rejeitada';
  }

  if (note.status === 'Cancelada') {
    return 'Cancelada';
  }

  if (note.status === 'PendenteTransmissao' || note.prontaParaTransmissao) {
    return 'Pronta para transmitir';
  }

  const pendingCount = 'quantidadePendencias' in note ? note.quantidadePendencias : note.pendencias.length;
  return `Rascunho com ${pendingCount} pendencia(s)`;
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatNotaOrigem(origem: NotaFiscalResumo['origem'] | NotaFiscal['origem']) {
  return origem === 'Pdv' ? 'PDV' : 'Manual';
}

function describeAmbiente(ambiente: NotaFiscalResumo['ambiente'] | NotaFiscal['ambiente']) {
  return ambiente === 'Homologacao' ? 'homologacao' : 'producao';
}

function buildEnderecoCompacto(value: {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep?: string | null;
}) {
  const firstLine = [value.logradouro, value.numero, value.complemento].filter(Boolean).join(', ');
  const secondLine = [value.bairro, value.cidade, value.uf, value.cep].filter(Boolean).join(' · ');
  return [firstLine, secondLine].filter(Boolean).join(' | ') || 'Endereco nao informado.';
}

function canTransmitNote(note: Pick<NotaFiscalResumo, 'status' | 'prontaParaTransmissao'> | Pick<NotaFiscal, 'status' | 'prontaParaTransmissao'>) {
  return note.prontaParaTransmissao && note.status !== 'Autorizada' && note.status !== 'Cancelada';
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(15, 23, 42, 0.04)', height: '100%' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ mt: 0.5, fontWeight: 700, wordBreak: 'break-word' }}>{value}</Typography>
    </Box>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ flex: 1, p: 2, borderRadius: 3, bgcolor: 'rgba(15, 23, 42, 0.04)' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
    </Box>
  );
}
