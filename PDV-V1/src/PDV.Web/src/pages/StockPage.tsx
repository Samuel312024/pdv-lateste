import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import WarehouseRoundedIcon from '@mui/icons-material/WarehouseRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { productService } from '../services/productService';
import {
  stockService,
  type AjusteEstoquePayload,
  type ConferirEstoquePayload,
  type LiberarReservaEstoquePayload,
  type ReservarEstoquePayload,
  type RegistrarEntradaLotePayload,
  type RegistrarExpedicaoEstoquePayload,
  type RegistrarRecebimentoEstoquePayload,
  type TransferirEstoquePayload
} from '../services/stockService';
import type {
  DepositoEstoqueResumo,
  EstoqueDepositoSaldo,
  EstoqueLote,
  EstoqueLoteAlerta,
  MovimentacaoEstoque,
  PosicaoEstoqueProduto,
  Produto,
  ProdutoFornecedor
} from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import { hasUserPermission } from '../utils/featureAccess';

type InventoryStatusFilter = 'todos' | 'saudavel' | 'baixo' | 'semEstoque' | 'semBaixa' | 'inativo';
type InventoryControlFilter = 'todos' | 'controlado' | 'lote' | 'livre';
type InventoryActiveFilter = 'ativos' | 'todos' | 'inativos';

interface LotEntryFormState {
  codigoLote: string;
  quantidadeEntrada: string;
  dataEntrada: string;
  dataFabricacao: string;
  dataValidade: string;
  precoCustoUnitario: string;
  documentoReferencia: string;
  observacao: string;
}

interface AdjustStockFormState {
  depositoEstoqueId: string;
  novoEstoque: string;
  motivo: string;
}

interface ReceiptFormState {
  depositoEstoqueId: string;
  quantidadeEntrada: string;
  precoCustoUnitario: string;
  documentoReferencia: string;
  observacao: string;
}

type ReservationMode = 'reserve' | 'release';

interface ReservationFormState {
  depositoEstoqueId: string;
  quantidade: string;
  motivo: string;
}

interface TransferFormState {
  depositoOrigemId: string;
  depositoDestinoId: string;
  quantidade: string;
  documentoReferencia: string;
  observacao: string;
}

interface ShipmentFormState {
  depositoEstoqueId: string;
  quantidadeSaida: string;
  documentoReferencia: string;
  observacao: string;
}

interface ConferenceFormState {
  depositoEstoqueId: string;
  quantidadeContada: string;
  documentoReferencia: string;
  observacao: string;
}

interface StockProductDetailViewProps {
  product: Produto;
  productPosition: PosicaoEstoqueProduto | null;
  deposits: DepositoEstoqueResumo[];
  positionError: string | null;
  usingFallbackPosition: boolean;
  canEditProduct: boolean;
  canViewMovements: boolean;
  selectedLots: EstoqueLote[];
  selectedMovements: MovimentacaoEstoque[];
  loadingDetails: boolean;
  lotsError: string | null;
  movementsError: string | null;
  onlyLotsWithBalance: boolean;
  onToggleOnlyLotsWithBalance: (checked: boolean) => void;
  onOpenAdjustDialog: () => void;
  onOpenReceiptDialog: () => void;
  onOpenLotEntryDialog: () => void;
  onOpenReservationDialog: (mode: ReservationMode) => void;
  onOpenShipmentDialog: () => void;
  onOpenConferenceDialog: () => void;
  onOpenTransferDialog: () => void;
}

const statusFilterOptions: Array<{ value: InventoryStatusFilter; label: string }> = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'semEstoque', label: 'Ruptura' },
  { value: 'baixo', label: 'Estoque baixo' },
  { value: 'saudavel', label: 'Saudavel' },
  { value: 'semBaixa', label: 'Sem baixa automatica' },
  { value: 'inativo', label: 'Inativos' }
];

const controlFilterOptions: Array<{ value: InventoryControlFilter; label: string }> = [
  { value: 'todos', label: 'Todos os controles' },
  { value: 'controlado', label: 'Com controle de estoque' },
  { value: 'lote', label: 'Controle por lote' },
  { value: 'livre', label: 'Estoque livre' }
];

const activeFilterOptions: Array<{ value: InventoryActiveFilter; label: string }> = [
  { value: 'ativos', label: 'Ativos' },
  { value: 'todos', label: 'Todos' },
  { value: 'inativos', label: 'Somente inativos' }
];

const lotAlertWindowDays = 45;
const initialLotEntryForm = createEmptyLotEntryForm();
const initialReceiptForm = createEmptyReceiptForm();
const initialReservationForm: ReservationFormState = { depositoEstoqueId: '', quantidade: '', motivo: '' };
const initialTransferForm: TransferFormState = {
  depositoOrigemId: '',
  depositoDestinoId: '',
  quantidade: '',
  documentoReferencia: '',
  observacao: ''
};
const initialShipmentForm: ShipmentFormState = {
  depositoEstoqueId: '',
  quantidadeSaida: '',
  documentoReferencia: '',
  observacao: ''
};
const initialConferenceForm: ConferenceFormState = {
  depositoEstoqueId: '',
  quantidadeContada: '',
  documentoReferencia: '',
  observacao: ''
};

