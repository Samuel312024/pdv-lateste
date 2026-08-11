import PaymentRoundedIcon from '@mui/icons-material/PaymentRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CashierAccessPanel } from '../components/cashier/CashierAccessPanel';
import { Loading } from '../components/common/Loading';
import { ManagerOverrideDialog } from '../components/common/ManagerOverrideDialog';
import { PaymentModal } from '../components/pdv/PaymentModal';
import { PdvTouchKeyboard, type PdvTouchShortcutAction } from '../components/pdv/PdvTouchKeyboard';
import { ProductThumbnail } from '../components/pdv/ProductThumbnail';
import { ProductSearch } from '../components/pdv/ProductSearch';
import { SaleItemsTable, type SaleItem } from '../components/pdv/SaleItemsTable';
import { ScannerActionBar } from '../components/scanner/ScannerActionBar';
import { useAuth } from '../contexts/AuthContext';
import { useScanner } from '../hooks/useScanner';
import { cashService } from '../services/cashService';
import { clientService } from '../services/clientService';
import { productService } from '../services/productService';
import { saleService } from '../services/saleService';
import type { Cliente, FinalizarVendaPagamentoRequest, FormaPagamento, LiberacaoGerentePayload, Produto } from '../types';
import { hasCashierAccess } from '../utils/cashierAccess';
import { openDetachedDialogWindow, removeDetachedDialogSession, writeDetachedDialogSession } from '../utils/detachedDialogSession';
import { formatCurrency } from '../utils/format';
import { canAccessClientsFeature } from '../utils/featureAccess';
import { getErrorMessage } from '../utils/http';
import {
  getPdvTouchKeyboardChannelName,
  type PdvTouchKeyboardBridgeMessage,
  type PdvTouchKeyboardDetachedSessionPayload,
  type PdvTouchKeyboardRemoteState
} from '../utils/pdvTouchKeyboardBridge';
import { printSaleReceipt } from '../utils/receiptPrinter';
import { readTerminalActivationState } from '../utils/terminalActivation';
import {
  getTerminalKeyboardLabel,
  getTerminalPrinterLabel,
  getTerminalScannerLabel,
  resolveReceiptPaperWidth
} from '../utils/terminalPeripheralProfiles';

interface PendingManagerSaleApproval {
  payments: FinalizarVendaPagamentoRequest[];
  emitirNfe: boolean;
}

interface TouchKeyboardStatus {
  primary: string;
  secondary: string;
}

type TouchKeyboardPlacement = 'bottom' | 'floating';

interface FloatingTouchKeyboardPosition {
  x: number;
  y: number;
}

const TOUCH_KEYBOARD_PLACEMENT_STORAGE_KEY = 'pdv:touch-keyboard:placement';
const TOUCH_KEYBOARD_POSITION_STORAGE_KEY = 'pdv:touch-keyboard:floating-position';
const FLOATING_TOUCH_KEYBOARD_MARGIN = 16;

