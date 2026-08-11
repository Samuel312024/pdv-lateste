import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import LoyaltyRoundedIcon from '@mui/icons-material/LoyaltyRounded';
import PhoneAndroidRoundedIcon from '@mui/icons-material/PhoneAndroidRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import ShoppingCartCheckoutRoundedIcon from '@mui/icons-material/ShoppingCartCheckoutRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import {
  Alert,
  Autocomplete,
  Avatar,
  Badge,
  Box,
  ButtonBase,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Divider,
  Dialog,
  DialogContent,
  DialogTitle,
  Drawer,
  Fab,
  Grid,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { BuyerClientProfileDialog } from '../components/pdv/BuyerClientProfileDialog';
import { PaymentModal } from '../components/pdv/PaymentModal';
import { useAuth } from '../contexts/AuthContext';
import { cashService } from '../services/cashService';
import { clientService } from '../services/clientService';
import { productService } from '../services/productService';
import { saleService } from '../services/saleService';
import type { AtendimentoPedidoTipo, CheckoutDisponibilidade, Cliente, FinalizarVendaPagamentoRequest, ProdutoCatalogoItem } from '../types';
import { canAccessClientsFeature } from '../utils/featureAccess';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import { printSaleReceipt } from '../utils/receiptPrinter';

type CatalogAvailabilityFilter = 'todos' | 'disponiveis' | 'semEstoque';

interface CatalogCartItem {
  produtoId: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
  marca: string | null;
  precoVenda: number;
  unidadeMedida: string;
  quantidade: number;
  estoqueAtual: number;
  controlaEstoque: boolean;
  disponivelParaVenda: boolean;
}

interface PersistedCatalogCartLine {
  produtoId: string;
  quantidade: number;
}

interface PersistedCatalogCartState {
  items: PersistedCatalogCartLine[];
  selectedClientId: string | null;
  orderMode: AtendimentoPedidoTipo;
  orderNote: string;
  cartOpen: boolean;
}

export function ProductCatalogPage({ mode = 'internal' }: { mode?: 'internal' | 'buyer' }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catalogLoadedOnce, setCatalogLoadedOnce] = useState(false);
  const [products, setProducts] = useState<ProdutoCatalogoItem[]>([]);
  const [filter, setFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<CatalogAvailabilityFilter>('todos');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [cart, setCart] = useState<CatalogCartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutAvailability, setCheckoutAvailability] = useState<CheckoutDisponibilidade | null>(null);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProdutoCatalogoItem | null>(null);
  const [detailImageZoomed, setDetailImageZoomed] = useState(false);
  const [detailImageTransformOrigin, setDetailImageTransformOrigin] = useState('50% 50%');
  const [orderMode, setOrderMode] = useState<AtendimentoPedidoTipo>('Retirada');
  const [orderNote, setOrderNote] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, session } = useAuth();
  const navigate = useNavigate();
  const buyerExperience = mode === 'buyer';
  const canCheckout = hasPermission('RealizarVenda') || hasPermission('RealizarPedidoCliente');
  const canEmitNfe = hasPermission('EmitirNotasFiscais');
  const canUseClientDirectory = canAccessClientsFeature(session);
  const canSelfRegisterBuyerProfile = session?.usuario.perfil === 'Comprador';
  const linkedClientId = session?.usuario.clienteId ?? null;
  const linkedClientName = session?.usuario.clienteNome ?? null;
  const [buyerClientDialogOpen, setBuyerClientDialogOpen] = useState(false);
  const catalogCartStorageKey = useMemo(
    () => buildCatalogCartStorageKey(session?.usuario.empresaId, session?.usuario.usuarioId),
    [session?.usuario.empresaId, session?.usuario.usuarioId]
  );
  const restoredCatalogCartKeyRef = useRef<string | null>(null);
  const productsSectionRef = useRef<HTMLDivElement | null>(null);
  const [cartStateHydrated, setCartStateHydrated] = useState(false);

  useEffect(() => {
    restoredCatalogCartKeyRef.current = null;
    setCartStateHydrated(false);
  }, [catalogCartStorageKey]);

  useEffect(() => {
    void bootstrap();
  }, [buyerExperience, canUseClientDirectory, linkedClientId]);

  useEffect(() => {
    if (!catalogLoadedOnce || loading || restoredCatalogCartKeyRef.current === catalogCartStorageKey) {
      return;
    }

    const persistedState = readPersistedCatalogCartState(catalogCartStorageKey);
    const restoredCart = buildCartFromPersistedState(persistedState?.items ?? [], products);
    const removedItemsCount = Math.max((persistedState?.items.length ?? 0) - restoredCart.length, 0);
    const fallbackClient = linkedClientId
      ? clients.find((client) => client.clienteId === linkedClientId) ?? null
      : null;
    const restoredClient = canUseClientDirectory && persistedState?.selectedClientId
      ? clients.find((client) => client.clienteId === persistedState.selectedClientId) ?? null
      : null;

    setCart(restoredCart);
    setCartOpen(Boolean(persistedState?.cartOpen) && restoredCart.length > 0);
    setOrderMode(persistedState?.orderMode ?? 'Retirada');
    setOrderNote(persistedState?.orderNote ?? '');
    setSelectedClient(canUseClientDirectory ? restoredClient ?? fallbackClient : null);

    if (removedItemsCount > 0) {
      enqueueSnackbar(
        `${removedItemsCount} item(ns) nao puderam ser restaurados porque nao estao mais disponiveis no catalogo atual.`,
        { variant: 'warning' }
      );
    }

    restoredCatalogCartKeyRef.current = catalogCartStorageKey;
    setCartStateHydrated(true);
  }, [canUseClientDirectory, catalogCartStorageKey, catalogLoadedOnce, clients, enqueueSnackbar, linkedClientId, loading, products]);

  useEffect(() => {
    if (!cartStateHydrated) {
      return;
    }

    writePersistedCatalogCartState(catalogCartStorageKey, {
      items: cart
        .filter((item) => item.quantidade > 0)
        .map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade
        })),
      selectedClientId: canUseClientDirectory ? selectedClient?.clienteId ?? null : null,
      orderMode,
      orderNote,
      cartOpen: cartOpen && cart.length > 0
    });
  }, [canUseClientDirectory, cart, cartOpen, cartStateHydrated, catalogCartStorageKey, orderMode, orderNote, selectedClient?.clienteId]);

  async function bootstrap() {
    setLoading(true);
    try {
      const [catalogResult, cashierResult, clientsResult] = await Promise.allSettled([
        productService.listCatalog(undefined, false, buyerExperience),
        cashService.getCheckoutAvailability(),
        canUseClientDirectory ? clientService.list() : Promise.resolve([] as Cliente[])
      ]);

      if (catalogResult.status === 'fulfilled') {
        applyCatalogResult(catalogResult.value);
        setCatalogLoadedOnce(true);
      } else {
        enqueueSnackbar(getErrorMessage(catalogResult.reason), { variant: 'error' });
      }

      if (cashierResult.status === 'fulfilled') {
        setCheckoutAvailability(cashierResult.value);
      } else {
        enqueueSnackbar(getErrorMessage(cashierResult.reason), { variant: 'error' });
      }

      if (clientsResult.status === 'fulfilled') {
        const activeClients = clientsResult.value
          .filter((client) => client.ativo)
          .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
        setClients(activeClients);
        if (linkedClientId && canUseClientDirectory) {
          setSelectedClient(activeClients.find((client) => client.clienteId === linkedClientId) ?? null);
        }
      } else if (canUseClientDirectory) {
        enqueueSnackbar('Nao foi possivel carregar a base de clientes para vincular o pedido.', { variant: 'warning' });
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog(showPageLoader = false) {
    if (showPageLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const result = await productService.listCatalog(undefined, false, buyerExperience);
      applyCatalogResult(result);
      setCatalogLoadedOnce(true);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      if (showPageLoader) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }

  function applyCatalogResult(result: ProdutoCatalogoItem[]) {
    setProducts(result);
    setCart((current) =>
      current.map((item) => {
        const product = result.find((candidate) => candidate.produtoId === item.produtoId);
        if (!product) {
          return item;
        }

        return {
          ...item,
          nome: product.nome,
          descricao: product.descricao,
          imagemUrl: product.imagemUrl,
          marca: product.marca,
          precoVenda: product.precoVenda,
          unidadeMedida: product.unidadeMedida,
          estoqueAtual: product.estoqueAtual,
          controlaEstoque: product.controlaEstoque,
          disponivelParaVenda: product.disponivelParaVenda
        };
      })
    );
  }

  function addToCart(product: ProdutoCatalogoItem) {
    if (!canCheckout) {
      enqueueSnackbar('Seu usuario pode visualizar o catalogo, mas nao possui permissao para finalizar pedidos.', { variant: 'warning' });
      return;
    }

    if (!product.disponivelParaVenda) {
      enqueueSnackbar(`O produto ${product.nome} nao esta disponivel para venda neste momento.`, { variant: 'warning' });
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.produtoId === product.produtoId);
      if (existing) {
        const nextQuantity = existing.quantidade + 1;
        if (existing.controlaEstoque && nextQuantity > existing.estoqueAtual) {
          enqueueSnackbar(`Estoque insuficiente para ${existing.nome}.`, { variant: 'warning' });
          return current;
        }

        return current.map((item) =>
          item.produtoId === product.produtoId
            ? { ...item, quantidade: nextQuantity }
            : item
        );
      }

      return [
        ...current,
        {
          produtoId: product.produtoId,
          nome: product.nome,
          descricao: product.descricao,
          imagemUrl: product.imagemUrl,
          marca: product.marca,
          precoVenda: product.precoVenda,
          unidadeMedida: product.unidadeMedida,
          quantidade: 1,
          estoqueAtual: product.estoqueAtual,
          controlaEstoque: product.controlaEstoque,
          disponivelParaVenda: product.disponivelParaVenda
        }
      ];
    });

    enqueueSnackbar(`${product.nome} foi enviado para o carrinho.`, { variant: 'success' });
  }

  function openProductDetail(product: ProdutoCatalogoItem) {
    setSelectedProduct(product);
    setDetailImageZoomed(false);
    setDetailImageTransformOrigin('50% 50%');
  }

  function closeProductDetail() {
    setSelectedProduct(null);
    setDetailImageZoomed(false);
    setDetailImageTransformOrigin('50% 50%');
  }

  function updateDetailImageTransformOrigin(target: HTMLElement, clientX: number, clientY: number) {
    const rect = target.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * 100;
    const relativeY = ((clientY - rect.top) / rect.height) * 100;
    const safeX = Number.isFinite(relativeX) ? Math.min(100, Math.max(0, relativeX)) : 50;
    const safeY = Number.isFinite(relativeY) ? Math.min(100, Math.max(0, relativeY)) : 50;
    setDetailImageTransformOrigin(`${safeX}% ${safeY}%`);
  }

  function handleDetailImageClick(event: MouseEvent<HTMLButtonElement>) {
    updateDetailImageTransformOrigin(event.currentTarget, event.clientX, event.clientY);
    setDetailImageZoomed((current) => !current);
  }

  function handleDetailImageMove(event: MouseEvent<HTMLButtonElement>) {
    if (!detailImageZoomed) {
      return;
    }

    updateDetailImageTransformOrigin(event.currentTarget, event.clientX, event.clientY);
  }

  function updateCartQuantity(produtoId: string, delta: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.produtoId !== produtoId) {
          return [item];
        }

        const nextQuantity = item.quantidade + delta;
        if (nextQuantity <= 0) {
          return [];
        }

        if (item.controlaEstoque && nextQuantity > item.estoqueAtual) {
          enqueueSnackbar(`Quantidade maior que o estoque disponivel para ${item.nome}.`, { variant: 'warning' });
          return [item];
        }

        return [{ ...item, quantidade: nextQuantity }];
      })
    );
  }

  function removeFromCart(produtoId: string) {
    setCart((current) => current.filter((item) => item.produtoId !== produtoId));
  }

  async function finalizeOrder(payments: FinalizarVendaPagamentoRequest[], emitirNfe: boolean) {
    if (cart.length === 0) {
      enqueueSnackbar('Adicione pelo menos um produto antes de finalizar o pedido.', { variant: 'warning' });
      return;
    }

    if (orderMode === 'Entrega' && !selectedClient && !linkedClientId) {
      enqueueSnackbar('Escolha um cliente com endereco completo antes de fechar um pedido para entrega.', { variant: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await saleService.finalize({
        clienteId: selectedClient?.clienteId ?? linkedClientId ?? null,
        itens: cart.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          desconto: 0
        })),
        pagamentos: payments,
        emitirNfe,
        pedido: {
          atendimentoTipo: orderMode,
          contatoNome: selectedClient?.nome ?? linkedClientName ?? null,
          contatoTelefone: selectedClient?.telefone ?? null,
          observacaoPedido: orderNote.trim() || null
        }
      });

      const noteMessage = result.notaFiscalReferencia
        ? result.notaFiscalProntaParaTransmissao
          ? ` NF-e ${result.notaFiscalReferencia} pronta para transmissao interna.`
          : ` NF-e ${result.notaFiscalReferencia} gerada em rascunho com ${result.notaFiscalPendencias?.length ?? 0} pendencia(s).`
        : '';

      const trackingSuffix = result.ehPedido && result.codigoAcompanhamento
        ? ` Codigo de acompanhamento: ${result.codigoAcompanhamento}.`
        : '';
      enqueueSnackbar(`Pedido ${result.numeroVenda} finalizado. Troco: ${formatCurrency(result.troco)}.${trackingSuffix}${noteMessage}`, {
        variant: result.notaFiscalReferencia && !result.notaFiscalProntaParaTransmissao ? 'warning' : 'success'
      });

      if (!buyerExperience) {
        try {
          const sale = await saleService.getById(result.vendaId);
          printSaleReceipt(sale, session);
        } catch (error) {
          enqueueSnackbar(`Pedido concluido, mas a impressao nao abriu: ${getErrorMessage(error)}`, {
            variant: 'warning'
          });
        }
      }

      setCart([]);
      setCartOpen(false);
      setSelectedClient(linkedClientId ? selectedClient : null);
      setOrderMode('Retirada');
      setOrderNote('');
      setPaymentOpen(false);
      await loadCatalog(false);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleBuyerClientSaved(client: Cliente) {
    setSelectedClient(client);
    setClients((current) =>
      [...current.filter((item) => item.clienteId !== client.clienteId), client]
        .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'))
    );
  }

  const categories = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; count: number }>();
    for (const product of products) {
      const key = product.categoriaId ?? 'sem-categoria';
      const label = product.categoriaNome ?? 'Sem categoria';
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
      } else {
        grouped.set(key, { key, label, count: 1 });
      }
    }

    return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedFilter = normalizeCatalogFilter(filter);

    return products.filter((product) => {
      if (selectedCategory !== 'todas' && (product.categoriaId ?? 'sem-categoria') !== selectedCategory) {
        return false;
      }

      if (availabilityFilter === 'disponiveis' && !product.disponivelParaVenda) {
        return false;
      }

      if (availabilityFilter === 'semEstoque' && (!product.controlaEstoque || product.estoqueAtual > 0)) {
        return false;
      }

      if (!normalizedFilter) {
        return true;
      }

      return normalizeCatalogFilter([
        product.nome,
        product.descricao,
        product.marca,
        product.codigoBarras,
        product.categoriaNome
      ].filter(Boolean).join(' ')).includes(normalizedFilter);
    });
  }, [availabilityFilter, filter, products, selectedCategory]);

  const cartQuantity = cart.reduce((sum, item) => sum + item.quantidade, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.quantidade * item.precoVenda, 0);
  const invalidCartItems = cart.filter((item) => !item.disponivelParaVenda || (item.controlaEstoque && item.quantidade > item.estoqueAtual));
  const cartReadyToCheckout = cart.length > 0 && invalidCartItems.length === 0;
  const selectedProductSnapshot = selectedProduct
    ? products.find((item) => item.produtoId === selectedProduct.produtoId) ?? selectedProduct
    : null;
  const selectedProductCartItem = selectedProductSnapshot
    ? cart.find((item) => item.produtoId === selectedProductSnapshot.produtoId) ?? null
    : null;
  const availableCount = products.filter((item) => item.disponivelParaVenda).length;
  const lowStockCount = products.filter((item) => item.disponivelParaVenda && item.estoqueBaixo).length;
  const promoCount = products.filter((item) => item.promocaoAtiva).length;
  const featuredCount = products.filter((item) => item.destaqueCatalogoComprador).length;
  const spotlightProducts = useMemo(
    () => [...products]
      .filter((item) => item.disponivelParaVenda && (item.promocaoAtiva || item.destaqueCatalogoComprador))
      .sort((left, right) => {
        const rightScore = (right.promocaoAtiva ? 10 : 0) + (right.destaqueCatalogoComprador ? 4 : 0) + (right.percentualDesconto ?? 0);
        const leftScore = (left.promocaoAtiva ? 10 : 0) + (left.destaqueCatalogoComprador ? 4 : 0) + (left.percentualDesconto ?? 0);
        return rightScore - leftScore;
      })
      .slice(0, 3),
    [products]
  );
  const heroOffer = spotlightProducts[0]
    ?? products.find((item) => item.disponivelParaVenda)
    ?? products[0]
    ?? null;

  function jumpToProducts() {
    setAvailabilityFilter('disponiveis');
    setSelectedCategory('todas');
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return <Loading message={buyerExperience ? 'Carregando vitrine do comprador...' : 'Carregando catalogo digital de produtos...'} />;
  }

  return (
    <>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">{buyerExperience ? 'Seu catalogo de compras' : 'Catalogo digital com carrinho'}</Typography>
          <Typography color="text.secondary">
            {buyerExperience
              ? 'Uma vitrine de compra real, com ofertas aplicadas pelo time interno, carrinho rapido e o mesmo estoque que abastece a operacao.'
              : 'Uma vitrine mais elegante para celular, computador e maquininha Android, usando o mesmo cadastro de produtos e o mesmo fluxo profissional de vendas do PDV.'}
          </Typography>
        </Box>

        {buyerExperience ? (
          <Card
            sx={{
              borderRadius: 6,
              overflow: 'hidden',
              color: '#10213a',
              background: 'radial-gradient(circle at top left, rgba(255, 207, 127, 0.42), transparent 30%), radial-gradient(circle at bottom right, rgba(29, 78, 216, 0.18), transparent 28%), linear-gradient(135deg, #fffaf0 0%, #f6f9ff 52%, #eef4ff 100%)',
              boxShadow: '0 28px 70px rgba(15, 23, 42, 0.10)'
            }}
          >
            <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
              <Grid container spacing={2.5} alignItems="stretch">
                <Grid item xs={12} lg={7}>
                  <Stack spacing={2.25} sx={{ height: '100%', justifyContent: 'space-between' }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip icon={<AutoAwesomeRoundedIcon />} label="Portal de compra real" color="warning" />
                        <Chip icon={<LoyaltyRoundedIcon />} label={`${promoCount} ofertas no ar`} variant="outlined" />
                        <Chip icon={<Inventory2RoundedIcon />} label={`${availableCount} itens com estoque valido`} variant="outlined" />
                      </Stack>
                      <Box>
                        <Typography
                          variant="h3"
                          sx={{
                            fontWeight: 900,
                            letterSpacing: '-0.04em',
                            lineHeight: 1,
                            maxWidth: 680,
                            fontSize: { xs: '2.2rem', md: '3.25rem' }
                          }}
                        >
                          Compre com cara de vitrine comercial, sem perder o estoque real.
                        </Typography>
                        <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 640 }}>
                          Ofertas aplicadas pelo time interno, itens em destaque e um carrinho conectado ao mesmo fluxo profissional que opera pedidos, entrega e acompanhamento em tempo real.
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                      <Button
                        variant="contained"
                        size="large"
                        startIcon={<StorefrontRoundedIcon />}
                        endIcon={<ArrowForwardRoundedIcon />}
                        onClick={jumpToProducts}
                        sx={{ borderRadius: 3 }}
                      >
                        Explorar ofertas
                      </Button>
                      <Button
                        variant="outlined"
                        size="large"
                        startIcon={<ShoppingBagRoundedIconFallback />}
                        onClick={() => navigate('/comprador/pedidos')}
                        sx={{ borderRadius: 3 }}
                      >
                        Acompanhar pedidos
                      </Button>
                    </Stack>

                    <Grid container spacing={1.25}>
                      <Grid item xs={12} sm={4}>
                        <SummaryInfoCard label="Ofertas ativas" value={formatQuantity(promoCount)} tone="neutral" />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <SummaryInfoCard label="Itens em destaque" value={formatQuantity(featuredCount)} tone="primary" />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <SummaryInfoCard label="Prontos para compra" value={formatQuantity(availableCount)} tone="success" />
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>

                <Grid item xs={12} lg={5}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.25,
                      height: '100%',
                      borderRadius: 5,
                      borderColor: 'rgba(16, 33, 58, 0.08)',
                      bgcolor: 'rgba(255,255,255,0.82)',
                      backdropFilter: 'blur(10px)'
                    }}
                  >
                    <Stack spacing={1.75} sx={{ height: '100%' }}>
                      <Box>
                        <Typography variant="overline" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: '0.12em' }}>
                          Oferta em destaque
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.05 }}>
                          {heroOffer?.nome ?? 'Catalogo pronto para publicar'}
                        </Typography>
                      </Box>

                      <Typography color="text.secondary" sx={{ minHeight: 66 }}>
                        {heroOffer
                          ? heroOffer.catalogoResumo ?? heroOffer.descricao ?? 'Use o cadastro interno para criar uma vitrine de compra mais clara e persuasiva.'
                          : 'Assim que os produtos promocionais forem configurados, eles aparecem aqui como vitrine principal para o comprador.'}
                      </Typography>

                      {heroOffer ? (
                        <Stack spacing={1.25} sx={{ mt: 'auto' }}>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {heroOffer.promocaoAtiva ? (
                              <Chip
                                size="small"
                                icon={<LocalFireDepartmentRoundedIcon />}
                                color="warning"
                                label={heroOffer.percentualDesconto ? `${heroOffer.percentualDesconto}% OFF` : heroOffer.promocaoTitulo ?? 'Oferta ativa'}
                              />
                            ) : null}
                            {heroOffer.destaqueCatalogoComprador ? <Chip size="small" label="Escolha da operacao" color="primary" variant="outlined" /> : null}
                          </Stack>

                          <Box>
                            <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main' }}>
                              {formatCurrency(heroOffer.precoVenda)}
                            </Typography>
                            {heroOffer.promocaoAtiva && heroOffer.precoOriginal ? (
                              <Typography variant="body2" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                                {formatCurrency(heroOffer.precoOriginal)}
                              </Typography>
                            ) : null}
                            {heroOffer.promocaoAtiva && getProductSavings(heroOffer) > 0 ? (
                              <Typography variant="body2" sx={{ color: '#b45309', fontWeight: 800 }}>
                                Voce economiza {formatCurrency(getProductSavings(heroOffer))}
                              </Typography>
                            ) : null}
                          </Box>

                          <Button
                            variant="contained"
                            startIcon={<ShoppingCartRoundedIcon />}
                            onClick={() => addToCart(heroOffer)}
                            disabled={!canCheckout || !heroOffer.disponivelParaVenda || submitting}
                            sx={{ borderRadius: 3 }}
                          >
                            Aproveitar esta oferta
                          </Button>
                        </Stack>
                      ) : null}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ) : null}

        <Grid container spacing={2.5}>
          <Grid item xs={12} xl={100}>
            <Card
              sx={{
                borderRadius: 5,
                overflow: 'hidden',
                background: buyerExperience
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(251, 247, 240, 0.98))'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(248, 250, 255, 0.96))'
              }}
            >
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Stack spacing={2.5}>
                  <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between">
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip icon={<AppsRoundedIcon />} label={`${products.length} produtos ativos`} color="primary" />
                      <Chip icon={<StorefrontRoundedIcon />} label={`${availableCount} prontos para venda`} color="success" variant="outlined" />
                      {buyerExperience ? (
                        <Chip icon={<ShoppingCartCheckoutRoundedIcon />} label={`${promoCount} em promocao`} color={promoCount ? 'warning' : 'default'} variant="outlined" />
                      ) : (
                        <Chip icon={<WarningAmberRoundedIcon />} label={`${lowStockCount} com estoque baixo`} color={lowStockCount ? 'warning' : 'default'} variant="outlined" />
                      )}
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                      {!buyerExperience ? (
                        <Button
                          variant="outlined"
                          color="inherit"
                          startIcon={<StorefrontRoundedIcon />}
                          onClick={() => navigate('/comprador/catalogo')}
                          sx={{ borderRadius: 3 }}
                        >
                          Ver portal do comprador
                        </Button>
                      ) : null}
                      <Button
                        variant={cart.length > 0 ? 'contained' : 'outlined'}
                        color="primary"
                        startIcon={(
                          <Badge badgeContent={cartQuantity} color="error" max={99}>
                            <ShoppingCartRoundedIcon />
                          </Badge>
                        )}
                        onClick={() => setCartOpen(true)}
                        sx={{ borderRadius: 3 }}
                      >
                        Ver carrinho
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<RefreshRoundedIcon />}
                        onClick={() => void loadCatalog(false)}
                        disabled={refreshing}
                        sx={{ borderRadius: 3 }}
                      >
                        Atualizar
                      </Button>
                    </Stack>
                  </Stack>

                  <Grid container spacing={1.5}>
                    <Grid item xs={12} lg={6}>
                      <ListFilterField
                        label="Filtrar catalogo"
                        placeholder="Nome, descricao, marca, codigo ou categoria"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        loading={refreshing}
                      />
                    </Grid>
                    <Grid item xs={12} lg={6}>
                      <ToggleButtonGroup
                        value={availabilityFilter}
                        exclusive
                        onChange={(_, value: CatalogAvailabilityFilter | null) => {
                          if (value) {
                            setAvailabilityFilter(value);
                          }
                        }}
                        sx={{ flexWrap: 'wrap', gap: 1 }}
                      >
                        <ToggleButton value="todos">Todos</ToggleButton>
                        <ToggleButton value="disponiveis">Prontos para venda</ToggleButton>
                        <ToggleButton value="semEstoque">Sem estoque</ToggleButton>
                      </ToggleButtonGroup>
                    </Grid>
                  </Grid>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip
                      label={`Todas as categorias (${products.length})`}
                      color={selectedCategory === 'todas' ? 'primary' : 'default'}
                      variant={selectedCategory === 'todas' ? 'filled' : 'outlined'}
                      onClick={() => setSelectedCategory('todas')}
                    />
                    {categories.map((category) => (
                      <Chip
                        key={category.key}
                        label={`${category.label} (${category.count})`}
                        color={selectedCategory === category.key ? 'primary' : 'default'}
                        variant={selectedCategory === category.key ? 'filled' : 'outlined'}
                        onClick={() => setSelectedCategory(category.key)}
                      />
                    ))}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* <Grid item xs={12} xl={4}>
            <Card
              sx={{
                borderRadius: 5,
                height: '100%',
                background: buyerExperience
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(245, 248, 255, 0.96))'
                  : undefined
              }}
            >
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6">{buyerExperience ? 'Feito para comprar bem' : 'Pronto para terminais'}</Typography>
                  <Typography color="text.secondary">
                    {buyerExperience
                      ? 'A vitrine do comprador destaca ofertas e itens selecionados pela operacao interna, sem fugir do estoque e do pedido real.'
                      : 'Os cards foram redesenhados para parecerem mais comerciais e funcionarem melhor em telas pequenas, sem soltar das regras de estoque, status ativo e venda real.'}
                  </Typography>
                  <Stack spacing={1}>
                    <Chip icon={<PhoneAndroidRoundedIcon />} label="Layout forte para mobile" variant="outlined" />
                    <Chip icon={<ShoppingCartRoundedIcon />} label={buyerExperience ? `${featuredCount} itens em destaque` : 'Carrinho integrado ao PDV'} variant="outlined" />
                    <Chip icon={<Inventory2RoundedIcon />} label={buyerExperience ? 'Oferta ligada ao estoque real' : 'Venda com validacao de estoque'} variant="outlined" />
                  </Stack>
                  {buyerExperience ? (
                    <Button
                      variant="outlined"
                      endIcon={<ArrowForwardRoundedIcon />}
                      onClick={() => navigate('/comprador/pedidos')}
                      sx={{ alignSelf: 'flex-start', borderRadius: 3 }}
                    >
                      Ver pedidos e entrega
                    </Button>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          </Grid> */}
        </Grid>

        {!canCheckout ? (
          <Alert severity="warning" sx={{ borderRadius: 4 }}>
            Seu usuario pode visualizar o catalogo, mas ainda nao possui nenhuma feature flag de fechamento para transformar o carrinho em pedido.
          </Alert>
        ) : null}

        {canCheckout && checkoutAvailability && !checkoutAvailability.disponivel ? (
          <Alert
            severity="warning"
            sx={{ borderRadius: 4 }}
            action={!buyerExperience ? (
              <Button color="inherit" size="small" onClick={() => navigate('/caixa')}>
                Abrir caixa
              </Button>
            ) : undefined}
          >
            {checkoutAvailability.mensagem}
          </Alert>
        ) : null}

        <Grid container spacing={2.5} alignItems="flex-start">
          <Grid item xs={12} ref={productsSectionRef}>
            {filteredProducts.length === 0 ? (
              <Alert severity="warning" sx={{ borderRadius: 4 }}>
                Nenhum produto atende aos filtros atuais. Ajuste categoria, disponibilidade ou busca para continuar.
              </Alert>
            ) : (
              <Grid container spacing={2}>
                {filteredProducts.map((product) => {
                  const cartItem = cart.find((item) => item.produtoId === product.produtoId) ?? null;
                  const canAdd = canCheckout && product.disponivelParaVenda && (!product.controlaEstoque || (cartItem?.quantidade ?? 0) < product.estoqueAtual);
                  const showLowStockBadge = !buyerExperience && product.disponivelParaVenda && product.estoqueBaixo;

                  return (
                    <Grid item xs={12} sm={6} lg={4} xl={3} key={product.produtoId}>
                      <Card
                        sx={{
                          height: '100%',
                          borderRadius: 5,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          background: buyerExperience && product.promocaoAtiva
                            ? 'linear-gradient(180deg, #fffdf8 0%, #fff3df 100%)'
                            : buyerExperience && product.destaqueCatalogoComprador
                              ? 'linear-gradient(180deg, #ffffff 0%, #edf5ff 100%)'
                              : 'linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%)',
                          border: product.disponivelParaVenda
                            ? buyerExperience && product.promocaoAtiva
                              ? '1px solid rgba(217, 119, 6, 0.24)'
                              : '1px solid rgba(23, 75, 138, 0.10)'
                            : '1px solid rgba(229, 57, 53, 0.18)',
                          boxShadow: product.disponivelParaVenda ? '0 18px 38px rgba(15, 23, 42, 0.08)' : '0 16px 32px rgba(127, 29, 29, 0.08)',
                          transition: 'transform 180ms ease, box-shadow 180ms ease',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.12)'
                          }
                        }}
                      >
                        <Box
                          sx={{
                            position: 'relative',
                            px: 2,
                            pt: 2,
                            pb: 1.5,
                            background: 'radial-gradient(circle at top left, rgba(209,127,52,0.14), transparent 45%), linear-gradient(135deg, rgba(23,75,138,0.08), rgba(23,75,138,0.02))'
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              {product.categoriaNome ? <Chip size="small" label={product.categoriaNome} variant="outlined" /> : null}
                              {buyerExperience && product.promocaoAtiva ? <Chip size="small" label={product.promocaoTitulo ?? 'Promocao'} color="warning" /> : null}
                              {buyerExperience && product.destaqueCatalogoComprador ? <Chip size="small" label="Destaque" color="primary" variant="outlined" /> : null}
                              {buyerExperience && product.promocaoAtiva && product.percentualDesconto ? (
                                <Chip size="small" icon={<LocalFireDepartmentRoundedIcon />} label={`${product.percentualDesconto}% OFF`} color="warning" variant="outlined" />
                              ) : null}
                              {buyerExperience && product.estoqueBaixo ? <Chip size="small" label="Ultimas unidades" color="error" variant="outlined" /> : null}
                              {showLowStockBadge ? <Chip size="small" label="Estoque baixo" color="warning" /> : null}
                            </Stack>
                            <Chip
                              size="small"
                              label={product.disponivelParaVenda ? 'Disponivel' : 'Indisponivel'}
                              color={product.disponivelParaVenda ? 'success' : 'error'}
                            />
                          </Stack>

                          <ButtonBase
                            onClick={() => openProductDetail(product)}
                            sx={{
                              mt: 1.5,
                              width: '100%',
                              minHeight: 180,
                              borderRadius: 4,
                              overflow: 'hidden',
                              bgcolor: 'rgba(255,255,255,0.88)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              transition: 'transform 180ms ease, box-shadow 180ms ease',
                              '& .catalog-product-image': {
                                transition: 'transform 180ms ease'
                              },
                              '&:hover .catalog-product-image': {
                                transform: 'scale(1.04)'
                              }
                            }}
                          >
                            {product.imagemUrl ? (
                              <CardMedia
                                component="img"
                                image={product.imagemUrl}
                                alt={product.nome}
                                className="catalog-product-image"
                                sx={{
                                  width: '100%',
                                  height: 180,
                                  objectFit: 'contain',
                                  p: 1.5
                                }}
                              />
                            ) : (
                              <Avatar
                                variant="rounded"
                                className="catalog-product-image"
                                sx={{
                                  width: 92,
                                  height: 92,
                                  fontSize: 34,
                                  fontWeight: 900,
                                  bgcolor: 'rgba(23, 75, 138, 0.14)',
                                  color: 'primary.main'
                                }}
                              >
                                {buildProductInitials(product.nome)}
                              </Avatar>
                            )}

                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                              sx={{
                                position: 'absolute',
                                right: 12,
                                bottom: 12,
                                px: 1,
                                py: 0.5,
                                borderRadius: 999,
                                bgcolor: 'rgba(15, 23, 42, 0.74)',
                                color: '#fff',
                                pointerEvents: 'none'
                              }}
                            >
                              <ZoomInRoundedIcon sx={{ fontSize: 18 }} />
                              <Typography variant="caption" sx={{ fontWeight: 800 }}>
                                Zoom
                              </Typography>
                            </Stack>
                          </ButtonBase>
                        </Box>

                        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
                          <Box>
                            <Typography
                              variant="h6"
                              sx={{
                                fontWeight: 900,
                                fontSize: '1.05rem',
                                lineHeight: 1.15,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {product.nome}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                mt: 0.75,
                                minHeight: 64,
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {product.catalogoResumo ?? product.descricao ?? 'Sem descricao detalhada cadastrada para este item.'}
                            </Typography>
                          </Box>

                          <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary">
                              {product.marca ?? product.codigoBarras ?? 'Sem marca ou codigo destacado'}
                            </Typography>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
                              <Box>
                                <Typography variant="h5" sx={{ fontWeight: 900, color: 'primary.main' }}>
                                  {formatCurrency(product.precoVenda)}
                                </Typography>
                                {buyerExperience && product.promocaoAtiva && product.precoOriginal ? (
                                  <Stack spacing={0.25}>
                                    <Typography variant="body2" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                                      {formatCurrency(product.precoOriginal)}
                                      {product.percentualDesconto ? ` · ${product.percentualDesconto}% off` : ''}
                                    </Typography>
                                    {getProductSavings(product) > 0 ? (
                                      <Typography variant="body2" sx={{ color: '#b45309', fontWeight: 800 }}>
                                        Economize {formatCurrency(getProductSavings(product))}
                                      </Typography>
                                    ) : null}
                                  </Stack>
                                ) : null}
                                <Typography variant="body2" color="text.secondary">
                                  {product.unidadeMedida}
                                  {product.controlaEstoque ? ` · estoque ${formatQuantity(product.estoqueAtual)}` : ' · estoque livre'}
                                </Typography>
                              </Box>
                              {cartItem ? (
                                <Chip
                                  icon={<ShoppingCartRoundedIcon />}
                                  label={`${formatQuantity(cartItem.quantidade)} no carrinho`}
                                  color="primary"
                                  variant="outlined"
                                />
                              ) : null}
                            </Stack>
                          </Stack>

                          <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
                            <Button
                              variant="text"
                              color="inherit"
                              onClick={() => openProductDetail(product)}
                              sx={{ borderRadius: 3, px: 1.75 }}
                            >
                              Detalhes
                            </Button>
                            <Button
                              variant={cartItem ? 'contained' : 'outlined'}
                              startIcon={<AddRoundedIcon />}
                              onClick={() => addToCart(product)}
                              disabled={!canAdd || submitting}
                              sx={{ flex: 1, borderRadius: 3 }}
                            >
                              {cartItem
                                ? 'Adicionar mais'
                                : buyerExperience && product.promocaoAtiva
                                  ? 'Aproveitar oferta'
                                  : buyerExperience
                                    ? 'Comprar agora'
                                    : 'Adicionar ao carrinho'}
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Grid>

        </Grid>
      </Stack>

      <Fab
        color="primary"
        onClick={() => setCartOpen(true)}
        sx={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: (theme) => theme.zIndex.drawer - 1,
          display: { xs: 'inline-flex', lg: 'none' }
        }}
      >
        <Badge badgeContent={cartQuantity} color="error" max={99}>
          <ShoppingCartRoundedIcon />
        </Badge>
      </Fab>

      <Drawer
        anchor="right"
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 460, lg: 520 },
            maxWidth: '100%',
            bgcolor: '#f7f9fc'
          }
        }}
      >
        <CatalogCartDrawerContent
          cart={cart}
          cartQuantity={cartQuantity}
          subtotal={subtotal}
          invalidCartItems={invalidCartItems}
          cartReadyToCheckout={cartReadyToCheckout}
          canCheckout={canCheckout}
          checkoutAvailability={checkoutAvailability}
          canUseClientDirectory={canUseClientDirectory}
          clients={clients}
          selectedClient={selectedClient}
          linkedClientName={linkedClientName}
          linkedClientId={linkedClientId}
          onClientChange={setSelectedClient}
          orderMode={orderMode}
          onOrderModeChange={setOrderMode}
          orderNote={orderNote}
          onOrderNoteChange={setOrderNote}
          updateCartQuantity={updateCartQuantity}
          removeFromCart={removeFromCart}
          clearCart={() => setCart([])}
          submitting={submitting}
          openPayment={() => setPaymentOpen(true)}
          goToCashier={() => navigate('/caixa')}
          onClose={() => setCartOpen(false)}
        />
      </Drawer>

      <ProductCatalogDetailDialog
        product={selectedProductSnapshot}
        cartItem={selectedProductCartItem}
        buyerExperience={buyerExperience}
        canAddToCart={Boolean(
          selectedProductSnapshot
            && canCheckout
            && selectedProductSnapshot.disponivelParaVenda
            && (!selectedProductSnapshot.controlaEstoque || (selectedProductCartItem?.quantidade ?? 0) < selectedProductSnapshot.estoqueAtual)
        )}
        submitting={submitting}
        imageZoomed={detailImageZoomed}
        imageTransformOrigin={detailImageTransformOrigin}
        onAddToCart={addToCart}
        onOpenCart={() => {
          setCartOpen(true);
          closeProductDetail();
        }}
        onClose={closeProductDetail}
        onImageClick={handleDetailImageClick}
        onImageMove={handleDetailImageMove}
      />

      <PaymentModal
        open={paymentOpen}
        total={subtotal}
        loading={submitting}
        allowEmitNfe={canEmitNfe}
        selectedClientId={selectedClient?.clienteId ?? linkedClientId ?? null}
        selectedClientName={selectedClient?.nome ?? linkedClientName ?? null}
        onRequestClientRegistration={canSelfRegisterBuyerProfile ? () => setBuyerClientDialogOpen(true) : undefined}
        onClose={() => setPaymentOpen(false)}
        onConfirm={({ payments, emitirNfe }) => void finalizeOrder(payments, emitirNfe)}
      />

      <BuyerClientProfileDialog
        open={buyerClientDialogOpen}
        initialClient={selectedClient}
        onClose={() => setBuyerClientDialogOpen(false)}
        onSaved={handleBuyerClientSaved}
      />
    </>
  );
}

interface ProductCatalogDetailDialogProps {
  product: ProdutoCatalogoItem | null;
  cartItem: CatalogCartItem | null;
  buyerExperience: boolean;
  canAddToCart: boolean;
  submitting: boolean;
  imageZoomed: boolean;
  imageTransformOrigin: string;
  onAddToCart: (product: ProdutoCatalogoItem) => void;
  onOpenCart: () => void;
  onClose: () => void;
  onImageClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onImageMove: (event: MouseEvent<HTMLButtonElement>) => void;
}

function ProductCatalogDetailDialog({
  product,
  cartItem,
  buyerExperience,
  canAddToCart,
  submitting,
  imageZoomed,
  imageTransformOrigin,
  onAddToCart,
  onOpenCart,
  onClose,
  onImageClick,
  onImageMove
}: ProductCatalogDetailDialogProps) {
  if (!product) {
    return null;
  }

  const stockLabel = product.controlaEstoque ? formatQuantity(product.estoqueAtual) : 'Livre';

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          borderRadius: { xs: 3, md: 4 },
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle component="div" sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: 1.1 }}>
              Detalhes do produto
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.15 }}>
              {product.nome}
            </Typography>
          </Box>
          <IconButton onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Stack spacing={1.5}>
              <ButtonBase
                onClick={onImageClick}
                onMouseMove={onImageMove}
                sx={{
                  width: '100%',
                  minHeight: { xs: 280, md: 420 },
                  borderRadius: 5,
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'radial-gradient(circle at top left, rgba(209,127,52,0.12), transparent 45%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(237,245,255,0.92))',
                  cursor: imageZoomed ? 'zoom-out' : 'zoom-in'
                }}
              >
                {product.imagemUrl ? (
                  <Box
                    component="img"
                    src={product.imagemUrl}
                    alt={product.nome}
                    sx={{
                      width: '100%',
                      height: { xs: 280, md: 420 },
                      objectFit: 'contain',
                      p: { xs: 2, md: 3 },
                      transform: imageZoomed ? 'scale(2.35)' : 'scale(1)',
                      transformOrigin: imageTransformOrigin,
                      transition: 'transform 180ms ease'
                    }}
                  />
                ) : (
                  <Avatar
                    variant="rounded"
                    sx={{
                      width: 140,
                      height: 140,
                      fontSize: 48,
                      fontWeight: 900,
                      bgcolor: 'rgba(23, 75, 138, 0.14)',
                      color: 'primary.main'
                    }}
                  >
                    {buildProductInitials(product.nome)}
                  </Avatar>
                )}

                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                  sx={{
                    position: 'absolute',
                    right: 16,
                    bottom: 16,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 999,
                    bgcolor: 'rgba(15, 23, 42, 0.78)',
                    color: '#fff',
                    pointerEvents: 'none'
                  }}
                >
                  <ZoomInRoundedIcon sx={{ fontSize: 18 }} />
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>
                    {imageZoomed ? 'Clique para voltar' : 'Clique para ampliar'}
                  </Typography>
                </Stack>
              </ButtonBase>

              <Typography variant="body2" color="text.secondary">
                {imageZoomed
                  ? 'Com o zoom ligado, mova o mouse para percorrer a imagem e clique novamente para voltar.'
                  : 'Clique na imagem para ampliar o produto e analisar melhor a embalagem.'}
              </Typography>
            </Stack>
          </Grid>

          <Grid item xs={12} md={6}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {product.categoriaNome ? <Chip size="small" label={product.categoriaNome} variant="outlined" /> : null}
                {buyerExperience && product.promocaoAtiva ? <Chip size="small" label={product.promocaoTitulo ?? 'Promocao'} color="warning" /> : null}
                {buyerExperience && product.destaqueCatalogoComprador ? <Chip size="small" label="Destaque" color="primary" variant="outlined" /> : null}
                {buyerExperience && product.estoqueBaixo ? <Chip size="small" label="Ultimas unidades" color="error" variant="outlined" /> : null}
                <Chip
                  size="small"
                  label={product.disponivelParaVenda ? 'Disponivel' : 'Indisponivel'}
                  color={product.disponivelParaVenda ? 'success' : 'error'}
                />
              </Stack>

              <Box>
                <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main', lineHeight: 1 }}>
                  {formatCurrency(product.precoVenda)}
                </Typography>
                {buyerExperience && product.promocaoAtiva && product.precoOriginal ? (
                  <Stack spacing={0.35} sx={{ mt: 0.75 }}>
                    <Typography variant="body1" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                      {formatCurrency(product.precoOriginal)}
                      {product.percentualDesconto ? ` · ${product.percentualDesconto}% off` : ''}
                    </Typography>
                    {getProductSavings(product) > 0 ? (
                      <Typography variant="body2" sx={{ color: '#b45309', fontWeight: 800 }}>
                        Economize {formatCurrency(getProductSavings(product))}
                      </Typography>
                    ) : null}
                  </Stack>
                ) : null}
              </Box>

              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                {product.catalogoResumo ?? product.descricao ?? 'Sem descricao detalhada cadastrada para este item.'}
              </Typography>

              <Grid container spacing={1.25}>
                <Grid item xs={12} sm={6}>
                  <SummaryInfoCard label="Marca" value={product.marca ?? 'Sem marca'} tone="neutral" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <SummaryInfoCard label="Unidade" value={product.unidadeMedida} tone="primary" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <SummaryInfoCard label="Estoque" value={stockLabel} tone={product.estoqueBaixo ? 'neutral' : 'success'} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <SummaryInfoCard label="Codigo" value={product.codigoBarras ?? 'Nao informado'} tone="neutral" />
                </Grid>
              </Grid>

              {cartItem ? (
                <Alert
                  severity="info"
                  sx={{ borderRadius: 3 }}
                  action={(
                    <Button color="inherit" size="small" onClick={onOpenCart}>
                      Ver carrinho
                    </Button>
                  )}
                >
                  Este produto ja tem {formatQuantity(cartItem.quantidade)} unidade(s) no carrinho.
                </Alert>
              ) : null}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant={cartItem ? 'contained' : 'outlined'}
                  size="large"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => onAddToCart(product)}
                  disabled={!canAddToCart || submitting}
                  sx={{ flex: 1, borderRadius: 3 }}
                >
                  {cartItem
                    ? 'Adicionar mais'
                    : buyerExperience && product.promocaoAtiva
                      ? 'Aproveitar oferta'
                      : buyerExperience
                        ? 'Comprar agora'
                        : 'Adicionar ao carrinho'}
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  size="large"
                  onClick={onClose}
                  sx={{ borderRadius: 3 }}
                >
                  Continuar navegando
                </Button>
              </Stack>
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
}

