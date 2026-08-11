import DeliveryDiningRoundedIcon from '@mui/icons-material/DeliveryDiningRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import StoreMallDirectoryRoundedIcon from '@mui/icons-material/StoreMallDirectoryRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { orderRealtimeService } from '../services/orderRealtimeService';
import { orderService } from '../services/orderService';
import { transportService } from '../services/transportService';
import { userService } from '../services/userService';
import type { AtualizarPedidoEntregaPayload, PedidoDetalhe, PedidoStatus, PedidoResumo, Transportadora, UsuarioEntregador } from '../types';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/http';

const statusOptions: Array<{ value: PedidoStatus | 'Todos'; label: string }> = [
  { value: 'Todos', label: 'Todos os status' },
  { value: 'Recebido', label: 'Recebido' },
  { value: 'EmPreparacao', label: 'Em preparacao' },
  { value: 'ProntoParaRetirada', label: 'Pronto para retirada' },
  { value: 'SaiuParaEntrega', label: 'Saiu para entrega' },
  { value: 'Entregue', label: 'Entregue' },
  { value: 'Cancelado', label: 'Cancelado' }
];

export function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PedidoResumo[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PedidoDetalhe | null>(null);
  const [statusFilter, setStatusFilter] = useState<PedidoStatus | 'Todos'>('Todos');
  const [term, setTerm] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [deliveryUsers, setDeliveryUsers] = useState<UsuarioEntregador[]>([]);
  const [deliveryForm, setDeliveryForm] = useState<AtualizarPedidoEntregaPayload>({
    transportadoraId: null,
    entregadorUsuarioId: null,
    nomeEntregador: null,
    telefoneEntregador: null,
    compartilhamentoAtivo: false
  });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuth();
  const canManageOrders = hasPermission('GerenciarPedidos');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await Promise.all([loadOrders(), loadTransportadoras(), loadDeliveryUsers(), orderRealtimeService.connect('empresa')]);
      } catch (error) {
        if (active) {
          enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
        }
      }
    }

    const unsubscribe = orderRealtimeService.subscribe((event) => {
      if (event.tipoEvento === 'Localizacao') {
        setOrders((current) => current.map((item) => item.vendaId === event.vendaId ? {
          ...item,
          entrega: event.entrega ?? item.entrega,
          dataUltimaAtualizacao: event.atualizadoEm
        } : item));
        setSelectedOrder((current) => current?.vendaId === event.vendaId ? {
          ...current,
          entrega: event.entrega ?? current.entrega,
          dataUltimaAtualizacao: event.atualizadoEm
        } : current);
        return;
      }

      void loadOrders(selectedOrderId ?? event.vendaId);
      if (selectedOrderId === event.vendaId) {
        void loadOrderDetail(event.vendaId);
      }
    });

    void bootstrap();

    return () => {
      active = false;
      unsubscribe();
      void orderRealtimeService.disconnect();
    };
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [statusFilter]);

  useEffect(() => {
    if (!selectedOrder) {
      setDeliveryForm({
        transportadoraId: null,
        entregadorUsuarioId: null,
        nomeEntregador: null,
        telefoneEntregador: null,
        compartilhamentoAtivo: false
      });
      return;
    }

    setDeliveryForm({
      transportadoraId: selectedOrder.entrega?.transportadoraId ?? null,
      entregadorUsuarioId: selectedOrder.entrega?.entregadorUsuarioId ?? null,
      nomeEntregador: selectedOrder.entrega?.nomeEntregador ?? null,
      telefoneEntregador: selectedOrder.entrega?.telefoneEntregador ?? null,
      compartilhamentoAtivo: selectedOrder.entrega?.compartilhamentoAtivo ?? false
    });
  }, [selectedOrder]);

  async function loadOrders(preferredOrderId?: string | null) {
    setLoading(true);
    try {
      const result = await orderService.list({
        status: statusFilter === 'Todos' ? null : statusFilter,
        termo: term.trim() || null
      });
      setOrders(result);

      const nextSelectedId = preferredOrderId
        ?? selectedOrderId
        ?? result[0]?.vendaId
        ?? null;

      setSelectedOrderId(nextSelectedId);
      if (nextSelectedId) {
        await loadOrderDetail(nextSelectedId);
      } else {
        setSelectedOrder(null);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrderDetail(vendaId: string) {
    try {
      const detail = await orderService.getById(vendaId);
      setSelectedOrder(detail);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  async function loadTransportadoras() {
    try {
      const result = await transportService.list(true);
      setTransportadoras(result.sort((left, right) => {
        if (left.ativo !== right.ativo) {
          return left.ativo ? -1 : 1;
        }

        return left.nome.localeCompare(right.nome, 'pt-BR');
      }));
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
    }
  }

  async function loadDeliveryUsers() {
    try {
      const result = await userService.listDeliveryUsers();
      setDeliveryUsers(result
        .filter((item) => item.ativo)
        .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR')));
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
    }
  }

  async function handleStatusChange(status: PedidoStatus) {
    if (!selectedOrder || !canManageOrders) {
      return;
    }

    setUpdatingStatus(status);
    try {
      const updated = await orderService.updateStatus(selectedOrder.vendaId, {
        status,
        observacao: statusNote.trim() || null
      });
      setSelectedOrder(updated);
      setOrders((current) => current.map((item) => item.vendaId === updated.vendaId ? {
        ...item,
        pedidoStatus: updated.pedidoStatus,
        entrega: updated.entrega,
        dataUltimaAtualizacao: updated.dataUltimaAtualizacao
      } : item));
      setStatusNote('');
      enqueueSnackbar(`Pedido ${updated.codigoAcompanhamento} atualizado para ${labelForStatus(updated.pedidoStatus)}.`, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function handleDeliverySave() {
    if (!selectedOrder) {
      return;
    }

    setSavingDelivery(true);
    try {
      const entrega = await orderService.updateDelivery(selectedOrder.vendaId, deliveryForm);
      setSelectedOrder((current) => current ? { ...current, entrega, dataUltimaAtualizacao: new Date().toISOString() } : current);
      setOrders((current) => current.map((item) => item.vendaId === selectedOrder.vendaId ? {
        ...item,
        entrega,
        dataUltimaAtualizacao: new Date().toISOString()
      } : item));
      enqueueSnackbar('Entrega configurada com sucesso.', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setSavingDelivery(false);
    }
  }

  async function copyCourierLink() {
    const linkPath = selectedOrder?.entrega?.linkPainelEntregador;
    if (!linkPath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}${linkPath}`);
      enqueueSnackbar('Link do entregador copiado.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Nao foi possivel copiar o link automaticamente neste navegador.', { variant: 'warning' });
    }
  }

  const nextActions = useMemo(() => selectedOrder ? resolveNextActions(selectedOrder) : [], [selectedOrder]);

  if (loading && orders.length === 0) {
    return <Loading message="Carregando fluxo operacional de pedidos..." />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Pedidos em operacao</Typography>
        <Typography color="text.secondary">
          Acompanhe cada pedido desde o recebimento, preparo, retirada ou entrega, com o mesmo cadastro de venda e estoque.
        </Typography>
      </Box>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
            <ListFilterField
              label="Filtrar pedidos"
              placeholder="Numero, codigo de acompanhamento ou cliente"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              fullWidth
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void loadOrders();
                }
              }}
            />
            <TextField
              select
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as PedidoStatus | 'Todos')}
              sx={{ minWidth: 240 }}
            >
              {statusOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={() => void loadOrders()}>
              Atualizar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={5}>
          <Stack spacing={1.5}>
            {orders.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 4 }}>
                Nenhum pedido encontrado para os filtros atuais.
              </Alert>
            ) : orders.map((order) => (
              <Paper
                key={order.vendaId}
                variant="outlined"
                onClick={() => {
                  setSelectedOrderId(order.vendaId);
                  void loadOrderDetail(order.vendaId);
                }}
                sx={{
                  p: 2,
                  borderRadius: 4,
                  cursor: 'pointer',
                  borderColor: selectedOrderId === order.vendaId ? 'primary.main' : 'rgba(23, 75, 138, 0.12)'
                }}
              >
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography sx={{ fontWeight: 900 }}>{order.codigoAcompanhamento}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {order.numeroVenda} · {order.clienteNome}
                      </Typography>
                    </Box>
                    <Chip label={labelForStatus(order.pedidoStatus)} color={colorForStatus(order.pedidoStatus)} />
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      icon={order.atendimentoTipo === 'Entrega' ? <DeliveryDiningRoundedIcon /> : <StoreMallDirectoryRoundedIcon />}
                      label={order.atendimentoTipo === 'Entrega' ? 'Entrega' : 'Retirada'}
                      variant="outlined"
                    />
                    <Chip size="small" icon={<InventoryRoundedIcon />} label={`${order.quantidadeItens} item(ns)`} variant="outlined" />
                    <Chip size="small" icon={<ReceiptLongRoundedIcon />} label={formatCurrency(order.total)} variant="outlined" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {order.enderecoEntregaResumo ?? 'Retirada no local'} · ultima atualizacao {formatDateTime(order.dataUltimaAtualizacao ?? order.dataVenda)}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Grid>

        <Grid item xs={12} lg={7}>
          {selectedOrder ? (
            <Card sx={{ borderRadius: 5 }}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Stack spacing={2.25}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 900 }}>{selectedOrder.codigoAcompanhamento}</Typography>
                      <Typography color="text.secondary">
                        {selectedOrder.clienteNome} · {selectedOrder.atendimentoTipo === 'Entrega' ? 'Entrega em domicilio' : 'Retirada no local'}
                      </Typography>
                    </Box>
                    <Chip label={labelForStatus(selectedOrder.pedidoStatus)} color={colorForStatus(selectedOrder.pedidoStatus)} />
                  </Stack>

                  <Grid container spacing={1.25}>
                    <Grid item xs={12} md={4}>
                      <SummaryPaper label="Total" value={formatCurrency(selectedOrder.total)} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <SummaryPaper label="Venda" value={selectedOrder.numeroVenda} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <SummaryPaper label="Atualizado" value={formatDateTime(selectedOrder.dataUltimaAtualizacao ?? selectedOrder.dataVenda)} />
                    </Grid>
                  </Grid>

                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    {selectedOrder.enderecoEntregaResumo ?? 'Retirada no balcao'}{selectedOrder.observacaoPedido ? ` · ${selectedOrder.observacaoPedido}` : ''}
                  </Alert>

                  {canManageOrders ? (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                      <Stack spacing={1.5}>
                        <Typography sx={{ fontWeight: 800 }}>Atualizacao operacional</Typography>
                        <TextField
                          label="Observacao desta etapa"
                          value={statusNote}
                          onChange={(event) => setStatusNote(event.target.value)}
                          placeholder="Ex.: pedido separado, cliente avisado, motoboy saiu."
                          fullWidth
                        />
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {nextActions.map((action) => (
                            <Button
                              key={action.status}
                              variant={action.status === 'Cancelado' ? 'outlined' : 'contained'}
                              color={action.status === 'Cancelado' ? 'error' : 'primary'}
                              onClick={() => void handleStatusChange(action.status)}
                              disabled={Boolean(updatingStatus)}
                            >
                              {updatingStatus === action.status ? 'Atualizando...' : action.label}
                            </Button>
                          ))}
                        </Stack>
                      </Stack>
                    </Paper>
                  ) : null}

                  {selectedOrder.atendimentoTipo === 'Entrega' ? (
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                          <Box>
                            <Typography sx={{ fontWeight: 800 }}>Entrega e rastreio</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Atribua a transportadora, libere o link do entregador e acompanhe a ultima localizacao em tempo real.
                            </Typography>
                          </Box>
                          {selectedOrder.entrega?.linkPainelEntregador ? (
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                              <Button variant="outlined" size="small" onClick={() => void copyCourierLink()}>
                                Copiar link do entregador
                              </Button>
                              <Button
                                variant="contained"
                                size="small"
                                href={selectedOrder.entrega.linkPainelEntregador}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir painel do entregador
                              </Button>
                            </Stack>
                          ) : null}
                        </Stack>

                        {canManageOrders ? (
                          <Grid container spacing={1.25}>
                            <Grid item xs={12} md={3}>
                              <TextField
                                select
                                fullWidth
                                label="Transportadora"
                                value={deliveryForm.transportadoraId ?? ''}
                                onChange={(event) => setDeliveryForm((current) => ({
                                  ...current,
                                  transportadoraId: event.target.value || null
                                }))}
                              >
                                <MenuItem value="">Sem transportadora</MenuItem>
                                {transportadoras.filter((item) => item.ativo).map((transportadora) => (
                                  <MenuItem key={transportadora.transportadoraId} value={transportadora.transportadoraId}>
                                    {transportadora.nome}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <TextField
                                select
                                fullWidth
                                label="Usuario entregador"
                                value={deliveryForm.entregadorUsuarioId ?? ''}
                                onChange={(event) => {
                                  const nextUser = deliveryUsers.find((item) => item.usuarioId === event.target.value) ?? null;
                                  setDeliveryForm((current) => ({
                                    ...current,
                                    entregadorUsuarioId: event.target.value || null,
                                    nomeEntregador: nextUser?.nome ?? current.nomeEntregador
                                  }));
                                }}
                              >
                                <MenuItem value="">Sem usuario vinculado</MenuItem>
                                {deliveryUsers.map((deliveryUser) => (
                                  <MenuItem key={deliveryUser.usuarioId} value={deliveryUser.usuarioId}>
                                    {deliveryUser.nome}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <TextField
                                fullWidth
                                label="Entregador"
                                value={deliveryForm.nomeEntregador ?? ''}
                                onChange={(event) => setDeliveryForm((current) => ({
                                  ...current,
                                  nomeEntregador: event.target.value || null
                                }))}
                              />
                            </Grid>
                            <Grid item xs={12} md={3}>
                              <TextField
                                fullWidth
                                label="Telefone do entregador"
                                value={deliveryForm.telefoneEntregador ?? ''}
                                onChange={(event) => setDeliveryForm((current) => ({
                                  ...current,
                                  telefoneEntregador: event.target.value || null
                                }))}
                              />
                            </Grid>
                          </Grid>
                        ) : null}

                        {selectedOrder.entrega?.entregadorUsuarioNome ? (
                          <Typography variant="body2" color="text.secondary">
                            Usuario entregador vinculado: {selectedOrder.entrega.entregadorUsuarioNome}
                          </Typography>
                        ) : null}

                        {canManageOrders ? (
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
                            <FormControlLabel
                              control={(
                                <Checkbox
                                  checked={deliveryForm.compartilhamentoAtivo}
                                  onChange={(event) => setDeliveryForm((current) => ({
                                    ...current,
                                    compartilhamentoAtivo: event.target.checked
                                  }))}
                                />
                              )}
                              label="Liberar compartilhamento do GPS do entregador"
                            />
                            <Button variant="contained" onClick={() => void handleDeliverySave()} disabled={savingDelivery}>
                              {savingDelivery ? 'Salvando...' : 'Salvar entrega'}
                            </Button>
                          </Stack>
                        ) : null}

                        {selectedOrder.entrega?.localizacaoAtual ? (
                          <Stack spacing={1.25}>
                            <Typography variant="body2" color="text.secondary">
                              Ultima posicao em {formatDateTime(selectedOrder.entrega.localizacaoAtual.dataCaptura)}
                              {selectedOrder.entrega.nomeEntregador ? ` · ${selectedOrder.entrega.nomeEntregador}` : ''}
                              {selectedOrder.entrega.localizacaoAtual.precisaoMetros ? ` · precisao ${selectedOrder.entrega.localizacaoAtual.precisaoMetros.toFixed(0)} m` : ''}
                            </Typography>
                            <Box
                              component="iframe"
                              src={`${selectedOrder.entrega.localizacaoAtual.linkMapa}&z=16&output=embed`}
                              title="Mapa da entrega"
                              sx={{ width: '100%', height: 260, border: 0, borderRadius: 3 }}
                            />
                          </Stack>
                        ) : (
                          <Alert severity="info" sx={{ borderRadius: 3 }}>
                            O GPS do entregador ainda nao enviou nenhuma localizacao. Assim que o link for aberto no celular e o compartilhamento iniciar, a posicao aparecera aqui e para o comprador.
                          </Alert>
                        )}
                      </Stack>
                    </Paper>
                  ) : null}

                  <Divider />

                  <Typography variant="h6">Itens do pedido</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Produto</TableCell>
                        <TableCell align="right">Qtd</TableCell>
                        <TableCell align="right">Unit.</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedOrder.itens.map((item) => (
                        <TableRow key={item.vendaItemId}>
                          <TableCell>{item.produtoNome}</TableCell>
                          <TableCell align="right">{item.quantidade}</TableCell>
                          <TableCell align="right">{formatCurrency(item.valorUnitario)}</TableCell>
                          <TableCell align="right">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Divider />

                  <Typography variant="h6">Linha do tempo</Typography>
                  <Stack spacing={1.25}>
                    {selectedOrder.ocorrencias.map((event) => (
                      <Paper key={event.pedidoOcorrenciaId} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                        <Stack spacing={0.5}>
                          <Stack direction="row" spacing={1} justifyContent="space-between">
                            <Typography sx={{ fontWeight: 800 }}>{event.titulo}</Typography>
                            <Typography variant="body2" color="text.secondary">{formatDateTime(event.dataOcorrencia)}</Typography>
                          </Stack>
                          {event.descricao ? (
                            <Typography variant="body2" color="text.secondary">{event.descricao}</Typography>
                          ) : null}
                          {event.usuarioNome ? (
                            <Typography variant="caption" color="text.secondary">Atualizado por {event.usuarioNome}</Typography>
                          ) : null}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 4 }}>
              Selecione um pedido para acompanhar preparo, retirada ou entrega.
            </Alert>
          )}
        </Grid>
      </Grid>
    </Stack>
  );
}

function SummaryPaper({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography sx={{ mt: 0.5, fontWeight: 900 }}>{value}</Typography>
    </Paper>
  );
}

function resolveNextActions(order: PedidoDetalhe): Array<{ status: PedidoStatus; label: string }> {
  switch (order.pedidoStatus) {
    case 'Recebido':
      return order.atendimentoTipo === 'Entrega'
        ? [{ status: 'EmPreparacao', label: 'Iniciar preparo' }, { status: 'Cancelado', label: 'Cancelar pedido' }]
        : [{ status: 'EmPreparacao', label: 'Iniciar preparo' }, { status: 'Cancelado', label: 'Cancelar pedido' }];
    case 'EmPreparacao':
      return order.atendimentoTipo === 'Entrega'
        ? [{ status: 'SaiuParaEntrega', label: 'Saiu para entrega' }, { status: 'Entregue', label: 'Marcar como entregue' }]
        : [{ status: 'ProntoParaRetirada', label: 'Pedido pronto' }, { status: 'Entregue', label: 'Marcar como retirado' }];
    case 'ProntoParaRetirada':
      return [{ status: 'Entregue', label: 'Cliente retirou' }];
    case 'SaiuParaEntrega':
      return [{ status: 'Entregue', label: 'Entrega concluida' }];
    default:
      return [];
  }
}

function labelForStatus(status: PedidoStatus) {
  switch (status) {
    case 'Recebido': return 'Recebido';
    case 'EmPreparacao': return 'Em preparacao';
    case 'ProntoParaRetirada': return 'Pronto';
    case 'SaiuParaEntrega': return 'Na rua';
    case 'Entregue': return 'Entregue';
    case 'Cancelado': return 'Cancelado';
    default: return status;
  }
}

function colorForStatus(status: PedidoStatus): 'default' | 'primary' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'Recebido': return 'warning';
    case 'EmPreparacao': return 'primary';
    case 'ProntoParaRetirada': return 'success';
    case 'SaiuParaEntrega': return 'primary';
    case 'Entregue': return 'success';
    case 'Cancelado': return 'error';
    default: return 'default';
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}