export function PdvPage() {
  const [loading, setLoading] = useState(true);
  const [cashierOpen, setCashierOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [items, setItems] = useState<SaleItem[]>([]);
  const [lastResolvedCode, setLastResolvedCode] = useState<string | null>(null);
  const [lastResolvedProduct, setLastResolvedProduct] = useState<Produto | null>(null);
  const [recentEntries, setRecentEntries] = useState<Array<{ produtoId: string; nome: string; imagemUrl: string | null; momento: number }>>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [selectedClientAutoLinked, setSelectedClientAutoLinked] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingManagerApproval, setPendingManagerApproval] = useState<PendingManagerSaleApproval | null>(null);
  const [touchKeyboardStatus, setTouchKeyboardStatus] = useState<TouchKeyboardStatus | null>(null);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<FormaPagamento>('Dinheiro');
  const [touchKeyboardPlacement, setTouchKeyboardPlacement] = useState<TouchKeyboardPlacement>(() => readTouchKeyboardPlacement());
  const [touchKeyboardFloatingPosition, setTouchKeyboardFloatingPosition] = useState<FloatingTouchKeyboardPosition>(() => readTouchKeyboardPosition());
  const [detachedTouchKeyboardSessionKey, setDetachedTouchKeyboardSessionKey] = useState<string | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const clientInputRef = useRef<HTMLInputElement | null>(null);
  const clientFieldSectionRef = useRef<HTMLDivElement | null>(null);
  const floatingTouchKeyboardRef = useRef<HTMLDivElement | null>(null);
  const detachedTouchKeyboardWindowRef = useRef<Window | null>(null);
  const detachedTouchKeyboardChannelRef = useRef<BroadcastChannel | null>(null);
  const detachedTouchKeyboardWindowWatchRef = useRef<number | null>(null);
  const detachedTouchKeyboardSessionKeyRef = useRef<string | null>(null);
  const touchKeyboardRemoteStateRef = useRef<PdvTouchKeyboardRemoteState | null>(null);
  const touchKeyboardCommandHandlersRef = useRef<{
    appendDigit: (fragment: string) => void;
    backspace: () => void;
    clear: () => void;
    confirm: () => void;
    shortcut: (action: PdvTouchShortcutAction) => void;
    closeDetached: () => void;
  } | null>(null);
  const floatingTouchKeyboardDragRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const barcodeQueueRef = useRef<string[]>([]);
  const barcodeProcessingRef = useRef(false);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, session } = useAuth();
  const navigate = useNavigate();
  const canUseClientDirectory = canAccessClientsFeature(session);
  const accessGranted = hasCashierAccess(session);
  const terminalActivation = useMemo(() => readTerminalActivationState(), []);
  const terminalPrinterProfile = terminalActivation?.perfilImpressora ?? 'TERMICA_80MM';
  const terminalScannerProfile = terminalActivation?.perfilScanner ?? 'HIBRIDO';
  const terminalKeyboardProfile = terminalActivation?.perfilTeclado ?? 'PADRAO_PDV';
  const autoPrintEnabled = terminalActivation?.impressaoAutomatica ?? true;

  const clampFloatingTouchKeyboardPosition = useCallback((position: FloatingTouchKeyboardPosition) => {
    if (typeof window === 'undefined') {
      return position;
    }

    const width = floatingTouchKeyboardRef.current?.offsetWidth ?? 980;
    const height = floatingTouchKeyboardRef.current?.offsetHeight ?? 720;
    const maxX = Math.max(FLOATING_TOUCH_KEYBOARD_MARGIN, window.innerWidth - width - FLOATING_TOUCH_KEYBOARD_MARGIN);
    const maxY = Math.max(FLOATING_TOUCH_KEYBOARD_MARGIN, window.innerHeight - height - FLOATING_TOUCH_KEYBOARD_MARGIN);

    return {
      x: Math.min(Math.max(FLOATING_TOUCH_KEYBOARD_MARGIN, position.x), maxX),
      y: Math.min(Math.max(FLOATING_TOUCH_KEYBOARD_MARGIN, position.y), maxY)
    };
  }, []);

  const resetFloatingTouchKeyboardPosition = useCallback(() => {
    setTouchKeyboardFloatingPosition(clampFloatingTouchKeyboardPosition(getDefaultTouchKeyboardPosition()));
  }, [clampFloatingTouchKeyboardPosition]);

  function focusBarcodeField() {
    requestAnimationFrame(() => {
      barcodeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      barcodeInputRef.current?.focus();
      barcodeInputRef.current?.select();
    });
  }

  function focusProductSearchField() {
    requestAnimationFrame(() => {
      productSearchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      productSearchInputRef.current?.focus();
      productSearchInputRef.current?.select();
    });
  }

  function focusClientField() {
    requestAnimationFrame(() => {
      clientFieldSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setClientPickerOpen(true);
      window.setTimeout(() => {
        clientInputRef.current?.focus();
        clientInputRef.current?.select();
      }, 160);
    });
  }

  function setTouchStatus(primary: string, secondary: string) {
    setTouchKeyboardStatus({ primary, secondary });
  }

  function handleFloatingTouchKeyboardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (touchKeyboardPlacement !== 'floating' || event.button !== 0) {
      return;
    }

    floatingTouchKeyboardDragRef.current = {
      pointerId: event.pointerId,
      originX: touchKeyboardFloatingPosition.x,
      originY: touchKeyboardFloatingPosition.y,
      startX: event.clientX,
      startY: event.clientY
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleFloatingTouchKeyboardPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = floatingTouchKeyboardDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setTouchKeyboardFloatingPosition(
      clampFloatingTouchKeyboardPosition({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY)
      })
    );
  }

  function releaseFloatingTouchKeyboardDrag(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = floatingTouchKeyboardDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    floatingTouchKeyboardDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function closeDetachedTouchKeyboardWindow() {
    if (detachedTouchKeyboardWindowWatchRef.current !== null) {
      window.clearInterval(detachedTouchKeyboardWindowWatchRef.current);
      detachedTouchKeyboardWindowWatchRef.current = null;
    }

    detachedTouchKeyboardChannelRef.current?.close();
    detachedTouchKeyboardChannelRef.current = null;

    if (detachedTouchKeyboardWindowRef.current && !detachedTouchKeyboardWindowRef.current.closed) {
      detachedTouchKeyboardWindowRef.current.close();
    }

    detachedTouchKeyboardWindowRef.current = null;
    removeDetachedDialogSession(detachedTouchKeyboardSessionKeyRef.current);
    setDetachedTouchKeyboardSessionKey(null);
  }

  function openDetachedTouchKeyboardWindow(remoteState: PdvTouchKeyboardRemoteState) {
    if (detachedTouchKeyboardWindowRef.current && !detachedTouchKeyboardWindowRef.current.closed) {
      detachedTouchKeyboardWindowRef.current.close();
    }

    if (detachedTouchKeyboardSessionKeyRef.current) {
      removeDetachedDialogSession(detachedTouchKeyboardSessionKeyRef.current);
    }

    const sessionKey = writeDetachedDialogSession<PdvTouchKeyboardDetachedSessionPayload>({ state: remoteState });
    const popup = openDetachedDialogWindow('/pdv-touch', sessionKey, 'lg');

    if (!popup) {
      removeDetachedDialogSession(sessionKey);
      enqueueSnackbar('O navegador bloqueou a nova janela. Libere pop-ups para abrir o teclado no outro monitor.', { variant: 'warning' });
      return;
    }

    detachedTouchKeyboardWindowRef.current = popup;
    setDetachedTouchKeyboardSessionKey(sessionKey);
    setTouchStatus('Teclado destacado', 'Janela pronta para arrastar ao outro monitor');

    if (detachedTouchKeyboardWindowWatchRef.current !== null) {
      window.clearInterval(detachedTouchKeyboardWindowWatchRef.current);
    }

    detachedTouchKeyboardWindowWatchRef.current = window.setInterval(() => {
      if (!detachedTouchKeyboardWindowRef.current || detachedTouchKeyboardWindowRef.current.closed) {
        closeDetachedTouchKeyboardWindow();
      }
    }, 1200);
  }

  useEffect(() => {
    if (!accessGranted) {
      setLoading(false);
      setCashierOpen(false);
      return;
    }

    async function bootstrap() {
      setLoading(true);
      const [cashierResult, clientsResult] = await Promise.allSettled([
        cashService.getOpen(),
        canUseClientDirectory ? clientService.list() : Promise.resolve([] as Cliente[])
      ]);

      if (cashierResult.status === 'fulfilled') {
        setCashierOpen(Boolean(cashierResult.value));
      } else {
        enqueueSnackbar(getErrorMessage(cashierResult.reason), { variant: 'error' });
      }

      if (clientsResult.status === 'fulfilled') {
        const activeClients = clientsResult.value
          .filter((client) => client.ativo)
          .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));

        setClients(activeClients);
      } else {
        enqueueSnackbar('Nao foi possivel carregar a base de clientes para vincular a venda.', { variant: 'warning' });
      }

      setLoading(false);
    }

    void bootstrap();
  }, [accessGranted, canUseClientDirectory, enqueueSnackbar, session?.usuario.usuarioId]);

  useEffect(() => {
    if (cashierOpen) {
      barcodeInputRef.current?.focus();
    }
  }, [cashierOpen]);

  useEffect(() => {
    detachedTouchKeyboardSessionKeyRef.current = detachedTouchKeyboardSessionKey;
  }, [detachedTouchKeyboardSessionKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TOUCH_KEYBOARD_PLACEMENT_STORAGE_KEY, touchKeyboardPlacement);
  }, [touchKeyboardPlacement]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TOUCH_KEYBOARD_POSITION_STORAGE_KEY, JSON.stringify(touchKeyboardFloatingPosition));
  }, [touchKeyboardFloatingPosition]);

  useEffect(() => {
    if (touchKeyboardPlacement !== 'floating') {
      return;
    }

    const clampPosition = () => {
      setTouchKeyboardFloatingPosition((current) => clampFloatingTouchKeyboardPosition(current));
    };

    clampPosition();
    window.addEventListener('resize', clampPosition);
    return () => window.removeEventListener('resize', clampPosition);
  }, [clampFloatingTouchKeyboardPosition, touchKeyboardPlacement]);

  useEffect(() => () => {
    if (detachedTouchKeyboardWindowWatchRef.current !== null) {
      window.clearInterval(detachedTouchKeyboardWindowWatchRef.current);
    }

    detachedTouchKeyboardChannelRef.current?.close();
  }, []);

  useEffect(() => {
    if (terminalKeyboardProfile !== 'PADRAO_PDV') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey) {
        return;
      }

      const allowWhileEditing = event.key === 'Escape';
      if (!allowWhileEditing && isEditableElement(event.target)) {
        return;
      }

      const key = event.key.toUpperCase();
      const shortcutAction = resolvePdvKeyboardShortcut(key);
      if (!shortcutAction) {
        return;
      }

      event.preventDefault();
      handleTouchShortcut(shortcutAction);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTouchShortcut, terminalKeyboardProfile]);

  const addProduct = useCallback((product: Produto, sourceCode?: string) => {
    if (!product.ativo) {
      enqueueSnackbar('Produto inativo nao pode ser vendido.', { variant: 'error' });
      return;
    }

    setItems((current) => {
      const existing = current.find((item) => item.produtoId === product.produtoId);
      if (existing) {
        const nextQuantity = existing.quantidade + 1;
        if (existing.controlaEstoque && nextQuantity > existing.estoqueAtual) {
          enqueueSnackbar(`Estoque insuficiente para ${existing.nome}.`, { variant: 'warning' });
          return current;
        }

        return current.map((item) =>
          item.produtoId === product.produtoId ? { ...item, quantidade: nextQuantity } : item
        );
      }

      if (product.controlaEstoque && product.estoqueAtual <= 0) {
        enqueueSnackbar(`Produto ${product.nome} sem estoque.`, { variant: 'warning' });
        return current;
      }

      return [
        ...current,
        {
          produtoId: product.produtoId,
          nome: product.nome,
          imagemUrl: product.imagemUrl,
          quantidade: 1,
          valorUnitario: product.precoVenda,
          desconto: 0,
          estoqueAtual: product.estoqueAtual,
          controlaEstoque: product.controlaEstoque
        }
      ];
    });

    setLastResolvedCode(sourceCode ?? product.codigoBarras ?? null);
    setLastResolvedProduct(product);
    setRecentEntries((current) => [
      { produtoId: product.produtoId, nome: product.nome, imagemUrl: product.imagemUrl, momento: Date.now() },
      ...current.filter((item) => item.produtoId !== product.produtoId)
    ].slice(0, 4));
    setTouchStatus(`${product.nome} adicionado`, sourceCode ? `Codigo ${sourceCode}` : 'Item pronto na venda');
    if (canUseClientDirectory && !selectedClient && product.clienteFornecedorId) {
      const linkedClient = clients.find((client) => client.clienteId === product.clienteFornecedorId) ?? null;
      if (linkedClient) {
        setSelectedClient(linkedClient);
        setSelectedClientAutoLinked(true);
        enqueueSnackbar(`Cliente ${linkedClient.nome} vinculado automaticamente pelo item lido.`, { variant: 'info' });
      }
    }

    focusBarcodeField();
  }, [canUseClientDirectory, clients, enqueueSnackbar, selectedClient]);

  const resolveBarcode = useCallback(async (code: string) => {
    try {
      const normalizedCode = normalizeScannedBarcode(code);
      if (!normalizedCode) {
        return;
      }

      setLastResolvedCode(normalizedCode);
      const product = await productService.getByBarcode(normalizedCode);
      addProduct(product, normalizedCode);
      setBarcode('');
    } catch (error) {
      setTouchStatus('Codigo nao localizado', normalizeScannedBarcode(code) || 'Leia ou digite novamente');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      focusBarcodeField();
    }
  }, [addProduct, enqueueSnackbar]);

  const processBarcodeQueue = useCallback(async () => {
    if (barcodeProcessingRef.current) {
      return;
    }

    barcodeProcessingRef.current = true;
    try {
      while (barcodeQueueRef.current.length > 0) {
        const nextCode = barcodeQueueRef.current.shift();
        if (!nextCode) {
          continue;
        }

        await resolveBarcode(nextCode);
      }
    } finally {
      barcodeProcessingRef.current = false;
    }
  }, [resolveBarcode]);

  const enqueueBarcodeResolution = useCallback((code: string) => {
    const normalizedCode = normalizeScannedBarcode(code);
    if (!normalizedCode) {
      return;
    }

    barcodeQueueRef.current.push(normalizedCode);
    setBarcode('');
    setLastResolvedCode(normalizedCode);
    void processBarcodeQueue();
  }, [processBarcodeQueue]);

  useScanner(
    async (event) => {
      enqueueBarcodeResolution(event.codigoBarras);
    },
    { enabled: cashierOpen }
  );

  async function handleBarcodeSearch(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    submitCurrentBarcode(event.currentTarget.value);
  }

  function submitCurrentBarcode(typedCode = barcode) {
    if (!typedCode.trim()) {
      setTouchStatus('Nenhum codigo informado', 'Digite ou leia um item primeiro');
      focusBarcodeField();
      return;
    }

    enqueueBarcodeResolution(typedCode);
  }

  function appendTouchBarcode(fragment: string) {
    setBarcode((current) => `${current}${fragment}`);
    setTouchKeyboardStatus(null);
    focusBarcodeField();
  }

  function backspaceTouchBarcode() {
    setBarcode((current) => current.slice(0, -1));
    focusBarcodeField();
  }

  function clearTouchBarcode() {
    setBarcode('');
    setTouchStatus('Leitura cancelada', 'Digite um novo codigo');
    focusBarcodeField();
  }

  function openPaymentPanel(paymentMethod: FormaPagamento = 'Dinheiro') {
    if (items.length === 0 || total <= 0) {
      enqueueSnackbar('Adicione itens antes de abrir o pagamento.', { variant: 'warning' });
      setTouchStatus('Venda sem itens', 'Leia produtos antes de pagar');
      return;
    }

    setPreferredPaymentMethod(paymentMethod);
    setPaymentOpen(true);
    setTouchStatus('Pagamento aberto', `Metodo inicial ${formatPaymentMethodForTouch(paymentMethod)}`);
  }

  function setConsumerFinal() {
    setSelectedClient(null);
    setSelectedClientAutoLinked(false);
    setTouchStatus('Consumidor final', 'Cliente removido da venda');
  }

  function decrementLastSaleItem() {
    const lastItem = items[items.length - 1];
    if (!lastItem) {
      setTouchStatus('Venda vazia', 'Nenhum item para ajustar');
      return;
    }

    if (lastItem.quantidade <= 1) {
      setItems((current) => current.filter((item) => item.produtoId !== lastItem.produtoId));
      setTouchStatus('Ultimo item removido', lastItem.nome);
      return;
    }

    updateQuantity(lastItem.produtoId, Number((lastItem.quantidade - 1).toFixed(3)));
    setTouchStatus('Quantidade reduzida', `${lastItem.nome} - 1 unidade`);
  }

  function removeLastSaleItem() {
    const lastItem = items[items.length - 1];
    if (!lastItem) {
      setTouchStatus('Venda vazia', 'Nenhum item para remover');
      return;
    }

    setItems((current) => current.filter((item) => item.produtoId !== lastItem.produtoId));
    setTouchStatus('Item removido', lastItem.nome);
  }

  function clearCurrentSale() {
    if (items.length === 0 && !selectedClient) {
      setTouchStatus('Nada para limpar', 'Venda ja esta vazia');
      return;
    }

    setItems([]);
    setSelectedClient(null);
    setSelectedClientAutoLinked(false);
    setRecentEntries([]);
    setLastResolvedCode(null);
    setLastResolvedProduct(null);
    setBarcode('');
    setTouchStatus('Venda limpa', 'Pronto para uma nova operacao');
    focusBarcodeField();
  }

  function handleTouchShortcut(action: PdvTouchShortcutAction) {
    switch (action) {
      case 'focusBarcode':
        setTouchStatus('Digitacao manual', 'Campo de codigo em foco');
        focusBarcodeField();
        return;
      case 'focusProductSearch':
        setTouchStatus('Busca de produtos', 'Digite nome ou codigo do item');
        focusProductSearchField();
        return;
      case 'focusClient':
        if (!canUseClientDirectory) {
          enqueueSnackbar('A base de clientes nao esta liberada para este operador.', { variant: 'info' });
          setTouchStatus('Cliente indisponivel', 'Sem acesso ao cadastro');
          return;
        }

        setTouchStatus('Cliente da venda', 'Campo de cliente em foco');
        focusClientField();
        return;
      case 'openCashier':
        setTouchStatus('Modulo de caixa', 'Abrindo tela de caixa');
        navigate('/caixa');
        return;
      case 'supply':
        setTouchStatus('Suprimento', 'Abrindo operacoes do caixa');
        navigate('/caixa');
        return;
      case 'withdrawal':
        setTouchStatus('Sangria', 'Abrindo operacoes do caixa');
        navigate('/caixa');
        return;
      case 'priceCheck':
        setTouchStatus('Consulta de preco', 'Abrindo modulo dedicado');
        navigate('/consulta-preco');
        return;
      case 'operatorShift':
        setTouchStatus('Troca de operador', 'Voltando para acesso do caixa');
        navigate('/acesso-caixa');
        return;
      case 'paymentCash':
        openPaymentPanel('Dinheiro');
        return;
      case 'paymentPix':
        openPaymentPanel('Pix');
        return;
      case 'paymentDebit':
        openPaymentPanel('CartaoDebito');
        return;
      case 'paymentCredit':
        openPaymentPanel('CartaoCredito');
        return;
      case 'paymentVoucher':
        openPaymentPanel('Voucher');
        return;
      case 'paymentOther':
        openPaymentPanel('Pix');
        return;
      case 'setConsumerFinal':
        setConsumerFinal();
        return;
      case 'finalizeSale':
        openPaymentPanel('Dinheiro');
        return;
      case 'decrementLastItem':
        decrementLastSaleItem();
        return;
      case 'removeLastItem':
        removeLastSaleItem();
        return;
      case 'clearSale':
        clearCurrentSale();
        return;
      case 'cancel':
        clearTouchBarcode();
        return;
      default:
        return;
    }
  }

  function updateQuantity(produtoId: string, quantidade: number) {
    setItems((current) =>
      current.map((item) => {
        if (item.produtoId !== produtoId) {
          return item;
        }

        const safeQuantity = quantidade <= 0 ? 1 : quantidade;
        if (item.controlaEstoque && safeQuantity > item.estoqueAtual) {
          enqueueSnackbar(`Quantidade maior que o estoque disponivel para ${item.nome}.`, { variant: 'warning' });
          return item;
        }

        return { ...item, quantidade: safeQuantity };
      })
    );
  }

  function updateDiscount(produtoId: string, desconto: number) {
    setItems((current) =>
      current.map((item) => {
        if (item.produtoId !== produtoId) {
          return item;
        }

        const maxDiscount = item.quantidade * item.valorUnitario;
        return { ...item, desconto: desconto < 0 ? 0 : Math.min(desconto, maxDiscount) };
      })
    );
  }

  async function submitSale(
    payments: FinalizarVendaPagamentoRequest[],
    emitirNfe: boolean,
    liberacoesGerenciais: LiberacaoGerentePayload[] = []
  ) {
    if (items.length === 0) {
      enqueueSnackbar('Adicione pelo menos um item antes de finalizar.', { variant: 'warning' });
      return false;
    }

    setSubmitting(true);
    try {
      const result = await saleService.finalize({
        clienteId: selectedClient?.clienteId ?? null,
        itens: items.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          desconto: item.desconto
        })),
        pagamentos: payments,
        emitirNfe,
        pedido: null,
        liberacoesGerenciais
      });

      const noteMessage = result.notaFiscalReferencia
        ? result.notaFiscalProntaParaTransmissao
          ? ` NF-e ${result.notaFiscalReferencia} pronta para transmissao interna.`
          : ` NF-e ${result.notaFiscalReferencia} gerada em rascunho com ${result.notaFiscalPendencias?.length ?? 0} pendencia(s).`
        : '';

      enqueueSnackbar(`Venda ${result.numeroVenda} finalizada. Troco: ${formatCurrency(result.troco)}.${noteMessage}`, {
        variant: result.notaFiscalReferencia && !result.notaFiscalProntaParaTransmissao ? 'warning' : 'success'
      });

      if (autoPrintEnabled) {
        try {
          const sale = await saleService.getById(result.vendaId);
          printSaleReceipt(sale, session, { paperWidth: resolveReceiptPaperWidth(terminalPrinterProfile) });
        } catch (error) {
          enqueueSnackbar(`Venda concluida, mas a impressao nao abriu: ${getErrorMessage(error)}`, {
            variant: 'warning'
          });
        }
      }

      setItems([]);
      setPaymentOpen(false);
      setPreferredPaymentMethod('Dinheiro');
      setBarcode('');
      setSelectedClient(null);
      setSelectedClientAutoLinked(false);
      setRecentEntries([]);
      setTouchStatus(`Venda ${result.numeroVenda} concluida`, `Troco ${formatCurrency(result.troco)}`);
      focusBarcodeField();
      return true;
    } catch (error) {
      setTouchStatus('Falha ao concluir venda', 'Revise pagamentos e tente novamente');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function finalizeSale(payments: FinalizarVendaPagamentoRequest[], emitirNfe: boolean) {
    if (descontoTotal > 0 && !hasPermission('AplicarDesconto')) {
      setPendingManagerApproval({ payments, emitirNfe });
      return;
    }

    await submitSale(payments, emitirNfe);
  }

  async function handleManagerApproval(payload: LiberacaoGerentePayload) {
    if (!pendingManagerApproval) {
      return;
    }

    const success = await submitSale(
      pendingManagerApproval.payments,
      pendingManagerApproval.emitirNfe,
      [payload]
    );
    if (success) {
      setPendingManagerApproval(null);
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const descontoTotal = items.reduce((sum, item) => sum + item.desconto, 0);
  const total = subtotal - descontoTotal;
  const touchDisplayPrimary = touchKeyboardStatus?.primary
    ?? (lastResolvedProduct
      ? lastResolvedProduct.nome
      : items.length > 0
        ? `${items.length} item(ns) na venda`
        : 'PDV touch pronto');
  const touchDisplaySecondary = touchKeyboardStatus?.secondary
    ?? (selectedClient
      ? `Cliente ${selectedClient.nome}`
      : total > 0
        ? `Total ${formatCurrency(total)}`
        : 'Use o teclado, o scanner ou a camera');
  const touchDisplayCode = barcode.trim() || (touchKeyboardStatus ? '' : lastResolvedCode || '');
  const touchInfoCards = [
    { label: 'Itens', value: `${items.length}`, tone: items.length > 0 ? 'info' as const : 'neutral' as const, action: 'focusBarcode' as const },
    { label: 'Subtotal', value: formatCurrency(subtotal), tone: subtotal > 0 ? 'neutral' as const : 'neutral' as const },
    { label: 'Descontos', value: formatCurrency(descontoTotal), tone: descontoTotal > 0 ? 'warning' as const : 'neutral' as const },
    { label: 'Total', value: formatCurrency(total), tone: total > 0 ? 'success' as const : 'neutral' as const, action: 'finalizeSale' as const },
    { label: 'Cliente', value: selectedClient?.nome ?? 'Consumidor final', tone: selectedClient ? 'info' as const : 'neutral' as const, action: 'focusClient' as const },
    { label: 'Ultimo item', value: lastResolvedProduct?.nome ?? 'Nenhum', tone: lastResolvedProduct ? 'info' as const : 'neutral' as const }
  ];
  const touchKeyboardRemoteState: PdvTouchKeyboardRemoteState = {
    primaryMessage: touchDisplayPrimary,
    secondaryMessage: touchDisplaySecondary,
    currentCode: touchDisplayCode,
    infoCards: touchInfoCards,
    disabled: submitting
  };
  const detachedTouchKeyboardActive = Boolean(detachedTouchKeyboardSessionKey);

  useEffect(() => {
    touchKeyboardRemoteStateRef.current = touchKeyboardRemoteState;

    if (!detachedTouchKeyboardChannelRef.current) {
      return;
    }

    detachedTouchKeyboardChannelRef.current.postMessage({
      type: 'state',
      state: touchKeyboardRemoteState
    } satisfies PdvTouchKeyboardBridgeMessage);
  }, [touchKeyboardRemoteState]);

  useEffect(() => {
    touchKeyboardCommandHandlersRef.current = {
      appendDigit: appendTouchBarcode,
      backspace: backspaceTouchBarcode,
      clear: clearTouchBarcode,
      confirm: () => submitCurrentBarcode(),
      shortcut: handleTouchShortcut,
      closeDetached: closeDetachedTouchKeyboardWindow
    };
  });

  useEffect(() => {
    if (!detachedTouchKeyboardSessionKey) {
      detachedTouchKeyboardChannelRef.current?.close();
      detachedTouchKeyboardChannelRef.current = null;
      return;
    }

    const channel = new BroadcastChannel(getPdvTouchKeyboardChannelName(detachedTouchKeyboardSessionKey));
    detachedTouchKeyboardChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent<PdvTouchKeyboardBridgeMessage>) => {
      const message = event.data;
      if (!message) {
        return;
      }

      switch (message.type) {
        case 'ready':
          if (touchKeyboardRemoteStateRef.current) {
            channel.postMessage({ type: 'state', state: touchKeyboardRemoteStateRef.current } satisfies PdvTouchKeyboardBridgeMessage);
          }
          return;
        case 'digit':
          touchKeyboardCommandHandlersRef.current?.appendDigit(message.fragment);
          return;
        case 'backspace':
          touchKeyboardCommandHandlersRef.current?.backspace();
          return;
        case 'clear':
          touchKeyboardCommandHandlersRef.current?.clear();
          return;
        case 'confirm':
          touchKeyboardCommandHandlersRef.current?.confirm();
          return;
        case 'shortcut':
          touchKeyboardCommandHandlersRef.current?.shortcut(message.action);
          return;
        case 'closed':
          touchKeyboardCommandHandlersRef.current?.closeDetached();
          return;
        default:
          return;
      }
    };

    if (touchKeyboardRemoteStateRef.current) {
      channel.postMessage({ type: 'state', state: touchKeyboardRemoteStateRef.current } satisfies PdvTouchKeyboardBridgeMessage);
    }

    return () => {
      channel.close();
      if (detachedTouchKeyboardChannelRef.current === channel) {
        detachedTouchKeyboardChannelRef.current = null;
      }
    };
  }, [detachedTouchKeyboardSessionKey]);

  const touchKeyboardCard = (
    <Card
      ref={touchKeyboardPlacement === 'floating' ? floatingTouchKeyboardRef : undefined}
      sx={{
        borderRadius: 5,
        bgcolor: '#eef2f7',
        ...(touchKeyboardPlacement === 'floating'
          ? {
            position: 'fixed',
            left: touchKeyboardFloatingPosition.x,
            top: touchKeyboardFloatingPosition.y,
            width: 'min(calc(100vw - 32px), 980px)',
            maxHeight: 'calc(100vh - 32px)',
            overflow: 'auto',
            zIndex: (theme) => theme.zIndex.drawer + 2,
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)'
          }
          : null)
      }}
    >
      <CardContent>
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ lg: 'flex-start' }}
          >
            <Box
              onPointerDown={touchKeyboardPlacement === 'floating' ? handleFloatingTouchKeyboardPointerDown : undefined}
              onPointerMove={touchKeyboardPlacement === 'floating' ? handleFloatingTouchKeyboardPointerMove : undefined}
              onPointerUp={touchKeyboardPlacement === 'floating' ? releaseFloatingTouchKeyboardDrag : undefined}
              onPointerCancel={touchKeyboardPlacement === 'floating' ? releaseFloatingTouchKeyboardDrag : undefined}
              sx={{
                flex: 1,
                userSelect: 'none',
                touchAction: touchKeyboardPlacement === 'floating' ? 'none' : 'auto',
                cursor: touchKeyboardPlacement === 'floating' ? 'grab' : 'default'
              }}
            >
              <Typography variant="h5">Teclado touch programavel</Typography>
              <Typography color="text.secondary">
                {touchKeyboardPlacement === 'floating'
                  ? 'Modo solto ativo: arraste pelo cabecalho para levar o teclado para qualquer ponto da tela.'
                  : 'Layout ampliado para parecer mais com um PDV de mercado: visor grande, atalhos operacionais, metodos de pagamento e comandos rapidos da venda.'}
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="outlined"
                onClick={() => openDetachedTouchKeyboardWindow(touchKeyboardRemoteState)}
              >
                Abrir no outro monitor
              </Button>
              {touchKeyboardPlacement === 'floating' ? (
                <Button variant="outlined" onClick={resetFloatingTouchKeyboardPosition}>
                  Recentralizar
                </Button>
              ) : null}
              <Button
                variant={touchKeyboardPlacement === 'floating' ? 'outlined' : 'contained'}
                onClick={() => {
                  if (touchKeyboardPlacement === 'floating') {
                    setTouchKeyboardPlacement('bottom');
                    return;
                  }

                  setTouchKeyboardPlacement('floating');
                  resetFloatingTouchKeyboardPosition();
                }}
              >
                {touchKeyboardPlacement === 'floating' ? 'Fixar abaixo da venda' : 'Soltar e mover pela tela'}
              </Button>
            </Stack>
          </Stack>
          <PdvTouchKeyboard
            primaryMessage={touchKeyboardRemoteState.primaryMessage}
            secondaryMessage={touchKeyboardRemoteState.secondaryMessage}
            currentCode={touchKeyboardRemoteState.currentCode}
            infoCards={touchKeyboardRemoteState.infoCards}
            disabled={touchKeyboardRemoteState.disabled}
            onInfoCardAction={handleTouchShortcut}
            onDigit={appendTouchBarcode}
            onBackspace={backspaceTouchBarcode}
            onClear={clearTouchBarcode}
            onConfirm={() => submitCurrentBarcode()}
            onShortcut={handleTouchShortcut}
          />
        </Stack>
      </CardContent>
    </Card>
  );

  if (loading) {
    return <Loading message="Preparando PDV..." />;
  }

  if (!accessGranted) {
    return (
      <CashierAccessPanel
        accessPath="/pdv"
        embedded
        title="Entrada profissional no PDV"
        description="Identifique o operador por cracha e senha antes de liberar a venda, o caixa e os registros operacionais do PDV."
      />
    );
  }

  if (!cashierOpen) {
    return (
      <Stack spacing={3}>
        <Alert severity="warning">
          Este usuario nao possui caixa aberto. Abra o caixa antes de realizar vendas.
        </Alert>
        <Button variant="contained" onClick={() => navigate('/caixa')}>
          Ir para abertura de caixa
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Tela de venda PDV</Typography>
        <Typography color="text.secondary">Fluxo rapido para leitura, busca, soma de itens e pagamento multiplo.</Typography>
      </Box>

      <Alert severity="info" sx={{ borderRadius: 4 }}>
        <Stack spacing={0.75}>
          <Typography>
            Impressora <strong>{getTerminalPrinterLabel(terminalPrinterProfile)}</strong> · Scanner <strong>{getTerminalScannerLabel(terminalScannerProfile)}</strong> · Teclado <strong>{getTerminalKeyboardLabel(terminalKeyboardProfile)}</strong> · Autoimpressao <strong>{autoPrintEnabled ? 'Ligada' : 'Desligada'}</strong>
          </Typography>
          {terminalKeyboardProfile === 'PADRAO_PDV' ? (
            <Typography variant="body2">
              Atalhos ativos no teclado PDV: <strong>D</strong> caixa, <strong>F</strong> suprimento, <strong>G</strong> troca de operador, <strong>H</strong> sangria, <strong>I</strong> outros itens, <strong>J</strong> consulta de preco, <strong>K</strong> vale troca, <strong>L</strong> outras formas e <strong>O</strong> digitar codigo.
            </Typography>
          ) : null}
        </Stack>
      </Alert>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <Card sx={{ borderRadius: 5 }}>
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="Leitura por codigo de barras"
                  value={barcode}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setBarcode(nextValue);
                    setLastResolvedCode(nextValue.trim() || null);
                    setTouchKeyboardStatus(null);
                  }}
                  onKeyDown={handleBarcodeSearch}
                  inputRef={barcodeInputRef}
                  helperText={buildScannerHelperText(terminalScannerProfile)}
                  fullWidth
                />
                <ScannerActionBar
                  contexto="pdv-leitura-codigo"
                  title="Scanner do PDV"
                  description={buildScannerActionDescription(terminalScannerProfile)}
                  defaultMode={terminalScannerProfile === 'CAMERA_CELULAR' ? 'Auto' : 'CodigoBarras'}
                  availableModes={['CodigoBarras', 'QrCode', 'Auto']}
                  onDetected={(code) => enqueueBarcodeResolution(code)}
                  onFocusInput={() => barcodeInputRef.current?.focus()}
                />
                <ProductSearch onSelect={addProduct} inputRef={productSearchInputRef} />
                {canUseClientDirectory ? (
                  <Box ref={clientFieldSectionRef}>
                    <Autocomplete
                      fullWidth
                      open={clientPickerOpen}
                      onOpen={() => setClientPickerOpen(true)}
                      onClose={() => setClientPickerOpen(false)}
                      openOnFocus
                      options={clients}
                      value={selectedClient}
                      filterOptions={(options, state) => {
                        const normalizedQuery = normalizeTouchClientQuery(state.inputValue);
                        const digitQuery = onlyDigits(state.inputValue);

                        if (!normalizedQuery && !digitQuery) {
                          return options;
                        }

                        return options.filter((client) => {
                          const textMatch = normalizedQuery.length > 0 && [
                            client.nome,
                            client.documento,
                            client.telefone,
                            client.cidade
                          ].some((field) => normalizeTouchClientQuery(field).includes(normalizedQuery));

                          const digitsMatch = digitQuery.length > 0
                            && [client.documento, client.telefone].some((field) => onlyDigits(field).includes(digitQuery));

                          return textMatch || digitsMatch;
                        });
                      }}
                      onChange={(_, client) => {
                        setSelectedClient(client);
                        setSelectedClientAutoLinked(false);
                        setClientPickerOpen(false);
                        setTouchStatus(
                          client ? `Cliente ${client.nome}` : 'Consumidor final',
                          client ? 'Cliente vinculado a venda atual' : 'Cliente removido da venda'
                        );
                      }}
                      isOptionEqualToValue={(option, value) => option.clienteId === value.clienteId}
                      getOptionLabel={(option) => option.nome}
                      noOptionsText="Nenhum cliente ativo encontrado"
                      renderOption={(props, option) => (
                        <Box component="li" {...props} sx={{ py: 1.25 }}>
                          <Box>
                            <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {[option.documento, option.telefone, option.cidade].filter(Boolean).join(' · ') || 'Cadastro sem documento ou telefone.'}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          inputRef={clientInputRef}
                          label="Cliente da venda"
                          placeholder="Digite nome, CPF/CNPJ ou telefone"
                          helperText={selectedClientAutoLinked
                            ? 'Cliente preenchido automaticamente pelo produto lido. Voce pode trocar manualmente.'
                            : 'Se nao selecionar, a venda segue como consumidor final. O atalho CPF / Cliente tambem cai aqui.'}
                        />
                      )}
                    />
                  </Box>
                ) : (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    A base de clientes nao esta liberada para este usuario. As vendas seguem normalmente como consumidor final.
                  </Alert>
                )}
                {!hasPermission('AplicarDesconto') && (
                  <Alert severity="warning" sx={{ borderRadius: 3 }}>
                    Este operador pode informar descontos na venda, mas o fechamento vai exigir a leitura do cracha e a senha do gerente.
                  </Alert>
                )}
                <SaleItemsTable
                  items={items}
                  canEditDiscount
                  discountRequiresManagerApproval={!hasPermission('AplicarDesconto')}
                  onUpdateQuantity={updateQuantity}
                  onUpdateDiscount={updateDiscount}
                  onRemove={(produtoId) => setItems((current) => current.filter((item) => item.produtoId !== produtoId))}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={2.5} sx={{ position: { lg: 'sticky' }, top: 104 }}>
            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h5">Resumo da venda</Typography>
                  <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(23, 75, 138, 0.08)' }}>
                    <Typography color="text.secondary">Leitura atual</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {barcode.trim() ? `Digitando: ${barcode.trim()}` : lastResolvedCode ? `Ultimo codigo: ${lastResolvedCode}` : 'Aguardando leitura ou digitacao'}
                    </Typography>
                    {lastResolvedProduct ? (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.25 }}>
                        <ProductThumbnail imageUrl={lastResolvedProduct.imagemUrl} name={lastResolvedProduct.nome} size={68} borderRadius={3} padding={0.75} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="h6">
                            {lastResolvedProduct.nome}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {formatCurrency(lastResolvedProduct.precoVenda)} · Estoque {lastResolvedProduct.estoqueAtual.toFixed(3)} {lastResolvedProduct.unidadeMedida}
                          </Typography>
                          {lastResolvedProduct.clienteFornecedorNome ? (
                            <Typography variant="caption" color="text.secondary">
                              Cliente vinculado: {lastResolvedProduct.clienteFornecedorNome}
                            </Typography>
                          ) : null}
                        </Box>
                      </Stack>
                    ) : (
                      <Typography variant="h6" sx={{ mt: 1 }}>
                        Nenhum produto identificado ainda
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(23, 75, 138, 0.05)' }}>
                    <Typography color="text.secondary">Subtotal</Typography>
                    <Typography variant="h6">{formatCurrency(subtotal)}</Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(209, 127, 52, 0.08)' }}>
                    <Typography color="text.secondary">Descontos</Typography>
                    <Typography variant="h6">{formatCurrency(descontoTotal)}</Typography>
                  </Box>
                  <Box sx={{ p: 2.5, borderRadius: 4, background: 'linear-gradient(135deg, #174b8a, #d17f34)', color: '#fff' }}>
                    <Typography>Total geral</Typography>
                    <Typography variant="h4">{formatCurrency(total)}</Typography>
                  </Box>
                  <Box
                    role={canUseClientDirectory ? 'button' : undefined}
                    tabIndex={canUseClientDirectory ? 0 : undefined}
                    onClick={canUseClientDirectory ? focusClientField : undefined}
                    onKeyDown={canUseClientDirectory
                      ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          focusClientField();
                        }
                      }
                      : undefined}
                    sx={{
                      p: 2,
                      borderRadius: 4,
                      bgcolor: 'rgba(23, 50, 79, 0.04)',
                      ...(canUseClientDirectory
                        ? {
                          cursor: 'pointer',
                          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                          '&:hover': {
                            transform: 'translateY(-1px)',
                            boxShadow: '0 8px 18px rgba(17, 24, 39, 0.08)'
                          },
                          '&:focus-visible': {
                            outline: '2px solid rgba(23, 75, 138, 0.35)',
                            outlineOffset: 2
                          }
                        }
                        : null)
                    }}
                  >
                    <Typography color="text.secondary">Cliente da venda</Typography>
                    <Typography variant="h6">{selectedClient?.nome ?? 'Consumidor final'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedClient
                        ? [selectedClient.documento, selectedClient.telefone].filter(Boolean).join(' · ') || 'Cliente vinculado sem telefone/documento preenchido.'
                        : 'Sem cliente vinculado: o financeiro vai mostrar consumidor final.'}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(23, 50, 79, 0.04)' }}>
                    <Typography color="text.secondary">Ultimos itens lidos</Typography>
                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                      {recentEntries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Os produtos escaneados ou digitados vao aparecer aqui durante a venda.
                        </Typography>
                      ) : (
                        recentEntries.map((entry) => (
                          <Stack
                            key={`${entry.produtoId}-${entry.momento}`}
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                              <ProductThumbnail imageUrl={entry.imagemUrl} name={entry.nome} size={40} borderRadius={2} />
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {entry.nome}
                              </Typography>
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                              agora
                            </Typography>
                          </Stack>
                        ))
                      )}
                    </Stack>
                  </Box>
                  <Button
                    size="large"
                    variant="contained"
                    startIcon={<PaymentRoundedIcon />}
                    onClick={() => openPaymentPanel('Dinheiro')}
                    disabled={items.length === 0 || total <= 0}
                  >
                    Finalizar venda
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 5, bgcolor: '#eef2f7' }}>
              <CardContent>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Visor operacional
                  </Typography>
                  <Typography variant="h6">
                    {touchDisplayPrimary}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {touchDisplaySecondary}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {detachedTouchKeyboardActive ? (
        <Card sx={{ borderRadius: 5, bgcolor: '#eef2f7' }}>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h5">Teclado touch no outro monitor</Typography>
                <Typography color="text.secondary">
                  O teclado foi aberto em uma janela separada. Agora e so arrastar essa janela para o monitor auxiliar.
                </Typography>
              </Box>
              <Alert severity="info" sx={{ borderRadius: 4 }}>
                Se a janela sumir, use os botoes abaixo para abrir novamente ou trazer o teclado de volta para esta tela.
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="contained" onClick={() => openDetachedTouchKeyboardWindow(touchKeyboardRemoteState)}>
                  Abrir novamente no outro monitor
                </Button>
                <Button variant="outlined" onClick={closeDetachedTouchKeyboardWindow}>
                  Trazer de volta para esta tela
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
      {!detachedTouchKeyboardActive && touchKeyboardPlacement === 'bottom' ? touchKeyboardCard : null}
      {!detachedTouchKeyboardActive && touchKeyboardPlacement === 'floating' ? touchKeyboardCard : null}

      <PaymentModal
        open={paymentOpen}
        total={total}
        loading={submitting}
        allowEmitNfe={hasPermission('EmitirNotasFiscais')}
        initialPaymentMethod={preferredPaymentMethod}
        selectedClientId={selectedClient?.clienteId ?? null}
        selectedClientName={selectedClient?.nome ?? null}
        onClose={() => {
          setPaymentOpen(false);
          setPreferredPaymentMethod('Dinheiro');
          setTouchStatus('Pagamento cancelado', 'Venda continua em aberto');
        }}
        onConfirm={({ payments, emitirNfe }) => void finalizeSale(payments, emitirNfe)}
      />
      <ManagerOverrideDialog
        open={Boolean(pendingManagerApproval)}
        actionCode="AplicarDescontoVenda"
        title="Liberacao gerencial para desconto"
        description="A venda possui desconto e este operador nao tem autonomia para conceder esse abatimento. Informe o cracha ou e-mail do gerente e confirme a senha para concluir o fechamento."
        confirmLabel="Liberar desconto"
        loading={submitting}
        onCancel={() => setPendingManagerApproval(null)}
        onConfirm={(payload) => handleManagerApproval(payload)}
      />
    </Stack>
  );
}