interface CatalogCartDrawerContentProps {
  cart: CatalogCartItem[];
  cartQuantity: number;
  subtotal: number;
  invalidCartItems: CatalogCartItem[];
  cartReadyToCheckout: boolean;
  canCheckout: boolean;
  checkoutAvailability: CheckoutDisponibilidade | null;
  canUseClientDirectory: boolean;
  clients: Cliente[];
  selectedClient: Cliente | null;
  linkedClientName: string | null;
  linkedClientId: string | null;
  onClientChange: (client: Cliente | null) => void;
  orderMode: AtendimentoPedidoTipo;
  onOrderModeChange: (mode: AtendimentoPedidoTipo) => void;
  orderNote: string;
  onOrderNoteChange: (value: string) => void;
  updateCartQuantity: (produtoId: string, delta: number) => void;
  removeFromCart: (produtoId: string) => void;
  clearCart: () => void;
  submitting: boolean;
  openPayment: () => void;
  goToCashier: () => void;
  onClose: () => void;
}

function CatalogCartDrawerContent({
  cart,
  cartQuantity,
  subtotal,
  invalidCartItems,
  cartReadyToCheckout,
  canCheckout,
  checkoutAvailability,
  canUseClientDirectory,
  clients,
  selectedClient,
  linkedClientName,
  linkedClientId,
  onClientChange,
  orderMode,
  onOrderModeChange,
  orderNote,
  onOrderNoteChange,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  submitting,
  openPayment,
  goToCashier,
  onClose
}: CatalogCartDrawerContentProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.5}
        sx={{
          px: { xs: 2, md: 3 },
          py: 2,
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          bgcolor: 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(12px)'
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Carrinho do pedido
          </Typography>
          <Typography color="text.secondary">
            Revise o pedido e finalize quando estiver tudo certo.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip icon={<ShoppingCartRoundedIcon />} label={`${formatQuantity(cartQuantity)} item(ns)`} color="primary" />
          <IconButton onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, md: 3 }, py: 2.5 }}>
        <Stack spacing={2.25}>
          {canUseClientDirectory ? (
            <Autocomplete
              fullWidth
              options={clients}
              value={selectedClient}
              onChange={(_, client) => onClientChange(client)}
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
                <ListFilterField
                  {...params}
                  label="Cliente do pedido"
                  placeholder="Opcional: selecione para refletir na venda"
                />
              )}
            />
          ) : linkedClientId ? (
            <Alert severity="success" sx={{ borderRadius: 3 }}>
              Pedido vinculado automaticamente ao comprador <strong>{linkedClientName ?? 'cliente autenticado'}</strong>.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              O pedido sera fechado como consumidor final, porque a base de clientes nao esta liberada para este usuario.
            </Alert>
          )}

          {!canCheckout ? (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              Este usuario esta em modo consulta. O carrinho so vira pedido quando a feature flag de fechamento for habilitada.
            </Alert>
          ) : null}

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack spacing={1.5}>
              <Typography sx={{ fontWeight: 800 }}>Fluxo do pedido</Typography>
              <ToggleButtonGroup
                value={orderMode}
                exclusive
                onChange={(_, value: AtendimentoPedidoTipo | null) => {
                  if (value) {
                    onOrderModeChange(value);
                  }
                }}
                sx={{ flexWrap: 'wrap', gap: 1 }}
              >
                <ToggleButton value="Retirada">Retirada no local</ToggleButton>
                <ToggleButton value="Entrega">Entrega em domicilio</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary">
                {orderMode === 'Entrega'
                  ? 'A entrega usa o endereco cadastrado do cliente vinculado ao pedido. Garanta que o cadastro esteja completo antes do fechamento.'
                  : 'Na retirada, o cliente acompanha o preparo e recebe aviso quando o pedido estiver pronto.'}
              </Typography>
              <TextField
                label="Observacao do pedido"
                value={orderNote}
                onChange={(event) => onOrderNoteChange(event.target.value)}
                placeholder="Ex.: retirar na portaria, sem cebola, tocar interfone ao chegar."
                multiline
                minRows={2}
                fullWidth
              />
            </Stack>
          </Paper>

          {cart.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Adicione produtos no catalogo para montar o pedido. O contador do carrinho sobe automaticamente a cada inclusao.
            </Alert>
          ) : (
            <Stack spacing={1.25}>
              {cart.map((item) => {
                const itemTotal = item.quantidade * item.precoVenda;
                const itemInvalid = !item.disponivelParaVenda || (item.controlaEstoque && item.quantidade > item.estoqueAtual);

                return (
                  <Paper
                    key={item.produtoId}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 3,
                      borderColor: itemInvalid ? 'warning.main' : 'rgba(23, 75, 138, 0.12)'
                    }}
                  >
                    <Stack spacing={1.25}>
                      <Stack direction="row" spacing={1.25} alignItems="flex-start">
                        {item.imagemUrl ? (
                          <Box
                            component="img"
                            src={item.imagemUrl}
                            alt={item.nome}
                            sx={{
                              width: 60,
                              height: 60,
                              borderRadius: 2,
                              objectFit: 'contain',
                              bgcolor: 'rgba(23, 75, 138, 0.04)',
                              p: 0.75
                            }}
                          />
                        ) : (
                          <Avatar variant="rounded" sx={{ width: 60, height: 60, bgcolor: 'rgba(23, 75, 138, 0.12)', color: 'primary.main', fontWeight: 900 }}>
                            {buildProductInitials(item.nome)}
                          </Avatar>
                        )}

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                            {item.nome}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {item.marca ?? item.unidadeMedida}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {formatCurrency(item.precoVenda)} · {item.unidadeMedida}
                          </Typography>
                        </Box>

                        <IconButton color="error" onClick={() => removeFromCart(item.produtoId)}>
                          <DeleteOutlineRoundedIcon />
                        </IconButton>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={1} alignItems="center">
                          <IconButton
                            size="small"
                            onClick={() => updateCartQuantity(item.produtoId, -1)}
                            sx={{ border: '1px solid rgba(15, 23, 42, 0.08)' }}
                          >
                            <RemoveRoundedIcon fontSize="small" />
                          </IconButton>
                          <Typography sx={{ minWidth: 38, textAlign: 'center', fontWeight: 800 }}>
                            {formatQuantity(item.quantidade)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => updateCartQuantity(item.produtoId, 1)}
                            disabled={item.controlaEstoque && item.quantidade >= item.estoqueAtual}
                            sx={{ border: '1px solid rgba(15, 23, 42, 0.08)' }}
                          >
                            <AddRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>

                        <Box sx={{ textAlign: 'right' }}>
                          <Typography sx={{ fontWeight: 900 }}>{formatCurrency(itemTotal)}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.controlaEstoque ? `estoque ${formatQuantity(item.estoqueAtual)}` : 'sem baixa'}
                          </Typography>
                        </Box>
                      </Stack>

                      {itemInvalid ? (
                        <Alert severity="warning" sx={{ borderRadius: 2 }}>
                          Este item precisa de revisao antes do fechamento. Ele ficou indisponivel ou a quantidade no carrinho superou o estoque atual.
                        </Alert>
                      ) : null}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}

          <Divider />

          <Grid container spacing={1.25}>
            <Grid item xs={12} sm={4}>
              <SummaryInfoCard label="Subtotal" value={formatCurrency(subtotal)} tone="neutral" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <SummaryInfoCard label="Itens" value={formatQuantity(cartQuantity)} tone="primary" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <SummaryInfoCard label="Total do pedido" value={formatCurrency(subtotal)} tone="success" />
            </Grid>
          </Grid>

          {invalidCartItems.length > 0 ? (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              O carrinho tem {invalidCartItems.length} item(ns) com problema de disponibilidade ou estoque. Ajuste antes de finalizar.
            </Alert>
          ) : null}

          <Alert severity="info" sx={{ borderRadius: 3 }}>
            O fechamento usa o mesmo processo do PDV: valida operacao disponivel, estoque, cliente ativo, pagamentos, troco e emissao opcional de NF-e, mas ja nasce com trilha profissional de preparo, retirada ou entrega.
          </Alert>
        </Stack>
      </Box>

      <Box
        sx={{
          borderTop: '1px solid rgba(15, 23, 42, 0.08)',
          px: { xs: 2, md: 3 },
          py: 2,
          bgcolor: 'rgba(255,255,255,0.96)'
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography color="text.secondary">Total do pedido</Typography>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              {formatCurrency(subtotal)}
            </Typography>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Button
              variant="contained"
              size="large"
              startIcon={<ShoppingCartCheckoutRoundedIcon />}
              onClick={openPayment}
              disabled={!canCheckout || !checkoutAvailability?.disponivel || !cartReadyToCheckout || submitting}
              sx={{ flex: 1, borderRadius: 3 }}
            >
              Finalizar pedido
            </Button>
            <Button
              variant="outlined"
              size="large"
              color="inherit"
              onClick={clearCart}
              disabled={cart.length === 0 || submitting}
              sx={{ borderRadius: 3 }}
            >
              Limpar carrinho
            </Button>
          </Stack>

          {checkoutAvailability && !checkoutAvailability.disponivel && canCheckout ? (
            <Button variant="text" onClick={goToCashier}>
              Ir para operacao de caixa
            </Button>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}

interface SummaryInfoCardProps {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'neutral';
}

function SummaryInfoCard({ label, value, tone }: SummaryInfoCardProps) {
  const backgroundByTone = {
    primary: 'linear-gradient(135deg, rgba(23, 75, 138, 0.14), rgba(23, 75, 138, 0.05))',
    success: 'linear-gradient(135deg, rgba(46, 125, 50, 0.18), rgba(46, 125, 50, 0.06))',
    neutral: 'linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.03))'
  } as const;

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 3,
        background: backgroundByTone[tone],
        height: '100%'
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ mt: 0.75, fontWeight: 900 }}>
        {value}
      </Typography>
    </Box>
  );
}

function normalizeCatalogFilter(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function buildProductInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'PD';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value);
}