export function StockPage() {
  const { session } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<Produto[]>([]);
  const [deposits, setDeposits] = useState<DepositoEstoqueResumo[]>([]);
  const [depositsError, setDepositsError] = useState<string | null>(null);
  const [lotAlerts, setLotAlerts] = useState<EstoqueLoteAlerta[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProductPosition, setSelectedProductPosition] = useState<PosicaoEstoqueProduto | null>(null);
  const [selectedProductPositionError, setSelectedProductPositionError] = useState<string | null>(null);
  const [selectedLots, setSelectedLots] = useState<EstoqueLote[]>([]);
  const [selectedMovements, setSelectedMovements] = useState<MovimentacaoEstoque[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [lotsError, setLotsError] = useState<string | null>(null);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('todos');
  const [controlFilter, setControlFilter] = useState<InventoryControlFilter>('todos');
  const [activeFilter, setActiveFilter] = useState<InventoryActiveFilter>('ativos');
  const [onlyLotsWithBalance, setOnlyLotsWithBalance] = useState(true);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustingStock, setAdjustingStock] = useState(false);
  const [adjustForm, setAdjustForm] = useState<AdjustStockFormState>({ depositoEstoqueId: '', novoEstoque: '', motivo: '' });
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState<ReceiptFormState>(initialReceiptForm);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservationMode, setReservationMode] = useState<ReservationMode>('reserve');
  const [reservationForm, setReservationForm] = useState<ReservationFormState>(initialReservationForm);
  const [processingReservation, setProcessingReservation] = useState(false);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [shipmentForm, setShipmentForm] = useState<ShipmentFormState>(initialShipmentForm);
  const [processingShipment, setProcessingShipment] = useState(false);
  const [conferenceDialogOpen, setConferenceDialogOpen] = useState(false);
  const [conferenceForm, setConferenceForm] = useState<ConferenceFormState>(initialConferenceForm);
  const [processingConference, setProcessingConference] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferFormState>(initialTransferForm);
  const [processingTransfer, setProcessingTransfer] = useState(false);
  const [lotEntryDialogOpen, setLotEntryDialogOpen] = useState(false);
  const [lotEntryForm, setLotEntryForm] = useState<LotEntryFormState>(initialLotEntryForm);
  const [registeringLotEntry, setRegisteringLotEntry] = useState(false);

  const deferredSearch = useDeferredValue(search);
  const canEditProduct = hasUserPermission(session, 'EditarProduto');
  const canViewMovements = hasUserPermission(session, 'VisualizarRelatorios');

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      await refreshInventory();
    } finally {
      setLoading(false);
    }
  }

  async function refreshInventory(preferredProductId?: string | null) {
    setRefreshing(true);
    try {
      const [productsResult, lotAlertsResult, depositsResult] = await Promise.allSettled([
        productService.list(undefined, undefined),
        stockService.listLotAlerts(lotAlertWindowDays),
        stockService.listDeposits()
      ]);

      if (productsResult.status !== 'fulfilled') {
        throw productsResult.reason;
      }

      const normalizedProducts = productsResult.value.map(normalizeProduct);
      setProducts(normalizedProducts);
      setLotAlerts(lotAlertsResult.status === 'fulfilled' ? lotAlertsResult.value : []);

      if (depositsResult.status === 'fulfilled') {
        setDeposits(depositsResult.value);
        setDepositsError(null);
      } else {
        setDeposits([]);
        setDepositsError(getErrorMessage(depositsResult.reason));
      }

      const candidateId = preferredProductId ?? selectedProductId;
      if (candidateId && normalizedProducts.some((item) => item.produtoId === candidateId)) {
        setSelectedProductId(candidateId);
      } else if (normalizedProducts.length > 0) {
        setSelectedProductId(normalizedProducts[0].produtoId);
      } else {
        setSelectedProductId(null);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRefreshing(false);
    }
  }

  const filteredProducts = sortProductsForInventory(
    products.filter((product) => {
      if (!matchesActiveFilter(product, activeFilter)) {
        return false;
      }

      if (!matchesStatusFilter(product, statusFilter)) {
        return false;
      }

      if (!matchesControlFilter(product, controlFilter)) {
        return false;
      }

      return matchesProductSearch(product, normalizeSearchTerm(deferredSearch));
    })
  );

  const selectedProduct = products.find((item) => item.produtoId === selectedProductId) ?? null;
  const selectedProductResolvedPosition = selectedProduct
    ? buildResolvedProductPosition(selectedProduct, selectedProductPosition, deposits)
    : null;
  const usingFallbackProductPosition = selectedProduct != null && selectedProductPosition == null && selectedProductResolvedPosition != null;
  const activeProducts = products.filter((item) => item.ativo);
  const controlledProducts = activeProducts.filter((item) => item.controlaEstoque);
  const outOfStockCount = controlledProducts.filter((item) => item.estoqueAtual <= 0).length;
  const lowStockCount = controlledProducts.filter((item) => item.estoqueBaixo && item.estoqueAtual > 0).length;
  const lotControlledCount = controlledProducts.filter((item) => item.controlaLote).length;
  const stockCostValue = controlledProducts.reduce((total, item) => total + Math.max(item.estoqueAtual, 0) * item.precoCusto, 0);
  const depositCount = deposits.filter((item) => item.ativo).length;
  const reservedStockTotal = deposits.reduce((total, item) => total + item.quantidadeReservadaTotal, 0);
  const physicalStockTotal = deposits.reduce((total, item) => total + item.quantidadeFisicaTotal, 0);
  const criticalProducts = buildCriticalProducts(activeProducts);
  const highlightedLotAlerts = lotAlerts.slice(0, 6);
  const selectedProductDetailContent = selectedProduct ? (
    <StockProductDetailView
      product={selectedProduct}
      productPosition={selectedProductResolvedPosition}
      deposits={deposits}
      positionError={selectedProductPositionError}
      usingFallbackPosition={usingFallbackProductPosition}
      canEditProduct={canEditProduct}
      canViewMovements={canViewMovements}
      selectedLots={selectedLots}
      selectedMovements={selectedMovements}
      loadingDetails={loadingDetails}
      lotsError={lotsError}
      movementsError={movementsError}
      onlyLotsWithBalance={onlyLotsWithBalance}
      onToggleOnlyLotsWithBalance={setOnlyLotsWithBalance}
      onOpenAdjustDialog={openAdjustDialog}
      onOpenReceiptDialog={openReceiptDialog}
      onOpenLotEntryDialog={openLotEntryDialog}
      onOpenReservationDialog={openReservationDialog}
      onOpenShipmentDialog={openShipmentDialog}
      onOpenConferenceDialog={openConferenceDialog}
      onOpenTransferDialog={openTransferDialog}
    />
  ) : (
    <Alert severity="info" sx={{ borderRadius: 3 }}>
      Selecione um item da tabela para abrir o detalhe operacional do estoque.
    </Alert>
  );

  useEffect(() => {
    if (filteredProducts.length === 0) {
      if (selectedProductId !== null) {
        setSelectedProductId(null);
      }

      return;
    }

    if (!selectedProductId || !filteredProducts.some((item) => item.produtoId === selectedProductId)) {
      const nextProductId = filteredProducts[0].produtoId;
      startTransition(() => {
        setSelectedProductId(nextProductId);
      });
    }
  }, [filteredProducts, selectedProductId]);

  useEffect(() => {
    if (!selectedProduct) {
      setSelectedProductPosition(null);
      setSelectedProductPositionError(null);
      setSelectedLots([]);
      setSelectedMovements([]);
      setLotsError(null);
      setMovementsError(null);
      setLoadingDetails(false);
      return;
    }

    let active = true;
    const product = selectedProduct;

    async function loadDetails() {
      setLoadingDetails(true);
      setSelectedProductPositionError(null);
      setLotsError(null);
      setMovementsError(null);

      const [positionResult, lotsResult, movementsResult] = await Promise.allSettled([
        stockService.getProductPosition(product.produtoId),
        product.controlaLote
          ? stockService.listProductLots(product.produtoId, onlyLotsWithBalance)
          : Promise.resolve([] as EstoqueLote[]),
        canViewMovements
          ? stockService.listMovements({ produtoId: product.produtoId })
          : Promise.resolve([] as MovimentacaoEstoque[])
      ]);

      if (!active) {
        return;
      }

      if (positionResult.status === 'fulfilled') {
        setSelectedProductPosition(positionResult.value);
        setSelectedProductPositionError(null);
      } else {
        setSelectedProductPosition(null);
        setSelectedProductPositionError(getErrorMessage(positionResult.reason));
      }

      if (lotsResult.status === 'fulfilled') {
        setSelectedLots(lotsResult.value);
      } else if (product.controlaLote) {
        setSelectedLots([]);
        setLotsError(getErrorMessage(lotsResult.reason));
      }

      if (movementsResult.status === 'fulfilled') {
        setSelectedMovements(movementsResult.value);
      } else if (canViewMovements) {
        setSelectedMovements([]);
        setMovementsError(getErrorMessage(movementsResult.reason));
      }

      if (active) {
        setLoadingDetails(false);
      }
    }

    void loadDetails();

    return () => {
      active = false;
    };
  }, [canViewMovements, onlyLotsWithBalance, selectedProduct]);

  function handleResetFilters() {
    setSearch('');
    setStatusFilter('todos');
    setControlFilter('todos');
    setActiveFilter('ativos');
  }

  function handleSelectProduct(produtoId: string) {
    startTransition(() => {
      setSelectedProductId(produtoId);
    });
  }

  function openProductDetails(produtoId: string) {
    handleSelectProduct(produtoId);
    setDetailDialogOpen(true);
  }

  function openAdjustDialog() {
    if (!selectedProduct || !canEditProduct) {
      return;
    }

    const preferredDepositId = getPreferredDepositId(selectedProductResolvedPosition?.depositos);
    const selectedDeposit = findDepositBalance(selectedProductResolvedPosition?.depositos, preferredDepositId);
    setAdjustForm({
      depositoEstoqueId: preferredDepositId,
      novoEstoque: selectedDeposit ? selectedDeposit.quantidadeDisponivel.toString() : selectedProduct.estoqueAtual.toString(),
      motivo: ''
    });
    setAdjustDialogOpen(true);
  }

  function openReceiptDialog() {
    if (!selectedProduct || !canEditProduct || !selectedProduct.controlaEstoque || selectedProduct.controlaLote) {
      return;
    }

    const preferredDepositId = getPreferredDepositId(selectedProductResolvedPosition?.depositos);
    setReceiptForm({
      ...initialReceiptForm,
      depositoEstoqueId: preferredDepositId,
      precoCustoUnitario: selectedProduct.precoCusto > 0 ? formatEditableQuantity(selectedProduct.precoCusto) : ''
    });
    setReceiptDialogOpen(true);
  }

  function openReservationDialog(mode: ReservationMode) {
    if (!selectedProduct || !canEditProduct || !selectedProduct.controlaEstoque) {
      return;
    }

    const preferredDepositId = getPreferredDepositId(selectedProductResolvedPosition?.depositos);
    setReservationMode(mode);
    setReservationForm({
      ...initialReservationForm,
      depositoEstoqueId: preferredDepositId
    });
    setReservationDialogOpen(true);
  }

  function openShipmentDialog() {
    if (!selectedProduct || !canEditProduct || !selectedProduct.controlaEstoque) {
      return;
    }

    const preferredDepositId = getPreferredDepositId(selectedProductResolvedPosition?.depositos);
    setShipmentForm({
      ...initialShipmentForm,
      depositoEstoqueId: preferredDepositId
    });
    setShipmentDialogOpen(true);
  }

  function openConferenceDialog() {
    if (!selectedProduct || !canEditProduct || !selectedProduct.controlaEstoque) {
      return;
    }

    const preferredDepositId = getPreferredDepositId(selectedProductResolvedPosition?.depositos);
    const selectedDeposit = findDepositBalance(selectedProductResolvedPosition?.depositos, preferredDepositId);
    setConferenceForm({
      ...initialConferenceForm,
      depositoEstoqueId: preferredDepositId,
      quantidadeContada: selectedDeposit ? formatEditableQuantity(selectedDeposit.quantidadeFisica) : formatEditableQuantity(selectedProduct.estoqueAtual)
    });
    setConferenceDialogOpen(true);
  }

  function openTransferDialog() {
    if (!selectedProduct || !canEditProduct || !selectedProduct.controlaEstoque) {
      return;
    }

    const balances = selectedProductResolvedPosition?.depositos ?? [];
    const origemId = getPreferredDepositId(balances);
    const destinoId = balances.find((item) => item.depositoEstoqueId !== origemId)?.depositoEstoqueId ?? '';
    setTransferForm({
      ...initialTransferForm,
      depositoOrigemId: origemId,
      depositoDestinoId: destinoId
    });
    setTransferDialogOpen(true);
  }

  function openLotEntryDialog() {
    if (!selectedProduct || !canEditProduct) {
      return;
    }

    setLotEntryForm(createEmptyLotEntryForm());
    setLotEntryDialogOpen(true);
  }

  async function handleAdjustStock() {
    if (!selectedProduct) {
      return;
    }

    const parsedStock = parseQuantityInput(adjustForm.novoEstoque);
    if (parsedStock === null) {
      enqueueSnackbar('Informe um estoque valido para ajustar o saldo.', { variant: 'warning' });
      return;
    }

    const payload: AjusteEstoquePayload = {
      produtoId: selectedProduct.produtoId,
      depositoEstoqueId: normalizeDepositRequestId(adjustForm.depositoEstoqueId),
      novoEstoque: parsedStock,
      motivo: normalizeOptionalText(adjustForm.motivo)
    };

    setAdjustingStock(true);
    try {
      await stockService.adjustStock(payload);
      enqueueSnackbar('Ajuste de estoque realizado com sucesso.', { variant: 'success' });
      setAdjustDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setAdjustingStock(false);
    }
  }

  async function handleReceipt() {
    if (!selectedProduct) {
      return;
    }

    const quantidadeEntrada = parseQuantityInput(receiptForm.quantidadeEntrada);
    if (!receiptForm.depositoEstoqueId || quantidadeEntrada === null || quantidadeEntrada <= 0) {
      enqueueSnackbar('Selecione o deposito e informe uma quantidade valida para o recebimento.', { variant: 'warning' });
      return;
    }

    const payload: RegistrarRecebimentoEstoquePayload = {
      produtoId: selectedProduct.produtoId,
      depositoEstoqueId: normalizeDepositRequestId(receiptForm.depositoEstoqueId),
      quantidadeEntrada,
      precoCustoUnitario: parseQuantityInput(receiptForm.precoCustoUnitario),
      documentoReferencia: normalizeOptionalText(receiptForm.documentoReferencia),
      observacao: normalizeOptionalText(receiptForm.observacao)
    };

    setProcessingReceipt(true);
    try {
      await stockService.registerReceipt(payload);
      enqueueSnackbar('Recebimento de estoque registrado com sucesso.', { variant: 'success' });
      setReceiptDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setProcessingReceipt(false);
    }
  }

  async function handleReservation() {
    if (!selectedProduct) {
      return;
    }

    const quantidade = parseQuantityInput(reservationForm.quantidade);
    if (!reservationForm.depositoEstoqueId || quantidade === null || quantidade <= 0) {
      enqueueSnackbar('Selecione o deposito e informe uma quantidade valida.', { variant: 'warning' });
      return;
    }

    setProcessingReservation(true);
    try {
      if (reservationMode === 'reserve') {
        const payload: ReservarEstoquePayload = {
          produtoId: selectedProduct.produtoId,
          depositoEstoqueId: normalizeDepositRequestId(reservationForm.depositoEstoqueId),
          quantidade,
          motivo: normalizeOptionalText(reservationForm.motivo)
        };
        await stockService.reserveStock(payload);
        enqueueSnackbar('Reserva interna registrada com sucesso.', { variant: 'success' });
      } else {
        const payload: LiberarReservaEstoquePayload = {
          produtoId: selectedProduct.produtoId,
          depositoEstoqueId: normalizeDepositRequestId(reservationForm.depositoEstoqueId),
          quantidade,
          motivo: normalizeOptionalText(reservationForm.motivo)
        };
        await stockService.releaseReservedStock(payload);
        enqueueSnackbar('Reserva liberada com sucesso.', { variant: 'success' });
      }

      setReservationDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setProcessingReservation(false);
    }
  }

  async function handleShipment() {
    if (!selectedProduct) {
      return;
    }

    const quantidadeSaida = parseQuantityInput(shipmentForm.quantidadeSaida);
    if (!shipmentForm.depositoEstoqueId || quantidadeSaida === null || quantidadeSaida <= 0) {
      enqueueSnackbar('Selecione o deposito e informe uma quantidade valida para expedir.', { variant: 'warning' });
      return;
    }

    const payload: RegistrarExpedicaoEstoquePayload = {
      produtoId: selectedProduct.produtoId,
      depositoEstoqueId: normalizeDepositRequestId(shipmentForm.depositoEstoqueId),
      quantidadeSaida,
      documentoReferencia: normalizeOptionalText(shipmentForm.documentoReferencia),
      observacao: normalizeOptionalText(shipmentForm.observacao)
    };

    setProcessingShipment(true);
    try {
      await stockService.registerShipment(payload);
      enqueueSnackbar('Expedicao de estoque registrada com sucesso.', { variant: 'success' });
      setShipmentDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setProcessingShipment(false);
    }
  }

  async function handleConference() {
    if (!selectedProduct) {
      return;
    }

    const quantidadeContada = parseQuantityInput(conferenceForm.quantidadeContada);
    if (!conferenceForm.depositoEstoqueId || quantidadeContada === null || quantidadeContada < 0) {
      enqueueSnackbar('Selecione o deposito e informe a quantidade contada para a conferencia.', { variant: 'warning' });
      return;
    }

    const payload: ConferirEstoquePayload = {
      produtoId: selectedProduct.produtoId,
      depositoEstoqueId: normalizeDepositRequestId(conferenceForm.depositoEstoqueId),
      quantidadeContada,
      documentoReferencia: normalizeOptionalText(conferenceForm.documentoReferencia),
      observacao: normalizeOptionalText(conferenceForm.observacao)
    };

    setProcessingConference(true);
    try {
      const result = await stockService.registerConference(payload);
      enqueueSnackbar(result.mensagem, { variant: result.ajusteAplicado ? 'success' : 'info' });
      setConferenceDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setProcessingConference(false);
    }
  }

  async function handleTransfer() {
    if (!selectedProduct) {
      return;
    }

    const quantidade = parseQuantityInput(transferForm.quantidade);
    if (!transferForm.depositoOrigemId || !transferForm.depositoDestinoId || quantidade === null || quantidade <= 0) {
      enqueueSnackbar('Informe origem, destino e quantidade valida para transferir.', { variant: 'warning' });
      return;
    }

    if (transferForm.depositoOrigemId === transferForm.depositoDestinoId) {
      enqueueSnackbar('Origem e destino da transferencia devem ser diferentes.', { variant: 'warning' });
      return;
    }

    const payload: TransferirEstoquePayload = {
      produtoId: selectedProduct.produtoId,
      depositoOrigemId: transferForm.depositoOrigemId,
      depositoDestinoId: transferForm.depositoDestinoId,
      quantidade,
      documentoReferencia: normalizeOptionalText(transferForm.documentoReferencia),
      observacao: normalizeOptionalText(transferForm.observacao)
    };

    setProcessingTransfer(true);
    try {
      await stockService.transferStock(payload);
      enqueueSnackbar('Transferencia interna registrada com sucesso.', { variant: 'success' });
      setTransferDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setProcessingTransfer(false);
    }
  }

  async function handleRegisterLotEntry() {
    if (!selectedProduct) {
      return;
    }

    const quantidadeEntrada = parseQuantityInput(lotEntryForm.quantidadeEntrada);
    if (!lotEntryForm.codigoLote.trim() || quantidadeEntrada === null || quantidadeEntrada <= 0) {
      enqueueSnackbar('Preencha lote e quantidade de entrada antes de registrar.', { variant: 'warning' });
      return;
    }

    const payload: RegistrarEntradaLotePayload = {
      produtoId: selectedProduct.produtoId,
      codigoLote: lotEntryForm.codigoLote.trim(),
      quantidadeEntrada,
      dataEntrada: lotEntryForm.dataEntrada,
      dataFabricacao: normalizeNullableDate(lotEntryForm.dataFabricacao),
      dataValidade: normalizeNullableDate(lotEntryForm.dataValidade),
      precoCustoUnitario: parseQuantityInput(lotEntryForm.precoCustoUnitario),
      documentoReferencia: normalizeOptionalText(lotEntryForm.documentoReferencia),
      observacao: normalizeOptionalText(lotEntryForm.observacao)
    };

    if (!payload.dataEntrada) {
      enqueueSnackbar('Informe a data de entrada do lote.', { variant: 'warning' });
      return;
    }

    setRegisteringLotEntry(true);
    try {
      await stockService.registerLotEntry(payload);
      enqueueSnackbar('Entrada de lote registrada com sucesso.', { variant: 'success' });
      setLotEntryDialogOpen(false);
      await refreshInventory(selectedProduct.produtoId);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRegisteringLotEntry(false);
    }
  }

  const selectedDepositBalances = selectedProductResolvedPosition?.depositos ?? [];
  const adjustDeposit = findDepositBalance(selectedDepositBalances, adjustForm.depositoEstoqueId);
  const receiptDeposit = findDepositBalance(selectedDepositBalances, receiptForm.depositoEstoqueId);
  const reservationDeposit = findDepositBalance(selectedDepositBalances, reservationForm.depositoEstoqueId);
  const shipmentDeposit = findDepositBalance(selectedDepositBalances, shipmentForm.depositoEstoqueId);
  const conferenceDeposit = findDepositBalance(selectedDepositBalances, conferenceForm.depositoEstoqueId);
  const transferOriginDeposit = findDepositBalance(selectedDepositBalances, transferForm.depositoOrigemId);
  const transferDestinationDeposit = findDepositBalance(selectedDepositBalances, transferForm.depositoDestinoId);
  const usingVirtualDepositFallback = selectedDepositBalances.some((item) => item.depositoEstoqueId.startsWith('__fallback-'));
  const erpContingencyMode = usingVirtualDepositFallback || Boolean(selectedProductPositionError);
  const erpUnavailable = selectedDepositBalances.length === 0;

  const adjustParsedStock = parseQuantityInput(adjustForm.novoEstoque);
  const adjustDelta = adjustDeposit && adjustParsedStock !== null
    ? adjustParsedStock - adjustDeposit.quantidadeDisponivel
    : null;
  const adjustHasDraft = Boolean(adjustForm.novoEstoque.trim() || adjustForm.motivo.trim());
  const adjustValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de ajustar.'
    : !adjustForm.depositoEstoqueId
      ? 'Selecione um deposito para ajustar o saldo.'
      : adjustParsedStock === null
        ? 'Informe um saldo numerico valido.'
        : adjustParsedStock < 0
          ? 'O saldo ajustado nao pode ser negativo.'
          : null;
  const showAdjustValidation = adjustHasDraft && Boolean(adjustValidationMessage);
  const canSubmitAdjust = !adjustingStock && selectedDepositBalances.length > 0 && !adjustValidationMessage;
  const adjustActionHint = adjustValidationMessage
    ?? (adjustParsedStock !== null && adjustDeposit && selectedProduct
      ? `Ajuste pronto para gravar ${formatQuantity(adjustParsedStock, selectedProduct.unidadeMedida)} no deposito selecionado.`
      : 'Informe o novo saldo do deposito para concluir o ajuste.');

  const receiptQuantity = parseQuantityInput(receiptForm.quantidadeEntrada);
  const receiptCost = parseQuantityInput(receiptForm.precoCustoUnitario);
  const receiptHasDraft = Boolean(
    receiptForm.quantidadeEntrada.trim() ||
    receiptForm.documentoReferencia.trim() ||
    receiptForm.observacao.trim()
  );
  const receiptProjectedAvailable = receiptDeposit && receiptQuantity !== null
    ? receiptDeposit.quantidadeDisponivel + receiptQuantity
    : null;
  const receiptProjectedPhysical = receiptDeposit && receiptQuantity !== null
    ? receiptDeposit.quantidadeFisica + receiptQuantity
    : null;
  const receiptValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de registrar o recebimento.'
    : selectedProduct.controlaLote
      ? 'Itens com lote devem usar o recebimento rastreado por lote.'
      : !receiptForm.depositoEstoqueId
        ? 'Selecione o deposito do recebimento.'
        : receiptQuantity === null
          ? 'Informe uma quantidade de entrada numerica valida.'
          : receiptQuantity <= 0
            ? 'A quantidade de entrada precisa ser maior que zero.'
            : receiptCost !== null && receiptCost < 0
              ? 'O custo unitario nao pode ser negativo.'
              : null;
  const showReceiptValidation = receiptHasDraft && Boolean(receiptValidationMessage);
  const canSubmitReceipt = !processingReceipt && selectedDepositBalances.length > 0 && !receiptValidationMessage;
  const receiptActionHint = receiptValidationMessage
    ?? (receiptDeposit && receiptQuantity !== null && selectedProduct
      ? `Recebimento pronto para lancar ${formatQuantity(receiptQuantity, selectedProduct.unidadeMedida)} em ${receiptDeposit.depositoNome}${receiptCost != null ? ` com custo ${formatCurrency(receiptCost)}.` : '.'}`
      : 'Informe deposito, quantidade e, se houver, o custo real da entrada.');

  const reservationQuantity = parseQuantityInput(reservationForm.quantidade);
  const reservationHasDraft = Boolean(reservationForm.quantidade.trim() || reservationForm.motivo.trim());
  const reservationCapacity = reservationMode === 'reserve'
    ? reservationDeposit?.quantidadeDisponivel ?? 0
    : reservationDeposit?.quantidadeReservada ?? 0;
  const reservationProjectedAvailable = reservationDeposit && reservationQuantity !== null
    ? reservationMode === 'reserve'
      ? reservationDeposit.quantidadeDisponivel - reservationQuantity
      : reservationDeposit.quantidadeDisponivel + reservationQuantity
    : null;
  const reservationProjectedReserved = reservationDeposit && reservationQuantity !== null
    ? reservationMode === 'reserve'
      ? reservationDeposit.quantidadeReservada + reservationQuantity
      : reservationDeposit.quantidadeReservada - reservationQuantity
    : null;
  const reservationValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de movimentar reservas.'
    : !reservationForm.depositoEstoqueId
      ? 'Selecione um deposito para reservar ou liberar.'
      : reservationQuantity === null
        ? 'Informe uma quantidade numerica valida.'
        : reservationQuantity <= 0
          ? 'A quantidade precisa ser maior que zero.'
          : reservationQuantity > reservationCapacity
            ? reservationMode === 'reserve'
              ? `Saldo disponivel insuficiente. Maximo agora: ${formatQuantity(reservationCapacity, selectedProduct.unidadeMedida)}.`
              : `Reserva insuficiente. Maximo liberavel agora: ${formatQuantity(reservationCapacity, selectedProduct.unidadeMedida)}.`
            : null;
  const showReservationValidation = reservationHasDraft && Boolean(reservationValidationMessage);
  const canSubmitReservation = !processingReservation && selectedDepositBalances.length > 0 && !reservationValidationMessage;
  const reservationActionHint = reservationValidationMessage
    ?? (reservationDeposit && reservationQuantity !== null && selectedProduct
      ? reservationMode === 'reserve'
        ? `Reserva pronta para separar ${formatQuantity(reservationQuantity, selectedProduct.unidadeMedida)} do disponivel deste deposito.`
        : `Liberacao pronta para devolver ${formatQuantity(reservationQuantity, selectedProduct.unidadeMedida)} ao saldo disponivel.`
      : 'Informe quantidade e deposito para movimentar a reserva interna.');

  const shipmentQuantity = parseQuantityInput(shipmentForm.quantidadeSaida);
  const shipmentHasDraft = Boolean(
    shipmentForm.quantidadeSaida.trim() ||
    shipmentForm.documentoReferencia.trim() ||
    shipmentForm.observacao.trim()
  );
  const shipmentProjectedAvailable = shipmentDeposit && shipmentQuantity !== null
    ? shipmentDeposit.quantidadeDisponivel - shipmentQuantity
    : null;
  const shipmentProjectedPhysical = shipmentDeposit && shipmentQuantity !== null
    ? shipmentDeposit.quantidadeFisica - shipmentQuantity
    : null;
  const shipmentValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de expedir.'
    : !shipmentForm.depositoEstoqueId
      ? 'Selecione o deposito da expedicao.'
      : shipmentQuantity === null
        ? 'Informe uma quantidade numerica valida.'
        : shipmentQuantity <= 0
          ? 'A quantidade expedida precisa ser maior que zero.'
          : shipmentQuantity > (shipmentDeposit?.quantidadeDisponivel ?? 0)
            ? `Saldo disponivel insuficiente. Maximo expedivel agora: ${formatQuantity(shipmentDeposit?.quantidadeDisponivel ?? 0, selectedProduct.unidadeMedida)}.`
            : null;
  const showShipmentValidation = shipmentHasDraft && Boolean(shipmentValidationMessage);
  const canSubmitShipment = !processingShipment && selectedDepositBalances.length > 0 && !shipmentValidationMessage;
  const shipmentActionHint = shipmentValidationMessage
    ?? (shipmentDeposit && shipmentQuantity !== null && selectedProduct
      ? selectedProduct.controlaLote
        ? `Expedicao pronta para baixar ${formatQuantity(shipmentQuantity, selectedProduct.unidadeMedida)} com consumo tecnico por lote.`
        : `Expedicao pronta para retirar ${formatQuantity(shipmentQuantity, selectedProduct.unidadeMedida)} do deposito ${shipmentDeposit.depositoNome}.`
      : 'Informe deposito, quantidade e contexto operacional da saida.');

  const conferenceCountedQuantity = parseQuantityInput(conferenceForm.quantidadeContada);
  const conferenceHasDraft = Boolean(
    conferenceForm.quantidadeContada.trim() ||
    conferenceForm.documentoReferencia.trim() ||
    conferenceForm.observacao.trim()
  );
  const conferenceReserved = conferenceDeposit?.quantidadeReservada ?? 0;
  const conferenceSystemPhysical = conferenceDeposit?.quantidadeFisica ?? 0;
  const conferenceDivergence = conferenceCountedQuantity !== null
    ? conferenceCountedQuantity - conferenceSystemPhysical
    : null;
  const conferenceProjectedAvailable = conferenceCountedQuantity !== null
    ? conferenceCountedQuantity - conferenceReserved
    : null;
  const conferenceDivergenceValue = conferenceDivergence ?? 0;
  const conferenceValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de conferir.'
    : !conferenceForm.depositoEstoqueId
      ? 'Selecione o deposito da conferencia.'
      : conferenceCountedQuantity === null
        ? 'Informe a quantidade fisica contada.'
        : conferenceCountedQuantity < 0
          ? 'A contagem nao pode ser negativa.'
          : conferenceCountedQuantity < conferenceReserved
            ? `A contagem fisica nao pode ficar abaixo do reservado atual (${formatQuantity(conferenceReserved, selectedProduct.unidadeMedida)}).`
            : null;
  const showConferenceValidation = conferenceHasDraft && Boolean(conferenceValidationMessage);
  const canSubmitConference = !processingConference && selectedDepositBalances.length > 0 && !conferenceValidationMessage;
  const conferenceActionHint = conferenceValidationMessage
    ?? (conferenceCountedQuantity !== null && conferenceDeposit && selectedProduct
      ? conferenceDivergenceValue === 0
        ? `Conferencia pronta para registrar contagem sem divergencia em ${conferenceDeposit.depositoNome}.`
        : conferenceDivergenceValue > 0
          ? `Conferencia vai reconhecer sobra fisica de ${formatQuantity(conferenceDivergenceValue, selectedProduct.unidadeMedida)}.`
          : `Conferencia vai baixar falta fisica de ${formatQuantity(Math.abs(conferenceDivergenceValue), selectedProduct.unidadeMedida)}.`
      : 'Informe o deposito e a quantidade fisica contada para registrar a conferencia.');

  const transferQuantity = parseQuantityInput(transferForm.quantidade);
  const transferHasDraft = Boolean(transferForm.quantidade.trim() || transferForm.documentoReferencia.trim() || transferForm.observacao.trim());
  const transferValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de transferir.'
    : usingVirtualDepositFallback
      ? 'A transferencia precisa da malha ERP completa dos depositos.'
      : !transferForm.depositoOrigemId || !transferForm.depositoDestinoId
        ? 'Selecione origem e destino da transferencia.'
        : transferForm.depositoOrigemId === transferForm.depositoDestinoId
          ? 'Origem e destino precisam ser diferentes.'
          : transferQuantity === null
            ? 'Informe uma quantidade numerica valida.'
            : transferQuantity <= 0
              ? 'A quantidade precisa ser maior que zero.'
              : transferQuantity > (transferOriginDeposit?.quantidadeDisponivel ?? 0)
                ? `Saldo insuficiente na origem. Maximo transferivel: ${formatQuantity(transferOriginDeposit?.quantidadeDisponivel ?? 0, selectedProduct.unidadeMedida)}.`
                : null;
  const showTransferValidation = transferHasDraft && Boolean(transferValidationMessage);
  const transferProjectedOrigin = transferOriginDeposit && transferQuantity !== null
    ? transferOriginDeposit.quantidadeDisponivel - transferQuantity
    : null;
  const transferProjectedDestination = transferDestinationDeposit && transferQuantity !== null
    ? transferDestinationDeposit.quantidadeDisponivel + transferQuantity
    : null;
  const canSubmitTransfer = !processingTransfer && selectedDepositBalances.length > 1 && !transferValidationMessage;
  const transferActionHint = transferValidationMessage
    ?? (transferOriginDeposit && transferDestinationDeposit && transferQuantity !== null && selectedProduct
      ? `Transferencia pronta para mover ${formatQuantity(transferQuantity, selectedProduct.unidadeMedida)} com trilha entre origem e destino.`
      : 'Selecione origem, destino e quantidade para transferir o saldo.');

  const lotEntryQuantity = parseQuantityInput(lotEntryForm.quantidadeEntrada);
  const lotEntryCost = parseQuantityInput(lotEntryForm.precoCustoUnitario);
  const lotEntryHasDraft = Boolean(
    lotEntryForm.codigoLote.trim() ||
    lotEntryForm.quantidadeEntrada.trim() ||
    lotEntryForm.precoCustoUnitario.trim() ||
    lotEntryForm.documentoReferencia.trim() ||
    lotEntryForm.observacao.trim() ||
    lotEntryForm.dataFabricacao.trim() ||
    lotEntryForm.dataValidade.trim()
  );
  const lotEntryDateConflict = Boolean(
    lotEntryForm.dataFabricacao &&
    lotEntryForm.dataValidade &&
    lotEntryForm.dataValidade < lotEntryForm.dataFabricacao
  );
  const lotEntryProjectedStock = selectedProduct && lotEntryQuantity !== null
    ? selectedProduct.estoqueAtual + lotEntryQuantity
    : null;
  const lotEntryValidationMessage = !selectedProduct
    ? 'Selecione um produto antes de registrar o lote.'
    : !lotEntryForm.codigoLote.trim()
      ? 'Informe o codigo do lote.'
      : lotEntryQuantity === null
        ? 'Informe uma quantidade de entrada numerica valida.'
        : lotEntryQuantity <= 0
          ? 'A quantidade de entrada precisa ser maior que zero.'
          : !lotEntryForm.dataEntrada.trim()
            ? 'Informe a data de entrada do recebimento.'
            : lotEntryDateConflict
              ? 'A validade nao pode ser anterior a data de fabricacao.'
              : lotEntryCost !== null && lotEntryCost < 0
                ? 'O custo unitario nao pode ser negativo.'
                : null;
  const showLotEntryValidation = lotEntryHasDraft && Boolean(lotEntryValidationMessage);
  const canSubmitLotEntry = !registeringLotEntry && !lotEntryValidationMessage;
  const lotEntryActionHint = lotEntryValidationMessage
    ?? (selectedProduct && lotEntryQuantity !== null
      ? `Recebimento pronto para registrar ${formatQuantity(lotEntryQuantity, selectedProduct.unidadeMedida)} no lote ${lotEntryForm.codigoLote.trim()}.`
      : 'Preencha lote, quantidade e data de entrada para registrar o recebimento.');

  if (loading) {
    return <Loading message="Carregando centro de estoque..." />;
  }

  return (
    <Stack spacing={3}>
      <Card
        sx={{
          borderRadius: 6,
          color: '#f8fbff',
          background:
            'radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 26%), linear-gradient(135deg, #0f2745, #123a71 58%, #1a6a82)'
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <Inventory2RoundedIcon />
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    Centro de estoque
                  </Typography>
                </Stack>
                <Typography sx={{ maxWidth: 760, color: 'rgba(248,251,255,0.78)' }}>
                  Painel profissional para recebimento, armazenagem, reserva, expedicao, conferencia, lotes, validade e historico do mesmo cadastro que abastece o PDV.
                </Typography>
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<RestartAltRoundedIcon />}
                  onClick={() => void refreshInventory()}
                  disabled={refreshing}
                  sx={{
                    borderColor: 'rgba(248,251,255,0.24)',
                    color: '#f8fbff',
                    '&:hover': {
                      borderColor: 'rgba(248,251,255,0.4)',
                      bgcolor: 'rgba(255,255,255,0.08)'
                    }
                  }}
                >
                  Atualizar
                </Button>
                <Button
                  component={RouterLink}
                  to="/produtos"
                  variant="contained"
                  sx={{
                    bgcolor: '#f9b25c',
                    color: '#11233d',
                    '&:hover': {
                      bgcolor: '#ffc06d'
                    }
                  }}
                >
                  Abrir cadastro de produtos
                </Button>
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} useFlexGap flexWrap="wrap">
              <Chip label={`${activeProducts.length} SKUs ativos`} sx={heroChipSx} />
              <Chip label={`${depositCount} depositos ativos`} sx={heroChipSx} />
              <Chip label={`${outOfStockCount} em ruptura`} sx={heroChipSx} />
              <Chip label={`${lowStockCount} com estoque baixo`} sx={heroChipSx} />
              <Chip label={`${formatQuantity(reservedStockTotal)} reservados internamente`} sx={heroChipSx} />
              <Chip label={`${lotControlledCount} controlados por lote`} sx={heroChipSx} />
              <Chip label={`${lotAlerts.length} lotes em alerta`} sx={heroChipSx} />
            </Stack>
          </Stack>
        </CardContent>
        {refreshing ? <LinearProgress color="inherit" sx={{ opacity: 0.55 }} /> : null}
      </Card>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
            xl: 'repeat(6, minmax(0, 1fr))'
          }
        }}
      >
        <Box>
          <MetricCard
            title="SKUs ativos"
            value={activeProducts.length.toString()}
            caption="Itens operacionais no radar do estoque"
            tone="primary"
          />
        </Box>
        <Box>
          <MetricCard
            title="Ruptura"
            value={outOfStockCount.toString()}
            caption="Produtos controlados com saldo zerado"
            tone="danger"
          />
        </Box>
        <Box>
          <MetricCard
            title="Estoque baixo"
            value={lowStockCount.toString()}
            caption="Abaixo do minimo configurado"
            tone="warning"
          />
        </Box>
        <Box>
          <MetricCard
            title="Lote e validade"
            value={lotControlledCount.toString()}
            caption={`${lotAlerts.length} lotes vencidos ou proximos do vencimento`}
            tone="info"
          />
        </Box>
        <Box>
          <MetricCard
            title="Reserva interna"
            value={formatQuantity(reservedStockTotal)}
            caption="Saldo comprometido e fora da venda imediata"
            tone="warning"
          />
        </Box>
        <Box>
          <MetricCard
            title="Capital em custo"
            value={formatCurrency(stockCostValue)}
            caption="Estimativa pelo custo atual dos itens controlados"
            tone="success"
          />
        </Box>
      </Box>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <WarehouseRoundedIcon color="primary" />
              <Box>
                <Typography variant="h6">Malha de depositos</Typography>
                <Typography color="text.secondary">
                  Visao ERP do saldo disponivel, reservado e fisico por area operacional.
                </Typography>
              </Box>
            </Stack>

            {deposits.length === 0 ? (
              <Alert severity={depositsError ? 'warning' : 'info'} sx={{ borderRadius: 3 }}>
                {depositsError
                  ? `A malha ERP de depositos nao respondeu agora. ${depositsError}`
                  : 'Nenhum deposito ativo encontrado para esta empresa ainda.'}
              </Alert>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: {
                    xs: '1fr',
                    md: 'repeat(2, minmax(0, 1fr))',
                    xl: 'repeat(3, minmax(0, 1fr))'
                  }
                }}
              >
                {deposits.map((deposit) => (
                  <Paper
                    key={deposit.depositoEstoqueId}
                    variant="outlined"
                    sx={{
                      borderRadius: 4,
                      p: 2.25,
                      background: deposit.padrao
                        ? 'linear-gradient(180deg, #f7fbff, #ffffff)'
                        : 'linear-gradient(180deg, #ffffff, #fcfbf8)'
                    }}
                  >
                    <Stack spacing={1.1}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Box>
                          <Typography sx={{ fontWeight: 800 }}>{deposit.nome}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {deposit.codigo}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          color={deposit.padrao ? 'primary' : deposit.permiteVendaDireta ? 'success' : 'default'}
                          label={deposit.padrao ? 'Padrao PDV' : deposit.permiteVendaDireta ? 'Venda direta' : 'Retaguarda'}
                        />
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        {deposit.descricao ?? 'Sem descricao operacional.'}
                      </Typography>

                      <Grid container spacing={1.2}>
                        <Grid item xs={4}>
                          <MiniValue label="Disponivel" value={formatQuantity(deposit.quantidadeDisponivelTotal)} />
                        </Grid>
                        <Grid item xs={4}>
                          <MiniValue label="Reservado" value={formatQuantity(deposit.quantidadeReservadaTotal)} />
                        </Grid>
                        <Grid item xs={4}>
                          <MiniValue label="Fisico" value={formatQuantity(deposit.quantidadeFisicaTotal)} />
                        </Grid>
                      </Grid>

                      <Typography variant="caption" color="text.secondary">
                        {deposit.totalSkus} SKU(s) com saldo · custo disponivel {formatCurrency(deposit.valorDisponivelCusto)}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Stack spacing={2.25}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <FilterAltRoundedIcon color="primary" />
              <Typography variant="h6">Filtro operacional</Typography>
            </Stack>

            <Grid container spacing={2}>
              <Grid item xs={12} lg={4.5}>
                <ListFilterField
                  label="Buscar produto, codigo, marca ou fornecedor"
                  value={search}
                  onChange={(event) => {
                    const value = event.target.value;
                    startTransition(() => setSearch(value));
                  }}
                  placeholder="Ex.: cafe, 789..., fornecedor principal"
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={2.5}>
                <TextField
                  select
                  label="Status"
                  fullWidth
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as InventoryStatusFilter)}
                >
                  {statusFilterOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} lg={2.5}>
                <TextField
                  select
                  label="Controle"
                  fullWidth
                  value={controlFilter}
                  onChange={(event) => setControlFilter(event.target.value as InventoryControlFilter)}
                >
                  {controlFilterOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} lg={1.5}>
                <TextField
                  select
                  label="Base"
                  fullWidth
                  value={activeFilter}
                  onChange={(event) => setActiveFilter(event.target.value as InventoryActiveFilter)}
                >
                  {activeFilterOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} lg={1.5}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<RestartAltRoundedIcon />}
                  onClick={handleResetFilters}
                  sx={{ height: '100%' }}
                >
                  Limpar
                </Button>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} xl={4}>
          <Stack spacing={3}>
            <Card
              sx={{
                borderRadius: 5,
                background: 'linear-gradient(180deg, #ffffff, #fff8ef)'
              }}
            >
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <WarningAmberRoundedIcon color="warning" />
                    <Typography variant="h6">Reposicao prioritaria</Typography>
                  </Stack>

                  {criticalProducts.length === 0 ? (
                    <Alert severity="success" sx={{ borderRadius: 3 }}>
                      Nenhum produto critico na lista ativa. O estoque esta dentro das faixas configuradas.
                    </Alert>
                  ) : (
                    criticalProducts.map((product) => {
                      const stockStatus = getStockStatus(product);
                      const supplier = getPrincipalSupplier(product);

                      return (
                        <Paper key={product.produtoId} variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
                          <Stack spacing={1.25}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Box>
                                <Typography sx={{ fontWeight: 800 }}>{product.nome}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {product.codigoBarras ?? 'Sem codigo principal'} · {formatQuantity(product.estoqueAtual, product.unidadeMedida)}
                                </Typography>
                              </Box>
                              <Chip size="small" label={stockStatus.label} color={stockStatus.color} />
                            </Stack>

                            <Typography variant="body2" color="text.secondary">
                              Minimo configurado: {formatQuantity(product.estoqueMinimo, product.unidadeMedida)}
                            </Typography>

                            <Typography variant="body2" color="text.secondary">
                              {supplier
                                ? `Fornecedor principal: ${supplier.clienteFornecedorNome}`
                                : 'Sem fornecedor principal vinculado para reposicao.'}
                            </Typography>

                            <Button size="small" onClick={() => openProductDetails(product.produtoId)}>
                              Abrir item
                            </Button>
                          </Stack>
                        </Paper>
                      );
                    })
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card
              sx={{
                borderRadius: 5,
                background: 'linear-gradient(180deg, #ffffff, #f5fbff)'
              }}
            >
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <AssessmentRoundedIcon color="info" />
                    <Typography variant="h6">Validade em foco</Typography>
                  </Stack>

                  {highlightedLotAlerts.length === 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      Nenhum lote com validade critica nos proximos {lotAlertWindowDays} dias.
                    </Alert>
                  ) : (
                    highlightedLotAlerts.map((alert) => (
                      <Paper key={alert.estoqueLoteId} variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
                        <Stack spacing={1.25}>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Box>
                              <Typography sx={{ fontWeight: 800 }}>{alert.produtoNome}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                Lote {alert.codigoLote} · saldo {formatQuantity(alert.quantidadeDisponivel, alert.unidadeMedida)}
                              </Typography>
                            </Box>
                            <Chip
                              size="small"
                              color={alert.vencido ? 'error' : alert.diasParaVencer <= 7 ? 'warning' : 'info'}
                              label={describeLotAlert(alert)}
                            />
                          </Stack>

                          <Typography variant="body2" color="text.secondary">
                            Validade: {formatDate(alert.dataValidade)}
                          </Typography>

                          <Button size="small" onClick={() => openProductDetails(alert.produtoId)}>
                            Abrir item
                          </Button>
                        </Stack>
                      </Paper>
                    ))
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} xl={8}>
          <Stack spacing={3}>
            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                    <Box>
                      <Typography variant="h6">Posicao de estoque</Typography>
                      <Typography color="text.secondary">
                        {filteredProducts.length} item(ns) encontrados com base nos filtros atuais.
                      </Typography>
                    </Box>
                    <Chip label={`${controlledProducts.length} itens com baixa automatica`} variant="outlined" />
                  </Stack>

                  {filteredProducts.length === 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      Nenhum produto encontrado com os filtros atuais. Ajuste os criterios ou cadastre novos itens em Produtos.
                    </Alert>
                  ) : (
                    <TableContainer sx={{ maxHeight: 620 }}>
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Produto</TableCell>
                            <TableCell>Fornecedor</TableCell>
                            <TableCell align="right">Estoque</TableCell>
                            <TableCell align="right">Minimo</TableCell>
                            <TableCell align="right">Custo</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Controle</TableCell>
                            <TableCell align="right">Acao</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredProducts.map((product) => {
                            const stockStatus = getStockStatus(product);
                            const supplier = getPrincipalSupplier(product);

                            return (
                              <TableRow
                                key={product.produtoId}
                                hover
                                selected={product.produtoId === selectedProductId}
                                onClick={() => handleSelectProduct(product.produtoId)}
                                sx={{ cursor: 'pointer' }}
                              >
                                <TableCell>
                                  <Stack spacing={0.35}>
                                    <Typography sx={{ fontWeight: 700 }}>{product.nome}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {product.codigoBarras ?? 'Sem codigo'}{product.marca ? ` · ${product.marca}` : ''}
                                    </Typography>
                                  </Stack>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" color="text.secondary">
                                    {supplier?.clienteFornecedorNome ?? 'Nao vinculado'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">{formatQuantity(product.estoqueAtual, product.unidadeMedida)}</TableCell>
                                <TableCell align="right">{formatQuantity(product.estoqueMinimo, product.unidadeMedida)}</TableCell>
                                <TableCell align="right">
                                  {product.controlaEstoque ? formatCurrency(product.estoqueAtual * product.precoCusto) : '-'}
                                </TableCell>
                                <TableCell>
                                  <Chip
                                    size="small"
                                    label={stockStatus.label}
                                    color={stockStatus.color}
                                    clickable
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openProductDetails(product.produtoId);
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={product.controlaEstoque ? 'Controlado' : 'Livre'}
                                      clickable
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openProductDetails(product.produtoId);
                                      }}
                                    />
                                    {product.controlaLote ? (
                                      <Chip
                                        size="small"
                                        color="info"
                                        label="Lote"
                                        clickable
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openProductDetails(product.produtoId);
                                        }}
                                      />
                                    ) : null}
                                  </Stack>
                                </TableCell>
                                <TableCell align="right">
                                  <Button
                                    size="small"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openProductDetails(product.produtoId);
                                    }}
                                  >
                                    Detalhar
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 5, minHeight: 420 }}>
              <CardContent>
                {selectedProductDetailContent}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        fullWidth
        maxWidth="lg"
        scroll="paper"
      >
        <DialogTitle>
          {selectedProduct ? `Detalhe do estoque · ${selectedProduct.nome}` : 'Detalhe do estoque'}
        </DialogTitle>
        <DialogContent dividers>
          {selectedProductDetailContent}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5 }}>
          <Button onClick={() => setDetailDialogOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={adjustDialogOpen}
        onClose={() => !adjustingStock && setAdjustDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Ajustar saldo</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Use esta acao para inventario, correcao de saldo ou acerto operacional em produtos sem controle por lote, sempre dentro de um deposito especifico.
            </Alert>
            {erpContingencyMode ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Operando em modo de contingencia. Se a malha ERP detalhada ainda nao respondeu, o sistema vai gravar no deposito padrao para nao parar sua operacao.
              </Alert>
            ) : null}

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Deposito"
                  value={adjustForm.depositoEstoqueId}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, depositoEstoqueId: event.target.value }))}
                  fullWidth
                  helperText={usingVirtualDepositFallback ? 'Deposito virtual de contingencia. O backend vai assumir o deposito padrao.' : 'Ajuste sempre no deposito correto para manter a auditoria limpa.'}
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Saldo atual no deposito"
                  value={selectedProduct && adjustDeposit ? formatQuantity(adjustDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Novo saldo disponivel"
                  value={adjustForm.novoEstoque}
                  onChange={(event) => setAdjustForm((current) => ({ ...current, novoEstoque: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showAdjustValidation}
                  helperText={(showAdjustValidation ? adjustValidationMessage : null) ?? (adjustDelta == null
                    ? 'Informe o novo saldo disponivel do deposito.'
                    : `Impacto no saldo: ${formatSignedQuantity(adjustDelta)}.`)}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-adjust-quantity',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
            </Grid>

            {adjustParsedStock !== null && adjustDeposit && selectedProduct ? (
              <Grid container spacing={1.2}>
                <Grid item xs={4}>
                  <MiniValue label="Antes" value={formatQuantity(adjustDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={4}>
                  <MiniValue label="Depois" value={formatQuantity(adjustParsedStock, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={4}>
                  <MiniValue label="Variacao" value={formatSignedQuantity(adjustDelta ?? 0)} />
                </Grid>
              </Grid>
            ) : null}

            <TextField
              label="Motivo do ajuste"
              value={adjustForm.motivo}
              onChange={(event) => setAdjustForm((current) => ({ ...current, motivo: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
              autoComplete="off"
              placeholder="Ex.: inventario rotativo, sobra na conferencia, quebra operacional..."
            />
          </Stack>
        </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography
          variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitAdjust ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {adjustActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
          <Button onClick={() => setAdjustDialogOpen(false)} disabled={adjustingStock}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleAdjustStock()} disabled={!canSubmitAdjust}>
            Salvar ajuste
          </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={receiptDialogOpen}
        onClose={() => !processingReceipt && setReceiptDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Registrar recebimento operacional</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Use este fluxo para entrada de compra, devolucao do cliente, acerto de abastecimento ou recebimento sem rastreabilidade por lote.
            </Alert>
            {erpContingencyMode ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Operando em modo de contingencia. Se a malha ERP detalhada ainda nao respondeu, o sistema grava no deposito padrao para nao atrasar o recebimento.
              </Alert>
            ) : null}

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Deposito de recebimento"
                  value={receiptForm.depositoEstoqueId}
                  onChange={(event) => setReceiptForm((current) => ({ ...current, depositoEstoqueId: event.target.value }))}
                  fullWidth
                  helperText={usingVirtualDepositFallback
                    ? 'Deposito virtual de contingencia. Ao confirmar, o backend assume o deposito padrao.'
                    : 'Escolha onde o saldo fisico vai entrar antes de abastecer venda ou retaguarda.'}
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Quantidade recebida"
                  value={receiptForm.quantidadeEntrada}
                  onChange={(event) => setReceiptForm((current) => ({ ...current, quantidadeEntrada: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showReceiptValidation}
                  helperText={(showReceiptValidation ? receiptValidationMessage : null) ?? 'Informe o volume fisico que esta entrando agora.'}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-receipt-quantity',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Custo unitario"
                  value={receiptForm.precoCustoUnitario}
                  onChange={(event) => setReceiptForm((current) => ({ ...current, precoCustoUnitario: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  helperText={receiptCost == null
                    ? 'Opcional. Atualiza o custo quando houver valor real da compra.'
                    : `Entrada valorizada em ${formatCurrency(receiptCost * (receiptQuantity ?? 0))}.`}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-receipt-unit-cost',
                    placeholder: '0,00'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Documento de referencia"
                  value={receiptForm.documentoReferencia}
                  onChange={(event) => setReceiptForm((current) => ({ ...current, documentoReferencia: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-receipt-document'
                  }}
                />
              </Grid>
            </Grid>

            {receiptDeposit && receiptQuantity !== null && selectedProduct ? (
              <Grid container spacing={1.2}>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Disponivel atual" value={formatQuantity(receiptDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Fisico atual" value={formatQuantity(receiptDeposit.quantidadeFisica, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue
                    label="Saldo apos entrada"
                    value={`${formatQuantity(receiptProjectedAvailable ?? receiptDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida)} disp. / ${formatQuantity(receiptProjectedPhysical ?? receiptDeposit.quantidadeFisica, selectedProduct.unidadeMedida)} fis.`}
                  />
                </Grid>
              </Grid>
            ) : null}

            <TextField
              label="Observacao operacional"
              value={receiptForm.observacao}
              onChange={(event) => setReceiptForm((current) => ({ ...current, observacao: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
              autoComplete="off"
              placeholder="Ex.: nota recebida, devolucao validada, abastecimento da retaguarda, entrada sem lote..."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitReceipt ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {receiptActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button onClick={() => setReceiptDialogOpen(false)} disabled={processingReceipt}>Cancelar</Button>
            <Button variant="contained" onClick={() => void handleReceipt()} disabled={!canSubmitReceipt}>
              Confirmar recebimento
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={reservationDialogOpen}
        onClose={() => !processingReservation && setReservationDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>{reservationMode === 'reserve' ? 'Reservar saldo interno' : 'Liberar reserva interna'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              {reservationMode === 'reserve'
                ? 'A reserva tira o saldo da venda imediata e marca o material como comprometido para uma operacao interna.'
                : 'A liberacao devolve o saldo reservado para a carteira disponivel do deposito.'}
            </Alert>
            {erpContingencyMode ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Operando em modo de contingencia. Se a posicao detalhada ainda nao respondeu, o sistema usa o deposito padrao para nao travar a operacao.
              </Alert>
            ) : null}

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Deposito"
                  value={reservationForm.depositoEstoqueId}
                  onChange={(event) => setReservationForm((current) => ({ ...current, depositoEstoqueId: event.target.value }))}
                  fullWidth
                  helperText={usingVirtualDepositFallback
                    ? 'Deposito estimado de contingencia. Ao confirmar, o backend usa o deposito padrao.'
                    : reservationMode === 'reserve'
                      ? 'Escolha onde o saldo deve ser separado da venda.'
                      : 'Escolha de qual deposito a reserva deve ser devolvida ao disponivel.'}
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Disponivel"
                  value={selectedProduct && reservationDeposit ? formatQuantity(reservationDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Reservado"
                  value={selectedProduct && reservationDeposit ? formatQuantity(reservationDeposit.quantidadeReservada, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label={reservationMode === 'reserve' ? 'Quantidade a reservar' : 'Quantidade a liberar'}
                  value={reservationForm.quantidade}
                  onChange={(event) => setReservationForm((current) => ({ ...current, quantidade: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showReservationValidation}
                  helperText={(showReservationValidation ? reservationValidationMessage : null) ?? `Limite operacional agora: ${formatQuantity(reservationCapacity, selectedProduct?.unidadeMedida)}.`}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-reservation-quantity',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
            </Grid>

            {reservationCapacity > 0 ? (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setReservationForm((current) => ({ ...current, quantidade: formatEditableQuantity(reservationCapacity) }))}
                >
                  Usar limite maximo
                </Button>
                {reservationCapacity > 1 ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setReservationForm((current) => ({ ...current, quantidade: formatEditableQuantity(reservationCapacity / 2) }))}
                  >
                    Usar metade
                  </Button>
                ) : null}
              </Stack>
            ) : null}

            {reservationDeposit && reservationQuantity !== null && selectedProduct ? (
              <Grid container spacing={1.2}>
                <Grid item xs={4}>
                  <MiniValue label="Disponivel atual" value={formatQuantity(reservationDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={4}>
                  <MiniValue label="Reservado atual" value={formatQuantity(reservationDeposit.quantidadeReservada, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={4}>
                  <MiniValue
                    label="Saldo apos"
                    value={reservationMode === 'reserve'
                      ? `${formatQuantity(Math.max(reservationProjectedAvailable ?? 0, 0), selectedProduct.unidadeMedida)} disp.`
                      : `${formatQuantity(Math.max(reservationProjectedReserved ?? 0, 0), selectedProduct.unidadeMedida)} reserv.`}
                  />
                </Grid>
              </Grid>
            ) : null}

            <TextField
              label="Motivo operacional"
              value={reservationForm.motivo}
              onChange={(event) => setReservationForm((current) => ({ ...current, motivo: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
              autoComplete="off"
              placeholder="Ex.: separacao para pedido, conferencia, bloqueio tecnico, material reservado para abastecimento..."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitReservation ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {reservationActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
          <Button onClick={() => setReservationDialogOpen(false)} disabled={processingReservation}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleReservation()} disabled={!canSubmitReservation}>
            {reservationMode === 'reserve' ? 'Confirmar reserva' : 'Liberar saldo'}
          </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={shipmentDialogOpen}
        onClose={() => !processingShipment && setShipmentDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Registrar expedicao operacional</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Expedir reduz o saldo disponivel e o fisico do deposito para representar entrega, consumo interno, perda confirmada ou saida operacional do material.
            </Alert>
            {selectedProduct?.controlaLote ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Este item usa lote. O sistema baixa automaticamente os lotes pela politica tecnica cadastrada.
              </Alert>
            ) : null}
            {erpContingencyMode ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Operando em modo de contingencia. Se a malha ERP detalhada ainda nao respondeu, o backend assume o deposito padrao para nao travar a saida.
              </Alert>
            ) : null}

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Deposito de expedicao"
                  value={shipmentForm.depositoEstoqueId}
                  onChange={(event) => setShipmentForm((current) => ({ ...current, depositoEstoqueId: event.target.value }))}
                  fullWidth
                  helperText={usingVirtualDepositFallback
                    ? 'Deposito virtual de contingencia. Ao confirmar, o backend assume o deposito padrao.'
                    : 'Escolha o deposito de onde o material realmente sai.'}
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo}) · disp. {formatQuantity(deposit.quantidadeDisponivel, selectedProduct?.unidadeMedida)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Disponivel no deposito"
                  value={selectedProduct && shipmentDeposit ? formatQuantity(shipmentDeposit.quantidadeDisponivel, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Fisico no deposito"
                  value={selectedProduct && shipmentDeposit ? formatQuantity(shipmentDeposit.quantidadeFisica, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Quantidade expedida"
                  value={shipmentForm.quantidadeSaida}
                  onChange={(event) => setShipmentForm((current) => ({ ...current, quantidadeSaida: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showShipmentValidation}
                  helperText={(showShipmentValidation ? shipmentValidationMessage : null) ?? 'Informe a quantidade que esta deixando a operacao.'}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-shipment-quantity',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Documento de referencia"
                  value={shipmentForm.documentoReferencia}
                  onChange={(event) => setShipmentForm((current) => ({ ...current, documentoReferencia: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-shipment-document'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Observacao"
                  value={shipmentForm.observacao}
                  onChange={(event) => setShipmentForm((current) => ({ ...current, observacao: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-shipment-notes'
                  }}
                />
              </Grid>
            </Grid>

            {(shipmentDeposit?.quantidadeDisponivel ?? 0) > 0 ? (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShipmentForm((current) => ({
                    ...current,
                    quantidadeSaida: formatEditableQuantity(shipmentDeposit?.quantidadeDisponivel ?? 0)
                  }))}
                >
                  Expedir saldo total
                </Button>
                {(shipmentDeposit?.quantidadeDisponivel ?? 0) > 1 ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setShipmentForm((current) => ({
                      ...current,
                      quantidadeSaida: formatEditableQuantity((shipmentDeposit?.quantidadeDisponivel ?? 0) / 2)
                    }))}
                  >
                    Expedir metade
                  </Button>
                ) : null}
              </Stack>
            ) : null}

            {shipmentDeposit && shipmentQuantity !== null && selectedProduct ? (
              <Grid container spacing={1.2}>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Disponivel apos" value={formatQuantity(Math.max(shipmentProjectedAvailable ?? 0, 0), selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Fisico apos" value={formatQuantity(Math.max(shipmentProjectedPhysical ?? 0, 0), selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Movimento" value={formatSignedQuantity(-shipmentQuantity)} />
                </Grid>
              </Grid>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitShipment ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {shipmentActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button onClick={() => setShipmentDialogOpen(false)} disabled={processingShipment}>Cancelar</Button>
            <Button variant="contained" color="warning" onClick={() => void handleShipment()} disabled={!canSubmitShipment}>
              Confirmar expedicao
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={conferenceDialogOpen}
        onClose={() => !processingConference && setConferenceDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Registrar conferencia fisica</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Compare o saldo fisico contado com o sistema. Se houver divergencia, o ajuste entra com trilha operacional de inventario rotativo.
            </Alert>
            {selectedProduct?.controlaLote ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Para itens com lote, a conferencia preserva a rastreabilidade: sobra vira lote tecnico e falta baixa os lotes conforme a politica de consumo.
              </Alert>
            ) : null}

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Deposito conferido"
                  value={conferenceForm.depositoEstoqueId}
                  onChange={(event) => setConferenceForm((current) => ({ ...current, depositoEstoqueId: event.target.value }))}
                  fullWidth
                  helperText={usingVirtualDepositFallback
                    ? 'Deposito virtual de contingencia. Ao confirmar, o backend assume o deposito padrao.'
                    : 'Selecione o local onde a contagem fisica foi feita.'}
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Fisico no sistema"
                  value={selectedProduct && conferenceDeposit ? formatQuantity(conferenceDeposit.quantidadeFisica, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Reservado"
                  value={selectedProduct && conferenceDeposit ? formatQuantity(conferenceDeposit.quantidadeReservada, selectedProduct.unidadeMedida) : ''}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Quantidade contada"
                  value={conferenceForm.quantidadeContada}
                  onChange={(event) => setConferenceForm((current) => ({ ...current, quantidadeContada: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showConferenceValidation}
                  helperText={(showConferenceValidation ? conferenceValidationMessage : null) ?? 'Informe o total fisico contado no deposito.'}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-conference-count',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Documento de referencia"
                  value={conferenceForm.documentoReferencia}
                  onChange={(event) => setConferenceForm((current) => ({ ...current, documentoReferencia: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-conference-document'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  label="Observacao"
                  value={conferenceForm.observacao}
                  onChange={(event) => setConferenceForm((current) => ({ ...current, observacao: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-conference-notes'
                  }}
                />
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                size="small"
                variant="text"
                onClick={() => setConferenceForm((current) => ({
                  ...current,
                  quantidadeContada: formatEditableQuantity(conferenceDeposit?.quantidadeFisica ?? 0)
                }))}
              >
                Usar fisico do sistema
              </Button>
            </Stack>

            {conferenceDeposit && conferenceCountedQuantity !== null && selectedProduct ? (
              <Grid container spacing={1.2}>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Divergencia" value={formatSignedQuantity(conferenceDivergenceValue)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Disponivel apos" value={formatQuantity(Math.max(conferenceProjectedAvailable ?? 0, 0), selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue
                    label="Resultado tecnico"
                    value={conferenceDivergenceValue === 0
                      ? 'Sem ajuste'
                      : conferenceDivergenceValue > 0
                        ? 'Sobra reconhecida'
                        : 'Falta baixada'}
                  />
                </Grid>
              </Grid>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitConference ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {conferenceActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button onClick={() => setConferenceDialogOpen(false)} disabled={processingConference}>Cancelar</Button>
            <Button variant="contained" color="secondary" onClick={() => void handleConference()} disabled={!canSubmitConference}>
              Confirmar conferencia
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={transferDialogOpen}
        onClose={() => !processingTransfer && setTransferDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Transferencia interna entre depositos</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Movimente saldo disponivel entre operacao PDV, retaguarda e quarentena sem alterar o estoque global do SKU.
            </Alert>
            {erpContingencyMode ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                A transferencia exige a malha ERP completa. Se os depositos ainda nao responderam, atualize a tela ou reinicie a API antes de transferir.
              </Alert>
            ) : null}

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  label="Deposito de origem"
                  value={transferForm.depositoOrigemId}
                  onChange={(event) => setTransferForm((current) => ({ ...current, depositoOrigemId: event.target.value }))}
                  fullWidth
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo}) · disp. {formatQuantity(deposit.quantidadeDisponivel, selectedProduct?.unidadeMedida)}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  label="Deposito de destino"
                  value={transferForm.depositoDestinoId}
                  onChange={(event) => setTransferForm((current) => ({ ...current, depositoDestinoId: event.target.value }))}
                  fullWidth
                >
                  {selectedDepositBalances.map((deposit) => (
                    <MenuItem key={deposit.depositoEstoqueId} value={deposit.depositoEstoqueId}>
                      {deposit.depositoNome} ({deposit.depositoCodigo})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Quantidade"
                  value={transferForm.quantidade}
                  onChange={(event) => setTransferForm((current) => ({ ...current, quantidade: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showTransferValidation}
                  helperText={(showTransferValidation ? transferValidationMessage : null) ?? 'Informe a quantidade exata que sai da origem e entra no destino.'}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-transfer-quantity',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Documento de referencia"
                  value={transferForm.documentoReferencia}
                  onChange={(event) => setTransferForm((current) => ({ ...current, documentoReferencia: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Observacao"
                  value={transferForm.observacao}
                  onChange={(event) => setTransferForm((current) => ({ ...current, observacao: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                />
              </Grid>
            </Grid>

            {transferOriginDeposit && transferDestinationDeposit && transferQuantity !== null && selectedProduct ? (
              <Grid container spacing={1.2}>
                <Grid item xs={4}>
                  <MiniValue label="Origem apos" value={formatQuantity(Math.max(transferProjectedOrigin ?? 0, 0), selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={4}>
                  <MiniValue label="Destino apos" value={formatQuantity(Math.max(transferProjectedDestination ?? 0, 0), selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={4}>
                  <MiniValue label="Movimento" value={formatSignedQuantity(-(transferQuantity))} />
                </Grid>
              </Grid>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitTransfer ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {transferActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
          <Button onClick={() => setTransferDialogOpen(false)} disabled={processingTransfer}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleTransfer()} disabled={!canSubmitTransfer}>
            Transferir saldo
          </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog
        open={lotEntryDialogOpen}
        onClose={() => !registeringLotEntry && setLotEntryDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle>Receber lote rastreado</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Registre cada recebimento real para manter saldo, validade e historico tecnicamente rastreaveis.
            </Alert>

            <TextField
              label="Produto"
              value={selectedProduct?.nome ?? ''}
              fullWidth
              disabled
              autoComplete="off"
            />

            {selectedProduct && lotEntryQuantity !== null ? (
              <Grid container spacing={1.2}>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Saldo atual" value={formatQuantity(selectedProduct.estoqueAtual, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Entrada" value={formatQuantity(lotEntryQuantity, selectedProduct.unidadeMedida)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <MiniValue label="Saldo projetado" value={formatQuantity(lotEntryProjectedStock ?? selectedProduct.estoqueAtual, selectedProduct.unidadeMedida)} />
                </Grid>
              </Grid>
            ) : null}

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Codigo do lote"
                  value={lotEntryForm.codigoLote}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, codigoLote: event.target.value.toUpperCase() }))}
                  fullWidth
                  autoComplete="off"
                  helperText="Ex.: FAB2405A, CX-0526 ou o lote fisico da embalagem."
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-lot-code'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Quantidade de entrada"
                  value={lotEntryForm.quantidadeEntrada}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, quantidadeEntrada: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  error={showLotEntryValidation && (!lotEntryForm.codigoLote.trim() || lotEntryQuantity === null || lotEntryQuantity <= 0)}
                  helperText={lotEntryQuantity === null
                    ? 'Informe a quantidade recebida com ate 3 casas decimais.'
                    : `Entrada prevista: ${formatQuantity(lotEntryQuantity, selectedProduct?.unidadeMedida)}.`}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-lot-entry-quantity',
                    placeholder: '0,000'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Data de entrada"
                  type="date"
                  value={lotEntryForm.dataEntrada}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, dataEntrada: event.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-lot-entry-date'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Data de fabricacao"
                  type="date"
                  value={lotEntryForm.dataFabricacao}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, dataFabricacao: event.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  autoComplete="off"
                  error={showLotEntryValidation && lotEntryDateConflict}
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-lot-production-date'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Data de validade"
                  type="date"
                  value={lotEntryForm.dataValidade}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, dataValidade: event.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  autoComplete="off"
                  error={showLotEntryValidation && lotEntryDateConflict}
                  helperText={showLotEntryValidation && lotEntryDateConflict ? 'A validade nao pode ficar antes da fabricacao.' : 'Opcional, mas recomendada para rastreabilidade.'}
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-lot-expiration-date'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Custo unitario"
                  value={lotEntryForm.precoCustoUnitario}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, precoCustoUnitario: sanitizePositiveDecimalInput(event.target.value) }))}
                  fullWidth
                  autoComplete="off"
                  helperText={lotEntryCost == null ? 'Opcional. Use o custo real da compra para valorizar o estoque.' : `Valor estimado do lote: ${formatCurrency(lotEntryCost * (lotEntryQuantity ?? 0))}.`}
                  inputProps={{
                    inputMode: 'decimal',
                    autoComplete: 'off',
                    name: 'stock-lot-unit-cost',
                    placeholder: '0,00'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Documento de referencia"
                  value={lotEntryForm.documentoReferencia}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, documentoReferencia: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-lot-document'
                  }}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  label="Observacao"
                  value={lotEntryForm.observacao}
                  onChange={(event) => setLotEntryForm((current) => ({ ...current, observacao: event.target.value }))}
                  fullWidth
                  autoComplete="off"
                  inputProps={{
                    autoComplete: 'off',
                    name: 'stock-lot-notes'
                  }}
                />
              </Grid>
            </Grid>

            {showLotEntryValidation ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                {lotEntryValidationMessage}
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="body2"
            sx={{
              flex: '1 1 320px',
              color: canSubmitLotEntry ? 'success.dark' : 'warning.dark',
              fontWeight: 600
            }}
          >
            {lotEntryActionHint}
          </Typography>
          <Stack direction="row" spacing={1.5}>
          <Button onClick={() => setLotEntryDialogOpen(false)} disabled={registeringLotEntry}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleRegisterLotEntry()} disabled={!canSubmitLotEntry}>
            Confirmar recebimento
          </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function StockProductDetailView({
  product,
  productPosition,
  deposits,
  positionError,
  usingFallbackPosition,
  canEditProduct,
  canViewMovements,
  selectedLots,
  selectedMovements,
  loadingDetails,
  lotsError,
  movementsError,
  onlyLotsWithBalance,
  onToggleOnlyLotsWithBalance,
  onOpenAdjustDialog,
  onOpenReceiptDialog,
  onOpenLotEntryDialog,
  onOpenReservationDialog,
  onOpenShipmentDialog,
  onOpenConferenceDialog,
  onOpenTransferDialog
}: StockProductDetailViewProps) {
  const status = getStockStatus(product);
  const depositBalances = productPosition?.depositos ?? [];
  const lotPhysicalBalance = selectedLots.reduce((total, lot) => total + lot.quantidadeDisponivel, 0);
  const physicalTotal = productPosition?.quantidadeFisicaTotal ?? (product.controlaLote ? lotPhysicalBalance : product.estoqueAtual);
  const reservedTotal = productPosition?.quantidadeReservadaTotal ?? 0;
  const activeDepositCount = depositBalances.length || deposits.length;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>
            {product.nome}
          </Typography>
          <Typography color="text.secondary">
            {product.codigoBarras ?? 'Sem codigo principal'}{product.marca ? ` · ${product.marca}` : ''}
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Chip label={status.label} color={status.color} />
          <Chip label={`${activeDepositCount} deposito(s)`} variant="outlined" />
          <Chip
            label={product.controlaLote ? `Politica ${product.politicaBaixaLote ?? 'FEFO'}` : 'Sem lote'}
            color={product.controlaLote ? 'info' : 'default'}
            variant="outlined"
          />
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4} xl={2}>
          <SummaryBox label="Disponivel ERP" value={formatQuantity(product.estoqueAtual, product.unidadeMedida)} />
        </Grid>
        <Grid item xs={12} md={4} xl={2}>
          <SummaryBox label="Reservado" value={formatQuantity(reservedTotal, product.unidadeMedida)} />
        </Grid>
        <Grid item xs={12} md={4} xl={2}>
          <SummaryBox label="Fisico total" value={formatQuantity(physicalTotal, product.unidadeMedida)} />
        </Grid>
        <Grid item xs={12} md={4} xl={2}>
          <SummaryBox label="Estoque minimo" value={formatQuantity(product.estoqueMinimo, product.unidadeMedida)} />
        </Grid>
        <Grid item xs={12} md={4} xl={2}>
          <SummaryBox label="Preco de custo" value={formatCurrency(product.precoCusto)} />
        </Grid>
        <Grid item xs={12} md={4} xl={2}>
          <SummaryBox
            label="Valor disponivel"
            value={product.controlaEstoque ? formatCurrency(product.estoqueAtual * product.precoCusto) : 'Sem baixa'}
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
        <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.25, flex: 1 }}>
          <Stack spacing={1.25}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Operacao do item
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {buildOperationalDescription(product)}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque || product.controlaLote}
                onClick={onOpenReceiptDialog}
              >
                Receber estoque
              </Button>
              <Button
                variant="outlined"
                startIcon={<EditRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque || product.controlaLote}
                onClick={onOpenAdjustDialog}
              >
                Ajustar saldo
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                disabled={!canEditProduct || !product.controlaLote}
                onClick={onOpenLotEntryDialog}
              >
                Receber lote
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<LocalShippingRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque}
                onClick={onOpenShipmentDialog}
              >
                Expedir
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<AssessmentRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque}
                onClick={onOpenConferenceDialog}
              >
                Conferir
              </Button>
              <Button
                variant="outlined"
                startIcon={<LockRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque}
                onClick={() => onOpenReservationDialog('reserve')}
              >
                Reservar saldo
              </Button>
              <Button
                variant="outlined"
                startIcon={<LockOpenRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque}
                onClick={() => onOpenReservationDialog('release')}
              >
                Liberar reserva
              </Button>
              <Button
                variant="outlined"
                startIcon={<CompareArrowsRoundedIcon />}
                disabled={!canEditProduct || !product.controlaEstoque || product.controlaLote || depositBalances.length < 2}
                onClick={onOpenTransferDialog}
              >
                Transferir
              </Button>
            </Stack>
            {!canEditProduct ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Seu usuario pode consultar o estoque, mas nao possui permissao para editar saldo ou registrar entradas.
              </Alert>
            ) : null}
            {product.controlaEstoque && !product.controlaLote ? (
              <Typography variant="caption" color="text.secondary">
                Fluxo recomendado: receber, armazenar por deposito, reservar quando necessario, expedir e usar ajuste apenas para excecoes.
              </Typography>
            ) : null}
            {product.controlaLote ? (
              <Typography variant="caption" color="text.secondary">
                Produto com rastreabilidade por lote. Recebimento, expedicao e conferencia preservam saldo, validade e ordem tecnica de consumo.
              </Typography>
            ) : null}
            {product.controlaEstoque ? (
              <Typography variant="caption" color="text.secondary">
                O saldo disponivel abastece a venda. Reserva interna separa material, expedicao baixa o fisico e transferencia muda apenas o deposito de origem/destino.
              </Typography>
            ) : null}
            {product.controlaLote ? (
              <Typography variant="caption" color="text.secondary">
                Nesta primeira etapa ERP, a transferencia entre depositos fica liberada apenas para itens sem lote para manter a rastreabilidade limpa.
              </Typography>
            ) : null}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.25, flex: 1 }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <LocalShippingRoundedIcon color="action" />
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Abastecimento
              </Typography>
            </Stack>
            <SupplierBlock
              title="Fornecedor principal"
              supplier={getPrincipalSupplier(product)}
              emptyMessage="Nenhum fornecedor principal vinculado."
            />
            <Divider />
            <SupplierBlock
              title="Melhor preco cadastrado"
              supplier={getBestSupplier(product)}
              emptyMessage="Nenhum fornecedor com preco de compra comparavel."
            />
          </Stack>
        </Paper>
      </Stack>

      {loadingDetails ? (
        <Stack direction="row" spacing={1.25} alignItems="center">
          <CircularProgress size={20} />
          <Typography color="text.secondary">Atualizando detalhe do produto...</Typography>
        </Stack>
      ) : null}

      {positionError ? (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          A posicao ERP detalhada por deposito nao respondeu agora. {positionError}
        </Alert>
      ) : null}

      {usingFallbackPosition ? (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          Mostrando uma posicao estimada a partir do saldo consolidado do produto para nao deixar a operacao cega enquanto o detalhe ERP confirma os depositos.
        </Alert>
      ) : null}

      {product.controlaEstoque ? (
        <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.25 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Mapa por deposito
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Visao profissional do saldo disponivel, reservado e fisico em cada area da operacao.
                </Typography>
              </Box>
              <Chip
                label={`${formatQuantity(product.estoqueAtual, product.unidadeMedida)} disponiveis / ${formatQuantity(reservedTotal, product.unidadeMedida)} reservados`}
                variant="outlined"
              />
            </Stack>

            {depositBalances.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Nenhuma posicao por deposito foi encontrada para este produto ainda.
              </Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Deposito</TableCell>
                      <TableCell align="right">Disponivel</TableCell>
                      <TableCell align="right">Reservado</TableCell>
                      <TableCell align="right">Fisico</TableCell>
                      <TableCell>Perfil</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {depositBalances.map((deposit) => (
                      <TableRow key={deposit.depositoEstoqueId}>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography sx={{ fontWeight: 700 }}>{deposit.depositoNome}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {deposit.depositoCodigo}{deposit.depositoDescricao ? ` · ${deposit.depositoDescricao}` : ''}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{formatQuantity(deposit.quantidadeDisponivel, product.unidadeMedida)}</TableCell>
                        <TableCell align="right">{formatQuantity(deposit.quantidadeReservada, product.unidadeMedida)}</TableCell>
                        <TableCell align="right">{formatQuantity(deposit.quantidadeFisica, product.unidadeMedida)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={deposit.depositoPadrao ? 'primary' : deposit.permiteVendaDireta ? 'success' : 'default'}
                            label={deposit.depositoPadrao ? 'Padrao PDV' : deposit.permiteVendaDireta ? 'Venda direta' : 'Retaguarda'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </Paper>
      ) : null}

      {product.controlaLote ? (
        <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.25 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Lotes e validade
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Visualize saldo por recebimento real e acompanhe a ordem de consumo da operacao.
                </Typography>
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    checked={onlyLotsWithBalance}
                    onChange={(event) => onToggleOnlyLotsWithBalance(event.target.checked)}
                  />
                }
                label="Somente com saldo"
              />
            </Stack>

            {lotsError ? (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {lotsError}
              </Alert>
            ) : selectedLots.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Nenhum lote encontrado para este produto com o filtro atual.
              </Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Lote</TableCell>
                      <TableCell>Entrada</TableCell>
                      <TableCell>Validade</TableCell>
                      <TableCell align="right">Qtd. entrada</TableCell>
                      <TableCell align="right">Saldo</TableCell>
                      <TableCell align="right">Custo</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedLots.map((lot) => (
                      <TableRow key={lot.estoqueLoteId}>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography sx={{ fontWeight: 700 }}>{lot.codigoLote}</Typography>
                            {lot.documentoReferencia ? (
                              <Typography variant="caption" color="text.secondary">
                                Doc.: {lot.documentoReferencia}
                              </Typography>
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{formatDate(lot.dataEntrada)}</TableCell>
                        <TableCell>{formatDate(lot.dataValidade)}</TableCell>
                        <TableCell align="right">{formatQuantity(lot.quantidadeEntrada)}</TableCell>
                        <TableCell align="right">{formatQuantity(lot.quantidadeDisponivel)}</TableCell>
                        <TableCell align="right">{lot.precoCustoUnitario != null ? formatCurrency(lot.precoCustoUnitario) : '-'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={describeLotStatus(lot)}
                            color={lot.vencido ? 'error' : lot.proximoVencimento ? 'warning' : 'success'}
                            variant={lot.quantidadeDisponivel <= 0 ? 'outlined' : 'filled'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </Paper>
      ) : (
        <Alert severity={product.controlaEstoque ? 'info' : 'warning'} sx={{ borderRadius: 3 }}>
          {product.controlaEstoque
            ? 'Este item usa saldo agregado, sem rastreabilidade por lote.'
            : 'Este item nao baixa estoque automaticamente. Se quiser operacao completa, ative o controle no cadastro do produto.'}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.25 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Historico recente
          </Typography>

          {!canViewMovements ? (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Libere a permissao de relatorios para enxergar a trilha completa de movimentacoes deste item.
            </Alert>
          ) : movementsError ? (
            <Alert severity="error" sx={{ borderRadius: 3 }}>
              {movementsError}
            </Alert>
          ) : selectedMovements.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Nenhuma movimentacao encontrada para este produto ainda.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Origem</TableCell>
                    <TableCell>Deposito</TableCell>
                    <TableCell align="right">Quantidade</TableCell>
                    <TableCell align="right">Disponivel apos</TableCell>
                    <TableCell align="right">Reservado apos</TableCell>
                    <TableCell>Responsavel</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedMovements.slice(0, 12).map((movement) => (
                    <TableRow key={movement.movimentacaoEstoqueId}>
                      <TableCell>{formatDateTime(movement.dataMovimentacao)}</TableCell>
                      <TableCell>{formatMovementType(movement.tipo)}</TableCell>
                      <TableCell>{formatMovementOrigin(movement.origem)}</TableCell>
                      <TableCell>{formatMovementLocation(movement)}</TableCell>
                      <TableCell align="right">{formatSignedQuantity(movement.quantidade)}</TableCell>
                      <TableCell align="right">{formatQuantity(movement.estoqueAtual, product.unidadeMedida)}</TableCell>
                      <TableCell align="right">{formatQuantity(movement.estoqueReservadoAtual, product.unidadeMedida)}</TableCell>
                      <TableCell>{movement.usuarioNome ?? 'Usuario nao identificado'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

function MetricCard({
  title,
  value,
  caption,
  tone
}: {
  title: string;
  value: string;
  caption: string;
  tone: 'primary' | 'danger' | 'warning' | 'info' | 'success';
}) {
  const toneStyles = {
    primary: {
      borderColor: 'rgba(18,58,113,0.14)',
      background: 'linear-gradient(180deg, #ffffff, #f3f7fd)',
      accent: '#123a71'
    },
    danger: {
      borderColor: 'rgba(176,32,44,0.14)',
      background: 'linear-gradient(180deg, #ffffff, #fff4f5)',
      accent: '#b0202c'
    },
    warning: {
      borderColor: 'rgba(208,125,39,0.14)',
      background: 'linear-gradient(180deg, #ffffff, #fff7ef)',
      accent: '#d07d27'
    },
    info: {
      borderColor: 'rgba(23,113,147,0.14)',
      background: 'linear-gradient(180deg, #ffffff, #f1fbff)',
      accent: '#177193'
    },
    success: {
      borderColor: 'rgba(46,125,50,0.14)',
      background: 'linear-gradient(180deg, #ffffff, #f4fbf5)',
      accent: '#2e7d32'
    }
  }[tone];

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 4,
        borderColor: toneStyles.borderColor,
        background: toneStyles.background,
        p: 2.25
      }}
    >
      <Stack spacing={0.9}>
        <Typography variant="overline" sx={{ color: toneStyles.accent, fontWeight: 800, letterSpacing: '0.08em' }}>
          {title}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {caption}
        </Typography>
      </Stack>
    </Paper>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3.5, p: 2 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
}

function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, mt: 0.35 }}>{value}</Typography>
    </Paper>
  );
}

function SupplierBlock({
  title,
  supplier,
  emptyMessage
}: {
  title: string;
  supplier: ProdutoFornecedor | null;
  emptyMessage: string;
}) {
  return (
    <Stack spacing={0.6}>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      {supplier ? (
        <>
          <Typography sx={{ fontWeight: 700 }}>{supplier.clienteFornecedorNome}</Typography>
          <Typography variant="body2" color="text.secondary">
            {supplier.precoCompra != null ? `Preco de compra: ${formatCurrency(supplier.precoCompra)}` : 'Preco nao informado'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {supplier.prazoEntregaDias != null ? `Prazo: ${supplier.prazoEntregaDias} dia(s)` : 'Prazo nao informado'}
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      )}
    </Stack>
  );
}

function createEmptyLotEntryForm(): LotEntryFormState {
  return {
    codigoLote: '',
    quantidadeEntrada: '',
    dataEntrada: getTodayInputValue(),
    dataFabricacao: '',
    dataValidade: '',
    precoCustoUnitario: '',
    documentoReferencia: '',
    observacao: ''
  };
}

function createEmptyReceiptForm(): ReceiptFormState {
  return {
    depositoEstoqueId: '',
    quantidadeEntrada: '',
    precoCustoUnitario: '',
    documentoReferencia: '',
    observacao: ''
  };
}

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeProduct(product: Produto): Produto {
  return {
    ...product,
    controlaLote: product.controlaLote ?? false,
    politicaBaixaLote: product.politicaBaixaLote ?? 'FEFO',
    fornecedores: product.fornecedores ?? [],
    codigos: product.codigos ?? [],
    camposCustomizados: product.camposCustomizados ?? []
  };
}

function normalizeSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNullableDate(value: string) {
  return value.trim() ? value : null;
}

function parseQuantityInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const compact = value.trim().replace(/\s+/g, '');
  if (!/[0-9]/.test(compact)) {
    return null;
  }

  const commaIndex = compact.lastIndexOf(',');
  const dotIndex = compact.lastIndexOf('.');
  let normalized = compact;

  if (commaIndex >= 0 && dotIndex >= 0) {
    normalized = commaIndex > dotIndex
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(/,/g, '');
  } else if (commaIndex >= 0) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizePositiveDecimalInput(value: string) {
  const stripped = value.replace(/[^0-9,.\s]/g, '').replace(/\s+/g, '');
  const firstSeparatorIndex = stripped.search(/[.,]/);
  if (firstSeparatorIndex < 0) {
    return stripped;
  }

  const integerPart = stripped.slice(0, firstSeparatorIndex).replace(/[.,]/g, '');
  const separator = stripped[firstSeparatorIndex];
  const decimalPart = stripped.slice(firstSeparatorIndex + 1).replace(/[.,]/g, '');
  return `${integerPart}${separator}${decimalPart}`;
}

function formatEditableQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return '';
  }

  return value.toLocaleString('pt-BR', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function normalizeDepositRequestId(value: string) {
  return !value || value.startsWith('__fallback-') ? null : value;
}

function getPreferredDepositId(deposits: EstoqueDepositoSaldo[] | undefined) {
  if (!deposits || deposits.length === 0) {
    return '';
  }

  return deposits.find((item) => item.depositoPadrao)?.depositoEstoqueId
    ?? deposits[0].depositoEstoqueId;
}

function findDepositBalance(deposits: EstoqueDepositoSaldo[] | undefined, depositoEstoqueId: string) {
  if (!deposits || !depositoEstoqueId) {
    return null;
  }

  return deposits.find((item) => item.depositoEstoqueId === depositoEstoqueId) ?? null;
}

function buildResolvedProductPosition(
  product: Produto,
  explicitPosition: PosicaoEstoqueProduto | null,
  deposits: DepositoEstoqueResumo[]
): PosicaoEstoqueProduto | null {
  if (explicitPosition) {
    return explicitPosition;
  }

  if (!product.controlaEstoque) {
    return null;
  }

  const sourceDeposits = deposits.length > 0
    ? deposits
    : [{
        depositoEstoqueId: '__fallback-loja-01',
        codigo: 'LOJA-01',
        nome: 'Operacao PDV',
        descricao: 'Posicao estimada enquanto a API ERP detalhada nao responde.',
        padrao: true,
        permiteVendaDireta: true,
        ativo: true,
        totalSkus: 0,
        quantidadeDisponivelTotal: 0,
        quantidadeReservadaTotal: 0,
        quantidadeFisicaTotal: 0,
        valorDisponivelCusto: 0,
        valorReservadoCusto: 0
      } satisfies DepositoEstoqueResumo];

  const mappedDeposits = sourceDeposits.map((deposit, index) => {
    const quantidadeDisponivel = index === 0 ? product.estoqueAtual : 0;
    return {
      estoqueDepositoId: null,
      depositoEstoqueId: deposit.depositoEstoqueId,
      depositoCodigo: deposit.codigo,
      depositoNome: deposit.nome,
      depositoDescricao: deposit.descricao,
      depositoPadrao: deposit.padrao || index === 0,
      permiteVendaDireta: deposit.permiteVendaDireta || index === 0,
      quantidadeDisponivel,
      quantidadeReservada: 0,
      quantidadeFisica: quantidadeDisponivel
    } satisfies EstoqueDepositoSaldo;
  });

  return {
    produtoId: product.produtoId,
    produtoNome: product.nome,
    unidadeMedida: product.unidadeMedida,
    quantidadeDisponivelTotal: product.estoqueAtual,
    quantidadeReservadaTotal: 0,
    quantidadeFisicaTotal: product.estoqueAtual,
    depositos: mappedDeposits
  };
}

function matchesProductSearch(product: Produto, query: string) {
  if (!query) {
    return true;
  }

  const supplierNames = product.fornecedores
    .filter((item) => item.ativo)
    .map((item) => item.clienteFornecedorNome);

  return [
    product.nome,
    product.codigoBarras,
    product.marca,
    product.descricao,
    product.codigoProdutoFornecedor,
    ...supplierNames
  ]
    .filter((item): item is string => Boolean(item))
    .some((item) => normalizeSearchTerm(item).includes(query));
}

function matchesStatusFilter(product: Produto, filter: InventoryStatusFilter) {
  switch (filter) {
    case 'saudavel':
      return product.ativo && product.controlaEstoque && product.estoqueAtual > product.estoqueMinimo;
    case 'baixo':
      return product.ativo && product.controlaEstoque && product.estoqueBaixo && product.estoqueAtual > 0;
    case 'semEstoque':
      return product.ativo && product.controlaEstoque && product.estoqueAtual <= 0;
    case 'semBaixa':
      return product.ativo && !product.controlaEstoque;
    case 'inativo':
      return !product.ativo;
    default:
      return true;
  }
}

function matchesControlFilter(product: Produto, filter: InventoryControlFilter) {
  switch (filter) {
    case 'controlado':
      return product.controlaEstoque;
    case 'lote':
      return product.controlaLote;
    case 'livre':
      return !product.controlaEstoque;
    default:
      return true;
  }
}

function matchesActiveFilter(product: Produto, filter: InventoryActiveFilter) {
  switch (filter) {
    case 'ativos':
      return product.ativo;
    case 'inativos':
      return !product.ativo;
    default:
      return true;
  }
}

function sortProductsForInventory(products: Produto[]) {
  return [...products].sort((left, right) => {
    const leftRank = getProductPriorityRank(left);
    const rightRank = getProductPriorityRank(right);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.nome.localeCompare(right.nome, 'pt-BR');
  });
}

function buildCriticalProducts(products: Produto[]) {
  return [...products]
    .filter((item) => item.controlaEstoque && (item.estoqueAtual <= 0 || item.estoqueBaixo))
    .sort((left, right) => {
      if (left.estoqueAtual <= 0 && right.estoqueAtual > 0) {
        return -1;
      }

      if (right.estoqueAtual <= 0 && left.estoqueAtual > 0) {
        return 1;
      }

      const leftGap = left.estoqueMinimo - left.estoqueAtual;
      const rightGap = right.estoqueMinimo - right.estoqueAtual;
      return rightGap - leftGap;
    })
    .slice(0, 6);
}

function getProductPriorityRank(product: Produto) {
  if (!product.ativo) {
    return 5;
  }

  if (!product.controlaEstoque) {
    return 4;
  }

  if (product.estoqueAtual <= 0) {
    return 0;
  }

  if (product.estoqueBaixo) {
    return 1;
  }

  if (product.controlaLote) {
    return 2;
  }

  return 3;
}

function getStockStatus(product: Produto): { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' } {
  if (!product.ativo) {
    return { label: 'Inativo', color: 'default' };
  }

  if (!product.controlaEstoque) {
    return { label: 'Sem baixa', color: 'info' };
  }

  if (product.estoqueAtual <= 0) {
    return { label: 'Ruptura', color: 'error' };
  }

  if (product.estoqueBaixo) {
    return { label: 'Baixo', color: 'warning' };
  }

  return { label: 'Saudavel', color: 'success' };
}

function getPrincipalSupplier(product: Produto) {
  return product.fornecedores.find((item) => item.ativo && item.fornecedorPrincipal)
    ?? product.fornecedores.find((item) => item.ativo)
    ?? null;
}

function getBestSupplier(product: Produto) {
  return [...product.fornecedores]
    .filter((item) => item.ativo && item.precoCompra != null)
    .sort((left, right) => (left.precoCompra ?? Number.MAX_SAFE_INTEGER) - (right.precoCompra ?? Number.MAX_SAFE_INTEGER))[0]
    ?? null;
}

function buildOperationalDescription(product: Produto) {
  if (!product.ativo) {
    return 'Produto fora de operacao. O historico continua preservado, mas o item nao abastece a venda ate ser reativado.';
  }

  if (!product.controlaEstoque) {
    return 'Item configurado como estoque livre. Ele aparece no PDV, mas nao sofre baixa automatica nem gera alerta de ruptura.';
  }

  if (product.controlaLote) {
    return 'Item com rastreabilidade profissional por lote. Recebimento, armazenagem, expedicao, conferencia e validade caminham juntos.';
  }

  return 'Item com saldo agregado por deposito e baixa automatica nas vendas. Pode operar recebimento, reserva, expedicao, conferencia e transferencia sem rastreabilidade por lote.';
}

function formatQuantity(value: number, unidadeMedida?: string | null) {
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(Number.isFinite(value) ? value : 0);

  return unidadeMedida ? `${formatted} ${unidadeMedida}` : formatted;
}

function formatSignedQuantity(value: number) {
  const signal = value > 0 ? '+' : '';
  return `${signal}${formatQuantity(value)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
}

function describeLotStatus(lot: EstoqueLote) {
  if (lot.quantidadeDisponivel <= 0) {
    return 'Sem saldo';
  }

  if (lot.vencido) {
    return 'Vencido';
  }

  if (lot.proximoVencimento) {
    return 'Vence em breve';
  }

  return 'Disponivel';
}

function describeLotAlert(alert: EstoqueLoteAlerta) {
  if (alert.vencido) {
    return 'Vencido';
  }

  if (alert.diasParaVencer <= 0) {
    return 'Vence hoje';
  }

  return `${alert.diasParaVencer} dia(s)`;
}

function formatMovementType(value: MovimentacaoEstoque['tipo']) {
  switch (value) {
    case 'Entrada':
      return 'Entrada';
    case 'Saida':
      return 'Saida';
    case 'Ajuste':
      return 'Ajuste';
    case 'CancelamentoVenda':
      return 'Retorno';
    case 'Reserva':
      return 'Reserva';
    case 'LiberacaoReserva':
      return 'Liberacao';
    case 'Transferencia':
      return 'Transferencia';
    default:
      return value;
  }
}

function formatMovementOrigin(value: MovimentacaoEstoque['origem']) {
  switch (value) {
    case 'Venda':
      return 'Venda';
    case 'Compra':
      return 'Compra';
    case 'AjusteManual':
      return 'Ajuste manual';
    case 'Cancelamento':
      return 'Cancelamento';
    case 'ReservaManual':
      return 'Reserva manual';
    case 'TransferenciaInterna':
      return 'Transferencia interna';
    default:
      return value;
  }
}

function formatMovementLocation(movement: MovimentacaoEstoque) {
  if (movement.depositoOrigemNome && movement.depositoDestinoNome) {
    return `${movement.depositoOrigemNome} -> ${movement.depositoDestinoNome}`;
  }

  if (movement.depositoNome) {
    return movement.depositoNome;
  }

  if (movement.observacao) {
    return movement.observacao;
  }

  return '-';
}

const heroChipSx = {
  color: '#f8fbff',
  borderColor: 'rgba(248,251,255,0.2)',
  bgcolor: 'rgba(255,255,255,0.08)'
};