function normalizeScannedBarcode(code: string) {
  return code
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
}

function buildScannerHelperText(scannerProfile: string) {
  switch (scannerProfile) {
    case 'TECLADO_USB':
      return 'Leitor USB/Bluetooth funciona como teclado e continua sendo o modo principal deste terminal.';
    case 'CAMERA_CELULAR':
      return 'Este terminal foi preparado para leitura pela camera local ou pelo celular pareado.';
    default:
      return 'Leitor USB/Bluetooth funciona como teclado. Tambem e possivel ler pela camera ou pelo celular.';
  }
}

function buildScannerActionDescription(scannerProfile: string) {
  switch (scannerProfile) {
    case 'TECLADO_USB':
      return 'Use a camera apenas como apoio. O leitor comum USB/Bluetooth segue como modo principal do PDV.';
    case 'CAMERA_CELULAR':
      return 'Use a camera deste dispositivo ou do celular para ler codigo de barras e QR Code e adicionar itens na venda.';
    default:
      return 'Use leitor comum, camera deste dispositivo ou scanner remoto do celular no mesmo terminal.';
  }
}

function resolvePdvKeyboardShortcut(key: string): PdvTouchShortcutAction | null {
  switch (key) {
    case 'D':
      return 'openCashier';
    case 'F':
      return 'supply';
    case 'G':
      return 'operatorShift';
    case 'H':
      return 'withdrawal';
    case 'I':
      return 'focusProductSearch';
    case 'J':
      return 'priceCheck';
    case 'K':
      return 'paymentVoucher';
    case 'L':
      return 'paymentOther';
    case 'O':
      return 'focusBarcode';
    case 'ESCAPE':
      return 'cancel';
    default:
      return null;
  }
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function readTouchKeyboardPlacement(): TouchKeyboardPlacement {
  if (typeof window === 'undefined') {
    return 'bottom';
  }

  return window.localStorage.getItem(TOUCH_KEYBOARD_PLACEMENT_STORAGE_KEY) === 'floating'
    ? 'floating'
    : 'bottom';
}

function readTouchKeyboardPosition(): FloatingTouchKeyboardPosition {
  if (typeof window === 'undefined') {
    return { x: FLOATING_TOUCH_KEYBOARD_MARGIN, y: 88 };
  }

  const rawValue = window.localStorage.getItem(TOUCH_KEYBOARD_POSITION_STORAGE_KEY);
  if (!rawValue) {
    return getDefaultTouchKeyboardPosition();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<FloatingTouchKeyboardPosition>;
    if (typeof parsedValue.x === 'number' && typeof parsedValue.y === 'number') {
      return parsedValue as FloatingTouchKeyboardPosition;
    }
  } catch {
  }

  return getDefaultTouchKeyboardPosition();
}

function getDefaultTouchKeyboardPosition(): FloatingTouchKeyboardPosition {
  if (typeof window === 'undefined') {
    return { x: FLOATING_TOUCH_KEYBOARD_MARGIN, y: 88 };
  }

  return {
    x: Math.max(FLOATING_TOUCH_KEYBOARD_MARGIN, window.innerWidth - 940),
    y: 88
  };
}

function normalizeTouchClientQuery(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatPaymentMethodForTouch(paymentMethod: FormaPagamento) {
  switch (paymentMethod) {
    case 'Dinheiro':
      return 'dinheiro';
    case 'CartaoDebito':
      return 'debito';
    case 'CartaoCredito':
      return 'credito';
    case 'Voucher':
      return 'voucher';
    case 'Pix':
      return 'pix';
    default:
      return String(paymentMethod).toLowerCase();
  }
}