function getProductSavings(product: ProdutoCatalogoItem) {
  if (!product.promocaoAtiva || !product.precoOriginal || product.precoOriginal <= product.precoVenda) {
    return 0;
  }

  return product.precoOriginal - product.precoVenda;
}

function ShoppingBagRoundedIconFallback() {
  return <LoyaltyRoundedIcon />;
}

function buildCatalogCartStorageKey(empresaId: string | null | undefined, usuarioId: string | null | undefined) {
  return `pdv:catalogo:carrinho:${empresaId ?? 'sem-empresa'}:${usuarioId ?? 'sem-usuario'}`;
}

function readPersistedCatalogCartState(storageKey: string): PersistedCatalogCartState | null {
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedCatalogCartState> | null;
    if (!parsed || !Array.isArray(parsed.items)) {
      return null;
    }

    return {
      items: parsed.items
        .flatMap((item) => {
          if (!item || typeof item.produtoId !== 'string' || typeof item.quantidade !== 'number' || item.quantidade <= 0) {
            return [];
          }

          return [{
            produtoId: item.produtoId,
            quantidade: item.quantidade
          }];
        }),
      selectedClientId: typeof parsed.selectedClientId === 'string' ? parsed.selectedClientId : null,
      orderMode: parsed.orderMode === 'Entrega' ? 'Entrega' : 'Retirada',
      orderNote: typeof parsed.orderNote === 'string' ? parsed.orderNote : '',
      cartOpen: parsed.cartOpen === true
    };
  } catch {
    return null;
  }
}

function writePersistedCatalogCartState(storageKey: string, state: PersistedCatalogCartState) {
  const hasMeaningfulState = state.items.length > 0;

  if (!hasMeaningfulState) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function buildCartFromPersistedState(items: PersistedCatalogCartLine[], products: ProdutoCatalogoItem[]): CatalogCartItem[] {
  return items.flatMap((item) => {
    const product = products.find((candidate) => candidate.produtoId === item.produtoId);
    if (!product) {
      return [];
    }

    return [{
      produtoId: product.produtoId,
      nome: product.nome,
      descricao: product.descricao,
      imagemUrl: product.imagemUrl,
      marca: product.marca,
      precoVenda: product.precoVenda,
      unidadeMedida: product.unidadeMedida,
      quantidade: item.quantidade,
      estoqueAtual: product.estoqueAtual,
      controlaEstoque: product.controlaEstoque,
      disponivelParaVenda: product.disponivelParaVenda
    }];
  });
}
