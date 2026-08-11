import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ImageSearchRoundedIcon from '@mui/icons-material/ImageSearchRounded';
import PhotoCameraBackRoundedIcon from '@mui/icons-material/PhotoCameraBackRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import axios from 'axios';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Checkbox,
  Chip,
  CircularProgress,
  DialogActions,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
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
import { useDeferredValue, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { DetachableDialog } from '../components/common/DetachableDialog';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { MoneyInput } from '../components/common/MoneyInput';
import { RemoteProductImageDialog } from '../components/scanner/RemoteProductImageDialog';
import { useAuth } from '../contexts/AuthContext';
import { ScannerActionBar } from '../components/scanner/ScannerActionBar';
import { useScanner } from '../hooks/useScanner';
import { clientService } from '../services/clientService';
import {
  productService,
  type ProdutoCampoCustomizadoPayload,
  type ProdutoCampoPadraoPayload,
  type ProdutoFornecedorPayload,
  type ProdutoPayload
} from '../services/productService';
import { stockService, type RegistrarEntradaLotePayload } from '../services/stockService';
import type {
  Cliente,
  EstoqueLote,
  EmpresaRegimeTributario,
  FiscalNcm,
  PoliticaBaixaEstoqueLote,
  Produto,
  ProdutoBaseExternaStatus,
  ProdutoCampoPadrao,
  ProdutoCatalogoExternoConsulta,
  ProdutoCodigoTipo,
  ProdutoFiscalAssistenteContexto,
  ProdutoImagemUpload,
  ProdutoFiscalSugestaoNcm,
  ProdutoPerfilFiscalPadrao
} from '../types';
import { formatCpfCnpj, onlyDigits } from '../utils/br';
import { readDetachedDialogSession, removeDetachedDialogSession } from '../utils/detachedDialogSession';
import { formatCurrency } from '../utils/format';
import { canAccessClientsFeature } from '../utils/featureAccess';
import { getErrorMessage } from '../utils/http';
import { optimizeProductImageFile, parseProductImageCapturePayload, PRODUCT_IMAGE_SCANNER_CONTEXT } from '../utils/productImageCapture';
import { mergeCapturedDataIntoProductForm, type ProductCaptureSupplierHints } from '../utils/productCapture';

const productCodeTypeOptions: Array<{ value: ProdutoCodigoTipo; label: string }> = [
  { value: 'Ean', label: 'EAN / codigo de barras' },
  { value: 'Qr', label: 'QR Code' },
  { value: 'Interno', label: 'Codigo interno' }
];

const lotPolicyOptions: Array<{ value: PoliticaBaixaEstoqueLote; label: string; description: string }> = [
  {
    value: 'FEFO',
    label: 'FEFO',
    description: 'Baixa primeiro o lote com vencimento mais proximo.'
  },
  {
    value: 'FIFO',
    label: 'FIFO',
    description: 'Baixa primeiro o lote mais antigo pela data de entrada.'
  }
];
const defaultLotPolicyOption = lotPolicyOptions.find((item) => item.value === 'FEFO')!;

const fiscalProfileOptions: Array<{ value: ProdutoPerfilFiscalPadrao; label: string; description: string }> = [
  {
    value: 'RevendaMercadoria',
    label: 'Revenda',
    description: 'Sugere 1102/2102 para compra e 5102/6102 para venda de mercadoria de terceiros.'
  },
  {
    value: 'ProducaoEstabelecimento',
    label: 'Producao propria',
    description: 'Sugere 1101/2101 para entrada e 5101/6101 para saida de producao do estabelecimento.'
  },
  {
    value: 'Servico',
    label: 'Servico',
    description: 'Exige revisao tributaria especifica porque servicos nao seguem o mesmo fluxo padrao de mercadoria.'
  },
  {
    value: 'Industrializacao',
    label: 'Industrializacao',
    description: 'Use quando o item participa de industrializacao por encomenda ou operacao industrial especifica.'
  },
  {
    value: 'Bonificacao',
    label: 'Bonificacao',
    description: 'Perfil para bonificacao ou remessa sem valor comercial direto.'
  },
  {
    value: 'Devolucao',
    label: 'Devolucao',
    description: 'Exige referencia da operacao original antes da emissao fiscal.'
  },
  {
    value: 'Transferencia',
    label: 'Transferencia',
    description: 'Use para transferencia entre unidades com fiscalidade propria.'
  }
];

const fiscalOriginOptions = [
  { codigo: '0', descricao: 'Nacional', detalhe: 'Mercadoria nacional.' },
  { codigo: '1', descricao: 'Estrangeira importacao direta', detalhe: 'Importada diretamente.' },
  { codigo: '2', descricao: 'Estrangeira adquirida no mercado interno', detalhe: 'Importada por terceiro.' },
  { codigo: '3', descricao: 'Nacional com conteudo de importacao superior a 40%', detalhe: 'Conteudo de importacao acima de 40%.' },
  { codigo: '4', descricao: 'Nacional conforme processo produtivo basico', detalhe: 'Produzida conforme PPB.' },
  { codigo: '5', descricao: 'Nacional com conteudo de importacao inferior ou igual a 40%', detalhe: 'Conteudo de importacao ate 40%.' },
  { codigo: '6', descricao: 'Estrangeira importacao direta sem similar nacional', detalhe: 'Sem similar nacional.' },
  { codigo: '7', descricao: 'Estrangeira adquirida no mercado interno sem similar nacional', detalhe: 'Sem similar nacional.' },
  { codigo: '8', descricao: 'Nacional com conteudo de importacao superior a 70%', detalhe: 'Conteudo de importacao acima de 70%.' }
];

const emptyForm: ProdutoPayload = {
  categoriaId: null,
  clienteFornecedorId: null,
  codigoBarras: null,
  tipoCodigoPrincipal: 'Ean',
  nome: '',
  descricao: null,
  marca: null,
  ncm: null,
  cest: null,
  origemFiscal: null,
  perfilFiscalPadrao: null,
  cfopVendaPadrao: null,
  cfopVendaInterestadual: null,
  cfopCompraPadrao: null,
  cfopCompraInterestadual: null,
  csosn: null,
  cstIcms: null,
  cstPis: null,
  cstCofins: null,
  beneficioFiscalCodigo: null,
  codigoAnp: null,
  unidadeTributavel: 'UN',
  exTipi: null,
  aliquotaIcms: null,
  aliquotaIpi: null,
  aliquotaPis: null,
  aliquotaCofins: null,
  imagemUrl: null,
  catalogoResumo: null,
  destaqueCatalogoComprador: false,
  precoPromocional: null,
  promocaoTitulo: null,
  promocaoInicioUtc: null,
  promocaoFimUtc: null,
  codigoProdutoFornecedor: null,
  ultimaNotaFiscalCompra: null,
  precoVenda: 0,
  precoCusto: 0,
  estoqueAtual: 0,
  estoqueMinimo: 0,
  unidadeMedida: 'UN',
  ativo: true,
  controlaEstoque: true,
  controlaLote: false,
  politicaBaixaLote: 'FEFO',
  codigosAlternativos: [],
  camposCustomizados: [],
  fornecedores: [],
  justificativaFiscalManual: null,
  confirmaPisCofinsDiferentes: false
};

const emptySupplierLink: ProdutoFornecedorPayload = {
  clienteFornecedorId: null,
  codigoProdutoFornecedor: null,
  nomeProdutoFornecedor: null,
  precoCompra: null,
  quantidadeMinima: null,
  prazoEntregaDias: null,
  ultimaCompraEm: null,
  ultimoPrecoPago: null,
  fornecedorPrincipal: false,
  ativo: true
};
const trackedProductFieldPresets = [
  { key: 'lote', label: 'Lote' },
  { key: 'fabricacao', label: 'Fabricacao' },
  { key: 'validade', label: 'Validade' }
] as const;

const externalCatalogMetadataFieldKeys = {
  provider: 'Catalogo externo - provedor',
  reference: 'Catalogo externo - referencia',
  searchedTerm: 'Catalogo externo - termo pesquisado',
  sourceUrl: 'Catalogo externo - link da fonte',
  searchUrl: 'Catalogo externo - link da busca'
} as const;

type ProductFieldErrorKey =
  | 'ncm'
  | 'cest'
  | 'perfilFiscalPadrao'
  | 'origemFiscal'
  | 'cfopCompraPadrao'
  | 'cfopCompraInterestadual'
  | 'cfopVendaPadrao'
  | 'cfopVendaInterestadual'
  | 'csosn'
  | 'cstIcms'
  | 'cstPis'
  | 'cstCofins'
  | 'beneficioFiscalCodigo'
  | 'codigoAnp'
  | 'unidadeTributavel'
  | 'exTipi'
  | 'aliquotaIcms'
  | 'aliquotaIpi'
  | 'aliquotaPis'
  | 'aliquotaCofins'
  | 'justificativaFiscalManual'
  | 'confirmaPisCofinsDiferentes';

interface ProductDetachedSession {
  editingProduct: Produto | null;
  form: ProdutoPayload;
  externalLookup: ProdutoCatalogoExternoConsulta | null;
  visualSearchTerm: string;
  visualSearchFileName: string;
  dialogError: string | null;
}

interface ProductLotEntryFormState {
  codigoLote: string;
  quantidadeEntrada: number;
  dataEntrada: string;
  dataFabricacao: string;
  dataValidade: string;
  precoCustoUnitario: number | null;
  documentoReferencia: string;
  observacao: string;
}

type ExternalLookupRequestOrigin = 'gtin' | 'description-manual' | 'description-auto' | 'image-manual' | 'image-auto';
type ExternalLookupApplyMode = 'auto' | 'manual';

const PRODUCT_DIALOG_PATH = '/produtos';
const emptyManualAliquotaState = {
  aliquotaIcms: false,
  aliquotaIpi: false,
  aliquotaPis: false,
  aliquotaCofins: false
};

const fiscalFieldErrorKeys: ProductFieldErrorKey[] = [
  'ncm',
  'cest',
  'perfilFiscalPadrao',
  'origemFiscal',
  'cfopCompraPadrao',
  'cfopCompraInterestadual',
  'cfopVendaPadrao',
  'cfopVendaInterestadual',
  'csosn',
  'cstIcms',
  'cstPis',
  'cstCofins',
  'beneficioFiscalCodigo',
  'codigoAnp',
  'unidadeTributavel',
  'exTipi',
  'aliquotaIcms',
  'aliquotaIpi',
  'aliquotaPis',
  'aliquotaCofins',
  'justificativaFiscalManual',
  'confirmaPisCofinsDiferentes'
];

export function ProductsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [products, setProducts] = useState<Produto[]>([]);
  const [supplierClients, setSupplierClients] = useState<Cliente[]>([]);
  const [fieldTemplates, setFieldTemplates] = useState<ProdutoCampoPadrao[]>([]);
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Produto[]>([]);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);
  const [resolvingCode, setResolvingCode] = useState(false);
  const [externalCatalogStatus, setExternalCatalogStatus] = useState<ProdutoBaseExternaStatus | null>(null);
  const [fiscalContext, setFiscalContext] = useState<ProdutoFiscalAssistenteContexto | null>(null);
  const [externalLookup, setExternalLookup] = useState<ProdutoCatalogoExternoConsulta | null>(null);
  const [externalLookupLoading, setExternalLookupLoading] = useState(false);
  const [externalLookupLoadingOrigin, setExternalLookupLoadingOrigin] = useState<ExternalLookupRequestOrigin | null>(null);
  const [externalLookupOrigin, setExternalLookupOrigin] = useState<ExternalLookupRequestOrigin | null>(null);
  const [externalLookupFeedback, setExternalLookupFeedback] = useState<string | null>(null);
  const [externalLookupSearchTerm, setExternalLookupSearchTerm] = useState('');
  const [visualSearchTerm, setVisualSearchTerm] = useState('');
  const [visualSearchFileName, setVisualSearchFileName] = useState('');
  const [ncmOptions, setNcmOptions] = useState<FiscalNcm[]>([]);
  const [ncmOptionsLoading, setNcmOptionsLoading] = useState(false);
  const [quickCreatingNcm, setQuickCreatingNcm] = useState(false);
  const [importingNcmTable, setImportingNcmTable] = useState(false);
  const [applyingFiscalSuggestion, setApplyingFiscalSuggestion] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateDrafts, setTemplateDrafts] = useState<ProdutoCampoPadraoPayload[]>([]);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [templateDialogError, setTemplateDialogError] = useState<string | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Produto | null>(null);
  const [deletePermanent, setDeletePermanent] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [form, setForm] = useState<ProdutoPayload>(emptyForm);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProductFieldErrorKey, string>>>({});
  const [manualAliquotaFields, setManualAliquotaFields] = useState(emptyManualAliquotaState);
  const [productLots, setProductLots] = useState<EstoqueLote[]>([]);
  const [loadingProductLots, setLoadingProductLots] = useState(false);
  const [productLotsError, setProductLotsError] = useState<string | null>(null);
  const [onlyLotsWithBalance, setOnlyLotsWithBalance] = useState(true);
  const [registeringLotEntry, setRegisteringLotEntry] = useState(false);
  const [lotEntryError, setLotEntryError] = useState<string | null>(null);
  const [lotEntryForm, setLotEntryForm] = useState<ProductLotEntryFormState>(createEmptyLotEntryFormState);
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [productImageRemoteDialogOpen, setProductImageRemoteDialogOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedDetachedSessionRef = useRef<string | null>(null);
  const lastAutomaticFiscalSuggestionKeyRef = useRef<string | null>(null);
  const externalLookupRequestIdRef = useRef(0);
  const dismissedAutoLookupTermRef = useRef<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, session } = useAuth();
  const [searchParams] = useSearchParams();
  const detachedWindow = searchParams.get('detachedWindow') === '1';
  const detachedSessionKey = searchParams.get('detachedSession');
  const deferredSearch = useDeferredValue(search);
  const deferredNcmSearch = useDeferredValue(form.ncm ?? '');
  const deferredExternalLookupName = useDeferredValue(form.nome);
  const canViewClientsModule = canAccessClientsFeature(session);
  const canCreateProduct = hasPermission('CriarProduto');
  const canEditProduct = hasPermission('EditarProduto');
  const canDeleteProduct = hasPermission('ExcluirProduto');
  const canManageCompanyFiscal = hasPermission('GerenciarEmpresaFiscal');
  const canPersistCurrentProduct = editingProduct ? canEditProduct : canCreateProduct;
  const selectedSupplier = supplierClients.find((item) => item.clienteId === form.clienteFornecedorId) ?? null;
  const selectedSupplierDocument = selectedSupplier?.documento ?? null;
  const regimeTributarioEmpresa = fiscalContext?.regimeTributarioEmpresa ?? null;
  const fiscalProfiles = fiscalContext?.perfisFiscais ?? [];
  const fiscalOrigins = fiscalContext?.origensFiscais ?? [];
  const fiscalCsosns = fiscalContext?.csosns ?? [];
  const fiscalCstIcms = fiscalContext?.cstIcms ?? [];
  const fiscalCstPisCofins = fiscalContext?.cstPisCofins ?? [];
  const fiscalBeneficios = fiscalContext?.beneficiosFiscais ?? [];
  const availableFiscalProfiles = fiscalProfiles.length
    ? fiscalProfiles.map((item) => ({
      value: item.codigo as ProdutoPerfilFiscalPadrao,
      label: item.descricao,
      description: item.detalhe ?? getFiscalProfileDescription(item.codigo as ProdutoPerfilFiscalPadrao)
    }))
    : fiscalProfileOptions;
  const availableOrigins = fiscalOrigins.length
    ? fiscalOrigins
    : fiscalOriginOptions;
  const availableCsosnOptions = fiscalCsosns.length
    ? fiscalCsosns.map((item) => item.codigo)
    : ['101', '102', '103', '201', '202', '203', '300', '400', '500', '900'];
  const availableCstIcmsOptions = fiscalCstIcms.length
    ? fiscalCstIcms.map((item) => item.codigo)
    : ['00', '10', '20', '30', '40', '41', '50', '51', '60', '70', '90'];
  const availableCstPisCofinsOptions = fiscalCstPisCofins.length
    ? fiscalCstPisCofins
    : [];
  const availableBeneficioFiscalOptions = fiscalBeneficios.length
    ? fiscalBeneficios
    : [];
  const empresaUsaSimples = isSimplesRegime(regimeTributarioEmpresa);
  const sugestaoPisCofins = getPisCofinsSuggestion(regimeTributarioEmpresa, form.cstPis);
  const aliquotasAlteradasManualmente = hasManualAliquotaOverride(form, sugestaoPisCofins);
  const pisCofinsDiferentes = Boolean(form.cstPis && form.cstCofins && form.cstPis !== form.cstCofins);
  const normalizedNcm = onlyDigits(form.ncm);
  const normalizedExternalLookupName = normalizeExternalCatalogSearchTerm(form.nome);
  const normalizedVisualSearchTerm = normalizeExternalCatalogSearchTerm(visualSearchTerm);
  const normalizedEditingProductName = normalizeExternalCatalogSearchTerm(editingProduct?.nome ?? '');
  const externalCatalogEnabled = externalCatalogStatus?.disponivel ?? true;
  const externalNameLookupRunning = externalLookupLoading && isDescriptionLookupOrigin(externalLookupLoadingOrigin);
  const externalVisualLookupRunning = externalLookupLoading && isVisualLookupOrigin(externalLookupLoadingOrigin);
  const matchingNcmOption = normalizedNcm
    ? ncmOptions.find((item) => item.codigo === normalizedNcm) ?? null
    : null;
  const canApplyFiscalSuggestion = normalizedNcm.length === 8;
  const savedLotControlEnabled = Boolean(editingProduct?.controlaLote);
  const lotControlPendingSave = Boolean(editingProduct && form.controlaLote && !editingProduct.controlaLote);
  const selectedLotPolicy = lotPolicyOptions.find((item) => item.value === (form.politicaBaixaLote ?? 'FEFO')) ?? defaultLotPolicyOption;
  const canRegisterLotEntry = Boolean(
    editingProduct &&
    savedLotControlEnabled &&
    lotEntryForm.codigoLote.trim() &&
    lotEntryForm.quantidadeEntrada > 0 &&
    lotEntryForm.dataEntrada
  );
  const precisaJustificativaFiscal = manualAliquotaFields.aliquotaIcms
    || manualAliquotaFields.aliquotaPis
    || manualAliquotaFields.aliquotaCofins
    || aliquotasAlteradasManualmente
    || pisCofinsDiferentes;
  const productNameHelperText = buildProductNameLookupHelperText(
    normalizedExternalLookupName,
    externalCatalogStatus,
    externalLookup,
    externalLookupOrigin,
    externalLookupLoadingOrigin,
    externalLookupSearchTerm,
    externalLookupFeedback
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (loading || !detachedWindow || !detachedSessionKey || hydratedDetachedSessionRef.current === detachedSessionKey) {
      return;
    }

    const sessionData = readDetachedDialogSession<ProductDetachedSession>(detachedSessionKey);
    hydratedDetachedSessionRef.current = detachedSessionKey;

    if (!sessionData) {
      return;
    }

    setEditingProduct(sessionData.editingProduct ? normalizeProduct(sessionData.editingProduct) : null);
    setExternalLookup(sessionData.externalLookup);
    setForm(buildProductFormWithTemplates(normalizeProductForm(sessionData.form), fieldTemplates));
    setVisualSearchTerm(sessionData.visualSearchTerm ?? '');
    setVisualSearchFileName(sessionData.visualSearchFileName ?? '');
    setDialogError(sessionData.dialogError);
    setFieldErrors(sessionData.dialogError ? buildProductFieldErrors(sessionData.dialogError) : {});
    setManualAliquotaFields(emptyManualAliquotaState);
    setDialogOpen(true);
  }, [detachedSessionKey, detachedWindow, fieldTemplates, loading]);

  useEffect(() => {
    let active = true;
    const normalizedTerm = deferredSearch.trim();

    if (!normalizedTerm) {
      setSearchSuggestions([]);
      setSearchSuggestionsLoading(false);
      return;
    }

    async function loadSearchSuggestions() {
      setSearchSuggestionsLoading(true);
      try {
        const result = await productService.search(normalizedTerm);
        if (active) {
          setSearchSuggestions(result.map(normalizeProduct));
        }
      } catch {
        if (active) {
          setSearchSuggestions([]);
        }
      } finally {
        if (active) {
          setSearchSuggestionsLoading(false);
        }
      }
    }

    void loadSearchSuggestions();

    return () => {
      active = false;
    };
  }, [deferredSearch]);

  useEffect(() => {
    let active = true;
    const normalizedTerm = deferredNcmSearch.trim();

    if (!dialogOpen || !normalizedTerm) {
      setNcmOptions([]);
      setNcmOptionsLoading(false);
      return;
    }

    async function loadNcmOptions() {
      setNcmOptionsLoading(true);
      try {
        const result = await productService.searchFiscalNcms(normalizedTerm);
        if (active) {
          setNcmOptions(result);
        }
      } catch {
        if (active) {
          setNcmOptions([]);
        }
      } finally {
        if (active) {
          setNcmOptionsLoading(false);
        }
      }
    }

    void loadNcmOptions();

    return () => {
      active = false;
    };
  }, [deferredNcmSearch, dialogOpen]);

  useEffect(() => {
    const normalizedTerm = normalizeExternalCatalogSearchTerm(deferredExternalLookupName);

    if (dismissedAutoLookupTermRef.current && dismissedAutoLookupTermRef.current !== normalizedTerm) {
      dismissedAutoLookupTermRef.current = null;
    }

    if (externalLookupFeedback && normalizedTerm !== externalLookupSearchTerm) {
      setExternalLookupFeedback(null);
    }

    if (!dialogOpen || !externalCatalogEnabled) {
      if (externalLookupLoadingOrigin === 'description-auto') {
        setExternalLookupLoading(false);
        setExternalLookupLoadingOrigin(null);
      }

      return;
    }

    if (editingProduct && normalizedTerm === normalizedEditingProductName) {
      if (externalLookupLoadingOrigin === 'description-auto') {
        setExternalLookupLoading(false);
        setExternalLookupLoadingOrigin(null);
      }

      return;
    }

    if (normalizedTerm.length < 3) {
      if (externalLookupOrigin === 'description-auto') {
        setExternalLookup(null);
        setExternalLookupOrigin(null);
        setExternalLookupSearchTerm('');
      }

      if (externalLookupLoadingOrigin === 'description-auto') {
        setExternalLookupLoading(false);
        setExternalLookupLoadingOrigin(null);
      }

      return;
    }

    if (dismissedAutoLookupTermRef.current === normalizedTerm) {
      return;
    }

    if (externalLookupLoading) {
      return;
    }

    if (externalLookupSearchTerm === normalizedTerm && isDescriptionLookupOrigin(externalLookupOrigin) && externalLookup) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runExternalDescriptionLookup(normalizedTerm, 'description-auto', false);
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    deferredExternalLookupName,
    dialogOpen,
    editingProduct,
    externalCatalogEnabled,
    externalLookup,
    externalLookupFeedback,
    externalLookupLoading,
    externalLookupLoadingOrigin,
    externalLookupOrigin,
    externalLookupSearchTerm,
    normalizedEditingProductName
  ]);

  useEffect(() => {
    if (!dialogOpen || !regimeTributarioEmpresa) {
      return;
    }

    setForm((current) => applyRegimeRulesToForm(current, regimeTributarioEmpresa));
    if (isSimplesRegime(regimeTributarioEmpresa)) {
      clearFieldErrors('cstIcms');
      return;
    }

    clearFieldErrors('csosn');
  }, [dialogOpen, regimeTributarioEmpresa]);

  useEffect(() => {
    if (!dialogOpen || !editingProduct?.produtoId || !savedLotControlEnabled) {
      setProductLots([]);
      setProductLotsError(null);
      setLoadingProductLots(false);
      return;
    }

    let active = true;
    const produtoId = editingProduct.produtoId;

    async function loadLots() {
      setLoadingProductLots(true);
      setProductLotsError(null);
      try {
        const result = await stockService.listProductLots(produtoId, onlyLotsWithBalance);
        if (active) {
          setProductLots(result);
        }
      } catch (error) {
        if (active) {
          setProductLots([]);
          setProductLotsError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setLoadingProductLots(false);
        }
      }
    }

    void loadLots();

    return () => {
      active = false;
    };
  }, [dialogOpen, editingProduct?.produtoId, onlyLotsWithBalance, savedLotControlEnabled]);

  async function bootstrap() {
    setLoading(true);
    try {
      const [productsResult, suppliersResult, externalStatusResult, fieldTemplatesResult, fiscalContextResult] = await Promise.all([
        productService.list(),
        canViewClientsModule ? clientService.list() : Promise.resolve([] as Cliente[]),
        productService.getExternalCatalogStatus().catch(() => null),
        productService.listFieldTemplates().catch(() => []),
        productService.getFiscalAssistente().catch(() => null)
      ]);

      setProducts(productsResult.map(normalizeProduct));
      setSupplierClients(suppliersResult.filter((item) => item.ativo && item.ehFornecedor));
      setExternalCatalogStatus(externalStatusResult);
      setFieldTemplates(fieldTemplatesResult);
      setFiscalContext(normalizeFiscalAssistenteContext(fiscalContextResult));
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts(term?: string) {
    setRefreshingProducts(true);
    try {
      const normalizedTerm = term?.trim() || undefined;
      const result = await productService.list(normalizedTerm);
      setProducts(result.map(normalizeProduct));
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRefreshingProducts(false);
    }
  }

  async function loadProductLots(produtoId: string, apenasComSaldo = onlyLotsWithBalance) {
    setLoadingProductLots(true);
    setProductLotsError(null);
    try {
      const result = await stockService.listProductLots(produtoId, apenasComSaldo);
      setProductLots(result);
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      setProductLots([]);
      setProductLotsError(message);
      throw error;
    } finally {
      setLoadingProductLots(false);
    }
  }

  function resetLotEntryState() {
    setLotEntryForm(createEmptyLotEntryFormState());
    setLotEntryError(null);
  }

  function resetExternalLookupState() {
    externalLookupRequestIdRef.current++;
    dismissedAutoLookupTermRef.current = null;
    setExternalLookup(null);
    setExternalLookupOrigin(null);
    setExternalLookupFeedback(null);
    setExternalLookupSearchTerm('');
    setExternalLookupLoading(false);
    setExternalLookupLoadingOrigin(null);
  }

  function applyVisualSearchContext(
    explicitSearchTerm?: string | null,
    originalFileName?: string | null,
    fallbackName?: string | null
  ) {
    setVisualSearchFileName(originalFileName?.trim() ?? '');
    setVisualSearchTerm(buildPreferredVisualSearchTerm(explicitSearchTerm, fallbackName, originalFileName));
  }

  async function runExternalDescriptionLookup(
    termo: string,
    origin: Extract<ExternalLookupRequestOrigin, 'description-manual' | 'description-auto' | 'image-manual' | 'image-auto'>,
    notifyUser: boolean
  ) {
    const normalizedTerm = normalizeExternalCatalogSearchTerm(termo);
    if (normalizedTerm.length < 3) {
      if (notifyUser) {
        enqueueSnackbar('Informe pelo menos 3 caracteres no nome do produto para buscar imagem e descricao.', { variant: 'warning' });
      }

      return;
    }

    const requestId = ++externalLookupRequestIdRef.current;
    const preserveExistingLookup = externalLookupOrigin === 'gtin' && externalLookup !== null;

    dismissedAutoLookupTermRef.current = null;
    setExternalLookupFeedback(null);
    setExternalLookupLoading(true);
    setExternalLookupLoadingOrigin(origin);

    try {
      const result = await productService.lookupByDescription(normalizedTerm);
      if (requestId !== externalLookupRequestIdRef.current) {
        return;
      }

      setExternalLookup(result);
      setExternalLookupOrigin(origin);
      setExternalLookupSearchTerm(normalizedTerm);
      applyExternalLookupToProductForm(
        result,
        normalizedTerm,
        'auto',
        isVisualLookupOrigin(origin)
          ? `Busca visual encontrada em ${result.provedor}. Os dados ja entraram no cadastro e continuam editaveis.`
          : `Sugestao externa encontrada em ${result.provedor}. Os dados ja entraram no cadastro e continuam editaveis.`
      );
    } catch (error) {
      if (requestId !== externalLookupRequestIdRef.current) {
        return;
      }

      if (!preserveExistingLookup) {
        setExternalLookup(null);
        setExternalLookupOrigin(null);
        setExternalLookupSearchTerm('');
      }

      const message = getErrorMessage(error);
      if (origin === 'description-auto' || origin === 'image-auto') {
        dismissedAutoLookupTermRef.current = normalizedTerm;
        setExternalLookupFeedback(message);
      } else {
        enqueueSnackbar(message, { variant: 'error' });
      }
    } finally {
      if (requestId === externalLookupRequestIdRef.current) {
        setExternalLookupLoading(false);
        setExternalLookupLoadingOrigin(null);
      }
    }
  }

  function dismissExternalLookupSuggestion() {
    if (externalLookupOrigin === 'description-auto') {
      dismissedAutoLookupTermRef.current = normalizeExternalCatalogSearchTerm(form.nome);
    }

    externalLookupRequestIdRef.current++;
    setExternalLookup(null);
    setExternalLookupOrigin(null);
    setExternalLookupFeedback(null);
    setExternalLookupSearchTerm('');
    setExternalLookupLoading(false);
    setExternalLookupLoadingOrigin(null);
  }

  async function handleRegisterLotEntry() {
    if (!editingProduct) {
      return;
    }

    if (!canEditProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para registrar entradas de lote.', { variant: 'warning' });
      return;
    }

    setRegisteringLotEntry(true);
    setLotEntryError(null);

    try {
      const payload: RegistrarEntradaLotePayload = {
        produtoId: editingProduct.produtoId,
        codigoLote: lotEntryForm.codigoLote,
        quantidadeEntrada: lotEntryForm.quantidadeEntrada,
        dataEntrada: lotEntryForm.dataEntrada,
        dataFabricacao: lotEntryForm.dataFabricacao || null,
        dataValidade: lotEntryForm.dataValidade || null,
        precoCustoUnitario: lotEntryForm.precoCustoUnitario,
        documentoReferencia: lotEntryForm.documentoReferencia || null,
        observacao: lotEntryForm.observacao || null
      };

      await stockService.registerLotEntry(payload);
      enqueueSnackbar('Entrada de lote registrada com sucesso.', { variant: 'success' });
      resetLotEntryState();
      await loadProductLots(editingProduct.produtoId);
      await loadProducts(search);
    } catch (error) {
      const message = getErrorMessage(error);
      setLotEntryError(message);
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setRegisteringLotEntry(false);
    }
  }

  async function loadExternalCatalogStatus() {
    try {
      const result = await productService.getExternalCatalogStatus();
      setExternalCatalogStatus(result);
    } catch {
      // Status complementar; nao bloqueia a tela.
    }
  }

  function openCreateDialog() {
    if (!canCreateProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para criar produtos.', { variant: 'warning' });
      return;
    }

    lastAutomaticFiscalSuggestionKeyRef.current = null;
    setEditingProduct(null);
    setForm(applyRegimeRulesToForm(buildProductFormWithTemplates(emptyForm, fieldTemplates), regimeTributarioEmpresa));
    applyVisualSearchContext(null, null, null);
    resetExternalLookupState();
    setProductLots([]);
    setProductLotsError(null);
    setOnlyLotsWithBalance(true);
    resetLotEntryState();
    setDialogError(null);
    setFieldErrors({});
    setManualAliquotaFields(emptyManualAliquotaState);
    setDialogOpen(true);
  }

  function openCreateDialogWithCode(code: string, format?: string | null) {
    if (!canCreateProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para criar produtos.', { variant: 'warning' });
      return;
    }

    lastAutomaticFiscalSuggestionKeyRef.current = null;
    const captured = mergeCapturedDataIntoProductForm(
      buildProductFormWithTemplates(emptyForm, fieldTemplates),
      code,
      format
    );
    const supplierAppliedForm = applyCapturedSupplierToForm(captured.nextForm, captured.supplierHints, supplierClients);

    setEditingProduct(null);
    setForm(applyRegimeRulesToForm(supplierAppliedForm, regimeTributarioEmpresa));
    applyVisualSearchContext(null, null, supplierAppliedForm.nome);
    resetExternalLookupState();
    setProductLots([]);
    setProductLotsError(null);
    setOnlyLotsWithBalance(true);
    resetLotEntryState();
    setDialogError(null);
    setFieldErrors({});
    setManualAliquotaFields(emptyManualAliquotaState);
    setDialogOpen(true);

    window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 80);
  }

  function openCreateDialogWithImage(imageUrl: string, searchTerm?: string | null, originalFileName?: string | null) {
    if (!canCreateProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para criar produtos.', { variant: 'warning' });
      return;
    }

    lastAutomaticFiscalSuggestionKeyRef.current = null;
    const baseForm = applyRegimeRulesToForm(buildProductFormWithTemplates(emptyForm, fieldTemplates), regimeTributarioEmpresa);
    const trimmedSearchTerm = searchTerm?.trim() ?? '';

    setEditingProduct(null);
    setForm({
      ...baseForm,
      nome: trimmedSearchTerm || baseForm.nome,
      imagemUrl: imageUrl
    });
    applyVisualSearchContext(searchTerm, originalFileName, trimmedSearchTerm || baseForm.nome);
    resetExternalLookupState();
    setProductLots([]);
    setProductLotsError(null);
    setOnlyLotsWithBalance(true);
    resetLotEntryState();
    setDialogError(null);
    setFieldErrors({});
    setManualAliquotaFields(emptyManualAliquotaState);
    setDialogOpen(true);

    window.setTimeout(() => {
      if (trimmedSearchTerm) {
        barcodeInputRef.current?.focus();
      } else {
        nameInputRef.current?.focus();
      }
    }, 80);
  }

  function openEditDialog(product: Produto) {
    lastAutomaticFiscalSuggestionKeyRef.current = null;
    const normalizedProduct = normalizeProduct(product);
    setEditingProduct(normalizedProduct);
    applyVisualSearchContext(null, null, normalizedProduct.nome);
    resetExternalLookupState();
    setForm(applyRegimeRulesToForm(buildProductFormWithTemplates({
      categoriaId: normalizedProduct.categoriaId,
      clienteFornecedorId: normalizedProduct.clienteFornecedorId,
      codigoBarras: normalizedProduct.codigoBarras,
      tipoCodigoPrincipal: normalizedProduct.tipoCodigoPrincipal ?? 'Ean',
      nome: normalizedProduct.nome,
      descricao: normalizedProduct.descricao,
      marca: normalizedProduct.marca,
      ncm: normalizedProduct.ncm,
      cest: normalizedProduct.cest,
      origemFiscal: normalizedProduct.origemFiscal,
      perfilFiscalPadrao: normalizedProduct.perfilFiscalPadrao,
      cfopVendaPadrao: normalizedProduct.cfopVendaPadrao,
      cfopVendaInterestadual: normalizedProduct.cfopVendaInterestadual,
      cfopCompraPadrao: normalizedProduct.cfopCompraPadrao,
      cfopCompraInterestadual: normalizedProduct.cfopCompraInterestadual,
      csosn: normalizedProduct.csosn,
      cstIcms: normalizedProduct.cstIcms,
      cstPis: normalizedProduct.cstPis,
      cstCofins: normalizedProduct.cstCofins,
      beneficioFiscalCodigo: normalizedProduct.beneficioFiscalCodigo,
      codigoAnp: normalizedProduct.codigoAnp,
      unidadeTributavel: normalizedProduct.unidadeTributavel ?? normalizedProduct.unidadeMedida,
      exTipi: normalizedProduct.exTipi,
      aliquotaIcms: normalizedProduct.aliquotaIcms,
      aliquotaIpi: normalizedProduct.aliquotaIpi,
      aliquotaPis: normalizedProduct.aliquotaPis,
      aliquotaCofins: normalizedProduct.aliquotaCofins,
      imagemUrl: normalizedProduct.imagemUrl,
      catalogoResumo: normalizedProduct.catalogoResumo,
      destaqueCatalogoComprador: normalizedProduct.destaqueCatalogoComprador,
      precoPromocional: normalizedProduct.precoPromocional,
      promocaoTitulo: normalizedProduct.promocaoTitulo,
      promocaoInicioUtc: normalizedProduct.promocaoInicioUtc ? normalizedProduct.promocaoInicioUtc.slice(0, 16) : null,
      promocaoFimUtc: normalizedProduct.promocaoFimUtc ? normalizedProduct.promocaoFimUtc.slice(0, 16) : null,
      codigoProdutoFornecedor: normalizedProduct.codigoProdutoFornecedor,
      ultimaNotaFiscalCompra: normalizedProduct.ultimaNotaFiscalCompra,
      precoVenda: normalizedProduct.precoVenda,
      precoCusto: normalizedProduct.precoCusto,
      estoqueAtual: normalizedProduct.estoqueAtual,
      estoqueMinimo: normalizedProduct.estoqueMinimo,
      unidadeMedida: normalizedProduct.unidadeMedida,
      ativo: normalizedProduct.ativo,
      controlaEstoque: normalizedProduct.controlaEstoque,
      controlaLote: normalizedProduct.controlaLote,
      politicaBaixaLote: normalizedProduct.politicaBaixaLote ?? 'FEFO',
      fornecedores: normalizedProduct.fornecedores.length > 0
        ? normalizedProduct.fornecedores.map((item) => ({
            clienteFornecedorId: item.clienteFornecedorId,
            codigoProdutoFornecedor: item.codigoProdutoFornecedor,
            nomeProdutoFornecedor: item.nomeProdutoFornecedor,
            precoCompra: item.precoCompra,
            quantidadeMinima: item.quantidadeMinima,
            prazoEntregaDias: item.prazoEntregaDias,
            ultimaCompraEm: item.ultimaCompraEm ? item.ultimaCompraEm.slice(0, 10) : null,
            ultimoPrecoPago: item.ultimoPrecoPago,
            fornecedorPrincipal: item.fornecedorPrincipal,
            ativo: item.ativo
          }))
        : buildLegacySupplierLinks(normalizedProduct),
      codigosAlternativos: normalizedProduct.codigos
        .filter((item) => !item.principal)
        .map((item) => ({
          codigo: item.codigo,
          tipo: item.tipo
        })),
      camposCustomizados: normalizedProduct.camposCustomizados
    }, fieldTemplates), regimeTributarioEmpresa));
    setProductLots([]);
    setProductLotsError(null);
    setOnlyLotsWithBalance(true);
    resetLotEntryState();
    setDialogOpen(true);
    setDialogError(null);
    setFieldErrors({});
    setManualAliquotaFields(emptyManualAliquotaState);
  }

  function closeProductDialog() {
    lastAutomaticFiscalSuggestionKeyRef.current = null;
    resetExternalLookupState();
    applyVisualSearchContext(null, null, null);
    setDialogOpen(false);
    setProductImageRemoteDialogOpen(false);
    setProductLots([]);
    setProductLotsError(null);
    resetLotEntryState();

    if (!detachedWindow) {
      return;
    }

    removeDetachedDialogSession(detachedSessionKey);
    window.close();
  }

  async function applyUploadedProductImage(upload: ProdutoImagemUpload, sourceLabel: string) {
    const uploadedSearchTerm = normalizeExternalCatalogSearchTerm(upload.termoBusca ?? '');
    const fileNameSearchTerm = extractSearchTermFromImageFileName(upload.nomeArquivoOriginal);
    const currentNameSearchTerm = normalizeExternalCatalogSearchTerm(form.nome);
    const effectiveSearchTerm = uploadedSearchTerm.length >= 3
      ? upload.termoBusca?.trim() ?? null
      : currentNameSearchTerm.length >= 3
        ? form.nome.trim()
        : fileNameSearchTerm;

    setProductImageRemoteDialogOpen(false);

    if (!dialogOpen) {
      openCreateDialogWithImage(upload.imagemUrl, upload.termoBusca, upload.nomeArquivoOriginal);
    } else {
      setForm((current) => ({
        ...current,
        nome: !current.nome.trim() && upload.termoBusca?.trim() ? upload.termoBusca.trim() : current.nome,
        imagemUrl: upload.imagemUrl
      }));
    }

    applyVisualSearchContext(upload.termoBusca, upload.nomeArquivoOriginal, form.nome);
    if (upload.diagnosticoReconhecimento?.trim()) {
      setExternalLookupFeedback(upload.diagnosticoReconhecimento.trim());
      enqueueSnackbar(upload.diagnosticoReconhecimento.trim(), { variant: 'info' });
    }

    enqueueSnackbar(
      upload.termoBuscaOrigem === 'python-tesseract'
        ? `${sourceLabel} OCR Python identificou um termo de busca pela imagem.`
        : `${sourceLabel} Foto aplicada ao cadastro.`,
      { variant: 'success' }
    );

    if (effectiveSearchTerm) {
      setVisualSearchTerm(effectiveSearchTerm);
      await runExternalDescriptionLookup(effectiveSearchTerm, 'image-auto', true);
      return;
    }

    enqueueSnackbar('Imagem recebida. Informe um termo de busca visual ou digite pelo menos 3 caracteres para cruzar com os sites externos.', { variant: 'info' });
  }

  async function handleLocalProductImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!canPersistCurrentProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para usar a captura visual neste cadastro.', { variant: 'warning' });
      return;
    }

    setProductImageUploading(true);
    try {
      const optimizedFile = await optimizeProductImageFile(file);
      const currentSearchTerm = normalizeExternalCatalogSearchTerm(form.nome);
      const upload = await productService.uploadProductImage(
        optimizedFile,
        currentSearchTerm.length >= 3 ? form.nome.trim() : null
      );
      await applyUploadedProductImage(upload, 'Imagem recebida deste dispositivo.');
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setProductImageUploading(false);
    }
  }

  async function handleSave(keepDialogOpenForNextProduct = false) {
    if (!canPersistCurrentProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para salvar este cadastro de produto.', { variant: 'warning' });
      return;
    }

    setDialogError(null);
    setFieldErrors({});
    setSavingProduct(true);

    try {
      const payload = buildProductSavePayload(
        syncProductSupplierForm(applyRegimeRulesToForm(form, regimeTributarioEmpresa)),
        precisaJustificativaFiscal,
        pisCofinsDiferentes
      );

      if (editingProduct) {
        await productService.update(editingProduct.produtoId, payload);
        enqueueSnackbar('Produto atualizado com sucesso.', { variant: 'success' });
      } else {
        await productService.create(payload);
        enqueueSnackbar(
          keepDialogOpenForNextProduct
            ? 'Produto criado com sucesso. O cadastro ja ficou pronto para o proximo item.'
            : 'Produto criado com sucesso.',
          { variant: 'success' }
        );
      }

      await loadProducts(search);

      if (keepDialogOpenForNextProduct && !editingProduct) {
        resetExternalLookupState();
        setDialogError(null);
        setFieldErrors({});
        setManualAliquotaFields(emptyManualAliquotaState);
        setForm(buildNextProductForm(form, fieldTemplates, regimeTributarioEmpresa));
        window.setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 80);
        return;
      }

      closeProductDialog();
    } catch (error) {
      const message = getErrorMessage(error);
      const nextFieldErrors = buildProductFieldErrors(message);
      setDialogError(message);
      setFieldErrors(nextFieldErrors);
      enqueueSnackbar(
        Object.keys(nextFieldErrors).length > 0
          ? 'Revise os campos destacados em vermelho para concluir o cadastro do produto.'
          : message,
        { variant: 'error' }
      );
    } finally {
      setSavingProduct(false);
    }
  }

  function clearFieldErrors(...keys: ProductFieldErrorKey[]) {
    if (keys.length === 0) {
      setFieldErrors({});
      return;
    }

    setFieldErrors((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }

      const next = { ...current };
      for (const key of keys) {
        delete next[key];
      }

      return next;
    });
  }

  function resolveFieldHelperText(field: ProductFieldErrorKey, fallback?: string) {
    return fieldErrors[field] ?? fallback;
  }

  function applyFiscalFieldErrors(message: string | null) {
    const nextFieldErrors = message ? buildProductFieldErrors(message) : {};
    setFieldErrors((current) => {
      const cleaned = { ...current };
      for (const field of fiscalFieldErrorKeys) {
        delete cleaned[field];
      }

      return {
        ...cleaned,
        ...nextFieldErrors
      };
    });
  }

  function handleCsosnChange(nextValue: string) {
    clearFieldErrors('csosn');
    setForm((current) => ({
      ...current,
      csosn: nextValue || null
    }));
  }

  function handleCstIcmsChange(nextValue: string) {
    clearFieldErrors('cstIcms');
    setForm((current) => ({
      ...current,
      cstIcms: nextValue || null
    }));
  }

  function handleCstPisChange(nextValue: string) {
    clearFieldErrors('cstPis', 'aliquotaPis', 'aliquotaCofins', 'justificativaFiscalManual', 'confirmaPisCofinsDiferentes');
    setManualAliquotaFields((current) => ({
      ...current,
      aliquotaPis: false,
      aliquotaCofins: false
    }));
    setForm((current) => applyPisCofinsSuggestionByCst(
      {
        ...current,
        cstPis: nextValue || null,
        confirmaPisCofinsDiferentes: nextValue && current.cstCofins && nextValue !== current.cstCofins
          ? current.confirmaPisCofinsDiferentes
          : false
      },
      regimeTributarioEmpresa
    ));
  }

  function handleCstCofinsChange(nextValue: string) {
    clearFieldErrors('cstCofins', 'justificativaFiscalManual', 'confirmaPisCofinsDiferentes');
    setForm((current) => ({
      ...current,
      cstCofins: nextValue || null,
      confirmaPisCofinsDiferentes: nextValue && current.cstPis && nextValue !== current.cstPis
        ? current.confirmaPisCofinsDiferentes
        : false
    }));
  }

  function handleAliquotaChange(field: 'aliquotaIcms' | 'aliquotaIpi' | 'aliquotaPis' | 'aliquotaCofins', value: string) {
    clearFieldErrors(field, 'justificativaFiscalManual');
    setManualAliquotaFields((current) => ({
      ...current,
      [field]: true
    }));
    setForm((current) => ({
      ...current,
      [field]: parseNullableNumber(value)
    }));
  }

  async function applyFiscalSuggestionByNcm(force = false, sourceForm?: ProdutoPayload) {
    const baseForm = normalizeProductForm(sourceForm ?? form);
    const ncmCode = onlyDigits(baseForm.ncm);
    const requestKey = buildFiscalSuggestionRequestKey(baseForm);
    const ncmOption = ncmCode
      ? ncmOptions.find((item) => item.codigo === ncmCode) ?? null
      : null;

    if (applyingFiscalSuggestion || ncmCode.length !== 8) {
      return;
    }

    if (!force && lastAutomaticFiscalSuggestionKeyRef.current === requestKey) {
      return;
    }

    setApplyingFiscalSuggestion(true);
    try {
      const suggestion = await productService.getFiscalSuggestionByNcm({
        ncm: ncmCode,
        descricaoNcm: ncmOption?.descricao ?? null,
        cest: baseForm.cest,
        perfilFiscalPadrao: baseForm.perfilFiscalPadrao,
        origemFiscal: baseForm.origemFiscal,
        beneficioFiscalCodigo: baseForm.beneficioFiscalCodigo,
        codigoAnp: baseForm.codigoAnp,
        unidadeMedida: baseForm.unidadeMedida,
        unidadeTributavel: baseForm.unidadeTributavel,
        exTipi: baseForm.exTipi
      });

      lastAutomaticFiscalSuggestionKeyRef.current = requestKey;
      setDialogError(null);
      setManualAliquotaFields(emptyManualAliquotaState);
      applyFiscalFieldErrors(suggestion.pendencias.join(' '));
      setForm((current) => applyFiscalSuggestionToForm(current, suggestion));
      const suggestedNcmCode = suggestion.ncm;
      const suggestedNcmDescription = suggestion.descricaoNcm;
      if (suggestedNcmCode && suggestedNcmDescription) {
        setNcmOptions((current) => upsertFiscalNcmOption(
          current,
          {
            codigo: suggestedNcmCode,
            descricao: suggestedNcmDescription,
            cestPadraoCodigo: suggestion.cest,
            aliquotaIbpt: null,
            sujeitoSt: suggestion.sujeitoSt,
            cadastroAutomatico: suggestion.ncmCriadoAutomaticamente,
            observacaoCadastro: suggestion.mensagemCadastroNcm
          }
        ));
      }

      if (suggestion.pendencias.length > 0) {
        enqueueSnackbar(suggestion.pendencias.join(' '), { variant: 'warning' });
      } else {
        enqueueSnackbar(`Tributacao base aplicada automaticamente a partir do NCM ${suggestion.ncm ?? ncmCode}.`, { variant: 'success' });
      }

      if (suggestion.ncmCriadoAutomaticamente && suggestion.mensagemCadastroNcm) {
        enqueueSnackbar(suggestion.mensagemCadastroNcm, { variant: 'info' });
      }

      if (suggestion.requerRevisaoSt) {
        enqueueSnackbar('O NCM selecionado indica possivel ST. Revise CEST e substituicao tributaria antes de salvar.', { variant: 'warning' });
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setApplyingFiscalSuggestion(false);
    }
  }

  async function handleQuickCreateNcm() {
    if (!canApplyFiscalSuggestion) {
      return;
    }

    setQuickCreatingNcm(true);
    try {
      const created = await productService.quickCreateFiscalNcm({
        codigo: normalizedNcm
      });

      const nextForm = {
        ...form,
        ncm: created.codigo,
        cest: form.cest ?? created.cestPadraoCodigo ?? null
      };

      setNcmOptions((current) => upsertFiscalNcmOption(current, created));
      setForm(nextForm);
      enqueueSnackbar(`NCM ${created.codigo} cadastrado rapidamente na tabela fiscal interna.`, { variant: 'success' });
      void applyFiscalSuggestionByNcm(true, nextForm);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setQuickCreatingNcm(false);
    }
  }

  async function handleImportNcmTable() {
    if (!canManageCompanyFiscal) {
      enqueueSnackbar('Seu usuario nao possui permissao para importar a tabela oficial de NCM.', { variant: 'warning' });
      return;
    }

    setImportingNcmTable(true);
    try {
      const result = await productService.importFiscalNcmTable();
      enqueueSnackbar(
        `Tabela NCM oficial do Brasil importada: ${result.criados} criados, ${result.atualizados} atualizados, ${result.ignorados} sem alteracao e ${result.invalidos} invalidos.`,
        { variant: result.invalidos > 0 ? 'warning' : 'success' }
      );

      if (result.avisos.length > 0) {
        enqueueSnackbar(result.avisos.join(' '), { variant: 'warning' });
      }

      if (dialogOpen && canApplyFiscalSuggestion) {
        lastAutomaticFiscalSuggestionKeyRef.current = null;
        void applyFiscalSuggestionByNcm(true);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setImportingNcmTable(false);
    }
  }

  function openTemplateDialog() {
    if (!canEditProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para editar os campos padrao da empresa.', { variant: 'warning' });
      return;
    }

    setTemplateDrafts(fieldTemplates.map((item) => ({ chave: item.chave, valorPadrao: item.valorPadrao })));
    setTemplateDialogError(null);
    setTemplateDialogOpen(true);
  }

  function addTemplateDraft() {
    setTemplateDrafts((current) => [
      ...current,
      {
        chave: '',
        valorPadrao: null
      }
    ]);
  }

  function updateTemplateDraft(index: number, field: keyof ProdutoCampoPadraoPayload, value: string) {
    setTemplateDrafts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === 'chave' ? value : value || null
            }
          : item
      )
    );
  }

  function removeTemplateDraft(index: number) {
    setTemplateDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSaveTemplates() {
    if (!canEditProduct) {
      enqueueSnackbar('Seu usuario nao possui permissao para salvar os campos padrao da empresa.', { variant: 'warning' });
      return;
    }

    setTemplateDialogError(null);
    setSavingTemplates(true);

    try {
      const savedTemplates = await productService.saveFieldTemplates(templateDrafts);
      setFieldTemplates(savedTemplates);
      setTemplateDialogOpen(false);
      enqueueSnackbar('Campos padrao da empresa salvos com sucesso.', { variant: 'success' });
      setForm((current) => buildProductFormWithTemplates(current, savedTemplates));
    } catch (error) {
      const message = getErrorMessage(error);
      setTemplateDialogError(message);
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setSavingTemplates(false);
    }
  }

  async function handleLookupByGtin() {
    const gtin = normalizeGtin(form.codigoBarras);
    if (!isLikelyGtin(gtin)) {
      enqueueSnackbar('Informe um GTIN valido com 8 a 14 digitos para consultar o catalogo externo.', { variant: 'warning' });
      return;
    }

    const requestId = ++externalLookupRequestIdRef.current;
    dismissedAutoLookupTermRef.current = null;
    setExternalLookupFeedback(null);
    setExternalLookupLoading(true);
    setExternalLookupLoadingOrigin('gtin');
    try {
      const result = await productService.lookupByGtin(gtin);
      if (requestId !== externalLookupRequestIdRef.current) {
        return;
      }

      setExternalLookup(result);
      setExternalLookupOrigin('gtin');
      setExternalLookupSearchTerm(gtin);
      applyExternalLookupToProductForm(
        result,
        gtin,
        'auto',
        `Dados externos localizados em ${result.provedor}. O cadastro ja foi preenchido e segue editavel.`
      );
    } catch (error) {
      if (requestId !== externalLookupRequestIdRef.current) {
        return;
      }

      setExternalLookup(null);
      setExternalLookupOrigin(null);
      setExternalLookupSearchTerm('');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      if (requestId === externalLookupRequestIdRef.current) {
        setExternalLookupLoading(false);
        setExternalLookupLoadingOrigin(null);
      }
    }
  }

  async function handleLookupByDescription() {
    const termo = form.nome.trim();
    await runExternalDescriptionLookup(termo, 'description-manual', true);
  }

  async function handleLookupByVisualSearch() {
    if (!form.imagemUrl) {
      enqueueSnackbar('Envie uma foto da embalagem antes de acionar a busca visual externa.', { variant: 'warning' });
      return;
    }

    const termo = buildPreferredVisualSearchTerm(visualSearchTerm, form.nome, visualSearchFileName);
    const normalizedTerm = normalizeExternalCatalogSearchTerm(termo);
    if (normalizedTerm.length < 3) {
      enqueueSnackbar('Informe um termo com pelo menos 3 caracteres para cruzar a imagem com os sites externos.', { variant: 'warning' });
      return;
    }

    setVisualSearchTerm(termo);
    await runExternalDescriptionLookup(termo, 'image-manual', true);
  }

  function applyExternalLookupToProductForm(
    result: ProdutoCatalogoExternoConsulta,
    lookupTerm: string,
    mode: ExternalLookupApplyMode,
    feedbackMessage: string
  ) {
    const nextForm = mergeExternalLookupIntoForm(form, result, lookupTerm, mode);

    setForm((current) => mergeExternalLookupIntoForm(current, result, lookupTerm, mode));
    setExternalLookupFeedback(null);
    enqueueSnackbar(feedbackMessage, { variant: 'success' });

    if (onlyDigits(nextForm.ncm).length === 8) {
      void applyFiscalSuggestionByNcm(true, nextForm);
    }
  }

  function applyExternalLookupToForm() {
    if (!externalLookup) {
      return;
    }

    applyExternalLookupToProductForm(
      externalLookup,
      externalLookupSearchTerm,
      'manual',
      'Dados externos reaplicados no cadastro. Voce ainda pode editar tudo antes de salvar.'
    );
  }

  async function handleDelete() {
    if (!deleteProduct) {
      return;
    }

    try {
      await productService.remove(deleteProduct.produtoId, deletePermanent);
      enqueueSnackbar(deletePermanent ? 'Produto excluido permanentemente com sucesso.' : 'Produto inativado com sucesso.', { variant: 'success' });
      setDeleteProduct(null);
      setDeletePermanent(false);
      await loadProducts(search);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  async function handleScannedCode(code: string, format?: string | null) {
    if (savingProduct) {
      return;
    }

    const normalizedCode = code.trim();
    if (!normalizedCode) {
      return;
    }

    const capturedProductImage = parseProductImageCapturePayload(normalizedCode, format);
    if (capturedProductImage) {
      await applyUploadedProductImage({
        imagemUrl: capturedProductImage.imageUrl,
        nomeArquivoOriginal: capturedProductImage.fileName,
        tamanhoBytes: capturedProductImage.sizeBytes,
        termoBusca: capturedProductImage.searchTerm,
        termoBuscaOrigem: capturedProductImage.searchOrigin ?? null,
        diagnosticoReconhecimento: capturedProductImage.recognitionDiagnostic ?? null
      }, 'Imagem recebida do celular.');
      return;
    }

    if (dialogOpen) {
      const capture = mergeCapturedDataIntoProductForm(form, normalizedCode, format);
      const supplierAppliedForm = applyCapturedSupplierToForm(capture.nextForm, capture.supplierHints, supplierClients);
      setForm(supplierAppliedForm);

      const supplierMatched = findSupplierByHints(supplierClients, capture.supplierHints);
      const supplierMessage = supplierMatched
        ? ` Fornecedor reconhecido: ${supplierMatched.nome}.`
        : hasSupplierHint(capture.supplierHints)
          ? ' O QR trouxe fornecedor, mas ele ainda nao esta cadastrado com esse documento/nome.'
          : '';

      enqueueSnackbar(
        capture.importedStructuredData
          ? `Leitura aplicada ao cadastro com dados extras do QR.${supplierMessage}`
          : `Codigo lido: ${normalizedCode}.${supplierMessage}`,
        { variant: supplierMatched || !hasSupplierHint(capture.supplierHints) ? 'success' : 'info' }
      );

      window.setTimeout(() => {
        if (!supplierAppliedForm.nome.trim()) {
          nameInputRef.current?.focus();
          return;
        }

        barcodeInputRef.current?.focus();
      }, 80);

      return;
    }

    setResolvingCode(true);

    try {
      const product = await productService.getByBarcode(normalizedCode, true);
      openEditDialog(product);
      enqueueSnackbar(
        product.ativo
          ? `Produto localizado: ${product.nome}`
          : `Produto inativo localizado: ${product.nome}. Reative ou ajuste o cadastro existente.`,
        { variant: product.ativo ? 'success' : 'warning' }
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        openCreateDialogWithCode(normalizedCode, format);
        enqueueSnackbar(
          inferProductCodeType(normalizedCode, format) === 'Qr'
            ? 'QR lido e nao encontrado. O cadastro foi aberto com o conteudo capturado para voce completar o produto.'
            : 'Codigo lido e nao encontrado. O cadastro foi aberto para voce completar as informacoes do produto.',
          { variant: 'info' }
        );
        return;
      }

      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setResolvingCode(false);
    }
  }

  useScanner(async (event) => {
    await handleScannedCode(event.codigoBarras, event.formato);
  });

  function addAlternateCode() {
    setForm((current) => ({
      ...current,
      codigosAlternativos: [
        ...current.codigosAlternativos,
        {
          codigo: '',
          tipo: 'Interno'
        }
      ]
    }));
  }

  function updateAlternateCode(index: number, field: 'codigo' | 'tipo', value: string) {
    setForm((current) => ({
      ...current,
      codigosAlternativos: current.codigosAlternativos.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value
            }
          : item
      )
    }));
  }

  function removeAlternateCode(index: number) {
    setForm((current) => ({
      ...current,
      codigosAlternativos: current.codigosAlternativos.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function addCustomField() {
    setForm((current) => ({
      ...current,
      camposCustomizados: [
        ...current.camposCustomizados,
        {
          chave: '',
          valor: null
        }
      ]
    }));
  }

  function addTrackedCustomField(fieldKey: (typeof trackedProductFieldPresets)[number]['key']) {
    const preset = trackedProductFieldPresets.find((item) => item.key === fieldKey);
    if (!preset) {
      return;
    }

    setForm((current) => {
      if (hasCustomFieldKey(current.camposCustomizados, preset.key)) {
        return current;
      }

      return {
        ...current,
        camposCustomizados: [
          ...current.camposCustomizados,
          {
            chave: preset.label,
            valor: null
          }
        ]
      };
    });
  }

  function updateCustomField(index: number, field: keyof ProdutoCampoCustomizadoPayload, value: string) {
    setForm((current) => ({
      ...current,
      camposCustomizados: current.camposCustomizados.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === 'chave' ? value : value || null
            }
          : item
      )
    }));
  }

  function removeCustomField(index: number) {
    setForm((current) => ({
      ...current,
      camposCustomizados: current.camposCustomizados.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function handleSupplierChange(nextSupplierId: string) {
    setForm((current) => syncProductSupplierForm(current, nextSupplierId || null));
  }

  function addSupplierLink(prefillSupplierId?: string | null) {
    setForm((current) => syncProductSupplierForm({
      ...current,
      fornecedores: [
        ...current.fornecedores,
        createSupplierLink({
          clienteFornecedorId: prefillSupplierId ?? null,
          fornecedorPrincipal: false,
          ativo: true
        })
      ]
    }));
  }

  function updateSupplierLink<K extends keyof ProdutoFornecedorPayload>(index: number, field: K, value: ProdutoFornecedorPayload[K]) {
    setForm((current) => {
      const currentRow = current.fornecedores[index];
      const nextSupplierId = field === 'clienteFornecedorId'
        ? (value as ProdutoFornecedorPayload['clienteFornecedorId'])
        : current.clienteFornecedorId;

      return syncProductSupplierForm({
        ...current,
        clienteFornecedorId: currentRow?.fornecedorPrincipal && field === 'clienteFornecedorId'
          ? nextSupplierId
          : current.clienteFornecedorId,
        fornecedores: current.fornecedores.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
                ...(field === 'clienteFornecedorId' ? { codigoProdutoFornecedor: item.fornecedorPrincipal ? current.codigoProdutoFornecedor : item.codigoProdutoFornecedor } : {})
              }
            : item
        )
      });
    });
  }

  function setSupplierPrincipal(index: number) {
    const nextSupplierId = form.fornecedores[index]?.clienteFornecedorId ?? null;
    if (!nextSupplierId) {
      return;
    }

    setForm((current) => syncProductSupplierForm({
      ...current,
      clienteFornecedorId: nextSupplierId,
      fornecedores: current.fornecedores.map((item, itemIndex) => ({
        ...item,
        fornecedorPrincipal: itemIndex === index
      }))
    }));
  }

  function removeSupplierLink(index: number) {
    setForm((current) => syncProductSupplierForm({
      ...current,
      fornecedores: current.fornecedores.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  if (loading) {
    return <Loading message="Carregando produtos..." />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Produtos</Typography>
        <Typography color="text.secondary">Cadastro de itens com regra de estoque, codigo principal e codigos alternativos por empresa.</Typography>
      </Box>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Stack spacing={2.25}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Autocomplete
                fullWidth
                freeSolo
                value={null}
                options={searchSuggestions}
                inputValue={search}
                filterOptions={(options) => options}
                onInputChange={(_, nextValue) => setSearch(nextValue)}
                onChange={(_, product) => {
                  if (!product || typeof product === 'string') {
                    return;
                  }

                  setSearch(product.nome);
                  setProducts([product]);
                }}
                getOptionLabel={(option) =>
                  typeof option === 'string'
                    ? option
                    : `${option.nome}${option.codigoBarras ? ` · ${option.codigoBarras}` : ''}`
                }
                noOptionsText={search.trim() ? 'Nenhum produto encontrado para esse termo.' : 'Digite para buscar produtos.'}
                renderOption={(props, option) => (
                  <Box component="li" {...props} sx={{ py: 1.25 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {option.codigoBarras ?? 'Sem codigo'} · Estoque {option.estoqueAtual.toFixed(3)} · {formatCurrency(option.precoVenda)}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <ListFilterField
                    {...params}
                    label="Buscar produto"
                    placeholder="Nome ou qualquer codigo"
                    loading={searchSuggestionsLoading}
                    helperText={
                      searchSuggestionsLoading
                        ? 'Buscando nomes e codigos parecidos...'
                        : 'As sugestoes aparecem enquanto voce digita. Pressione Enter para filtrar a lista.'
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void loadProducts(search);
                      }
                    }}
                  />
                )}
              />
              <Button variant="outlined" onClick={() => void loadProducts(search)} disabled={refreshingProducts}>
                Buscar
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setSearch('');
                  setSearchSuggestions([]);
                  void loadProducts();
                }}
                disabled={refreshingProducts && !search}
              >
                Limpar
              </Button>
              <Button
                variant="outlined"
                onClick={() => void handleImportNcmTable()}
                disabled={importingNcmTable || !canManageCompanyFiscal}
              >
                {importingNcmTable ? 'Importando NCM...' : 'Importar NCM oficial do Brasil'}
              </Button>
              <Button variant="outlined" onClick={openTemplateDialog} disabled={!canEditProduct}>
                Campos padrao da empresa
              </Button>
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreateDialog} disabled={!canCreateProduct}>
                Novo produto
              </Button>
            </Stack>

            {refreshingProducts && (
              <Typography variant="body2" color="primary.main">
                Atualizando a lista de produtos...
              </Typography>
            )}

            <ScannerActionBar
              contexto="produtos-localizar-ou-cadastrar"
              title="Localizar ou cadastrar produto"
              description="Leia o codigo. Se o produto ja existir, o sistema abre o cadastro dele. Se nao existir, abre um novo cadastro com o codigo preenchido."
              defaultMode="CodigoBarras"
              availableModes={['CodigoBarras', 'QrCode']}
              onDetected={(code, format) => void handleScannedCode(code, format)}
            />

            <Typography variant="body2" color="text.secondary">
              Fluxo profissional: o leitor captura o identificador do produto. Nome, preco, estoque e demais dados continuam sob controle do seu cadastro interno.
            </Typography>

            {externalCatalogStatus && (
              <Typography variant="body2" color="text.secondary">
                Base externa de produtos: {externalCatalogStatus.mensagem}
              </Typography>
            )}

            {resolvingCode && (
              <Typography variant="body2" color="primary.main">
                Validando o codigo lido no cadastro de produtos...
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Paper sx={{ borderRadius: 5, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Produto</TableCell>
              <TableCell>Codigo principal</TableCell>
              <TableCell>Preco</TableCell>
              <TableCell>Estoque</TableCell>
              <TableCell>Status</TableCell>
              <TableCell width={88}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.produtoId} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 68,
                        height: 68,
                        borderRadius: 2.5,
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'rgba(23, 75, 138, 0.08)',
                        border: '1px solid rgba(23, 75, 138, 0.12)'
                      }}
                    >
                      {product.imagemUrl ? (
                        <Box
                          component="img"
                          src={product.imagemUrl}
                          alt={product.nome}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            bgcolor: '#fff',
                            p: 0.75
                          }}
                        />
                      ) : (
                        <Typography
                          variant="caption"
                          sx={{
                            px: 0.75,
                            textAlign: 'center',
                            fontWeight: 900,
                            color: 'primary.main',
                            lineHeight: 1.1
                          }}
                        >
                          {buildProductInitials(product.nome)}
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{product.nome}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {product.descricao ?? 'Sem descricao'}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography>{product.codigoBarras ?? '-'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {product.tipoCodigoPrincipal ?? 'Sem tipo'}
                  </Typography>
                </TableCell>
                <TableCell>{formatCurrency(product.precoVenda)}</TableCell>
                <TableCell>
                  <Typography color={product.estoqueBaixo ? 'error.main' : 'text.primary'}>
                    {product.estoqueAtual.toFixed(3)} {product.unidadeMedida}
                  </Typography>
                  {getProductPrincipalSupplier(product) && (
                    <>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Principal: {getProductPrincipalSupplier(product)!.clienteFornecedorNome}
                      </Typography>
                      {getProductPrincipalSupplier(product)!.clienteFornecedorDocumento && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Documento: {getProductPrincipalSupplier(product)!.clienteFornecedorDocumento}
                        </Typography>
                      )}
                      {getProductBestSupplier(product)?.precoCompra != null && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Menor compra: {formatCurrency(getProductBestSupplier(product)!.precoCompra ?? 0)} com {getProductBestSupplier(product)!.clienteFornecedorNome}
                        </Typography>
                      )}
                      {(product.fornecedores ?? []).filter((item) => item.ativo).length > 1 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {(product.fornecedores ?? []).filter((item) => item.ativo).length} fornecedores ativos cadastrados
                        </Typography>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell>{product.ativo ? 'Ativo' : 'Inativo'}</TableCell>
                <TableCell>
                  <IconButton onClick={() => openEditDialog(product)} title="Editar produto">
                    <EditRoundedIcon />
                  </IconButton>
                  {canDeleteProduct ? (
                    <IconButton onClick={() => { setDeleteProduct(product); setDeletePermanent(false); }} color="error" title="Arquivar produto">
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <DetachableDialog
        open={dialogOpen}
        onClose={closeProductDialog}
        title={editingProduct ? 'Editar produto' : 'Novo produto'}
        maxWidth="lg"
        contentDividers
        contentSx={{ overflowX: 'hidden' }}
        detachedWindow={detachedWindow}
        detachPath={PRODUCT_DIALOG_PATH}
        detachPayload={{
          editingProduct,
          form,
          externalLookup,
          visualSearchTerm,
          visualSearchFileName,
          dialogError
        } satisfies ProductDetachedSession}
        onDetach={closeProductDialog}
        actionsSx={{ px: 3, pb: 3 }}
        windowTitle={editingProduct ? `Editar produto - ${form.nome || 'Produto'}` : 'Novo produto'}
        actions={
          <>
            <Button onClick={closeProductDialog} disabled={savingProduct}>Cancelar</Button>
            {!editingProduct && canCreateProduct && (
              <Button variant="outlined" onClick={() => void handleSave(true)} disabled={savingProduct}>
                Salvar e proximo
              </Button>
            )}
            {canPersistCurrentProduct ? (
              <Button variant="contained" onClick={() => void handleSave(false)} disabled={savingProduct}>
                Salvar
              </Button>
            ) : null}
          </>
        }
      >
            {dialogError && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: 3, whiteSpace: 'pre-line' }}>
              {dialogError}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} lg={7}>
              <TextField
                label="Nome"
                value={form.nome}
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                inputRef={nameInputRef}
                helperText={productNameHelperText}
                InputProps={{
                  endAdornment: externalNameLookupRunning ? (
                    <InputAdornment position="end">
                      <CircularProgress size={18} />
                    </InputAdornment>
                  ) : undefined
                }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} lg={5}>
              <Stack spacing={1.25}>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} md={8}>
                  <TextField
                    label="Codigo principal"
                    value={form.codigoBarras ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, codigoBarras: event.target.value || null }))}
                    inputRef={barcodeInputRef}
                    fullWidth
                  />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      select
                      label="Tipo"
                      value={form.tipoCodigoPrincipal ?? 'Ean'}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tipoCodigoPrincipal: event.target.value as ProdutoCodigoTipo
                        }))
                      }
                      fullWidth
                    >
                      {productCodeTypeOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => void handleLookupByGtin()}
                    disabled={externalLookupLoading || !isLikelyGtin(form.codigoBarras) || !externalCatalogEnabled}
                  >
                    {externalLookupLoadingOrigin === 'gtin' ? 'Buscando...' : 'Consultar GTIN'}
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => void handleLookupByDescription()}
                    disabled={externalLookupLoading || normalizedExternalLookupName.length < 3 || !externalCatalogEnabled}
                  >
                    {externalNameLookupRunning ? 'Buscando...' : 'Buscar catalogo'}
                  </Button>
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  Leitor comum funciona como teclado. Voce tambem pode ler pela camera, pelo celular ou enviar a foto do produto para dentro do cadastro.
                </Typography>
              </Stack>
            </Grid>
            <Grid item xs={12}>
              <Card
                sx={{
                  borderRadius: 4,
                  border: '1px solid rgba(23, 75, 138, 0.14)',
                  background: 'linear-gradient(135deg, rgba(246,249,255,0.98), rgba(255,255,255,0.98))'
                }}
              >
                <CardContent sx={{ p: { xs: 2.25, md: 2.75 } }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={form.imagemUrl ? 8 : 9}>
                      <Stack spacing={0.9}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <ImageSearchRoundedIcon color="primary" />
                          <Typography sx={{ fontWeight: 800 }}>Busca visual do produto</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Envie a foto da embalagem deste dispositivo ou do celular. O backend tenta identificar o produto pela imagem com OCR Python, cruza com sites externos como Carrefour Brasil, Buscape e Open Facts, e voce continua livre para editar tudo dentro do sistema.
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Quando a busca externa encontra uma imagem comercial melhor, ela assume a imagem principal do cadastro para deixar a vitrine mais profissional.
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                          <Button
                            component="label"
                            variant="contained"
                            startIcon={<PhotoCameraBackRoundedIcon />}
                            disabled={productImageUploading || !canPersistCurrentProduct}
                          >
                            {productImageUploading ? 'Enviando foto...' : 'Foto deste dispositivo'}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              hidden
                              onChange={(event) => void handleLocalProductImageSelected(event)}
                            />
                          </Button>
                          <Button
                            variant="outlined"
                            startIcon={<PhoneIphoneRoundedIcon />}
                            disabled={!canPersistCurrentProduct}
                            onClick={() => setProductImageRemoteDialogOpen(true)}
                          >
                            Foto no celular
                          </Button>
                        </Stack>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
                          <TextField
                            label="Termo para buscar nos sites externos"
                            value={visualSearchTerm}
                            onChange={(event) => setVisualSearchTerm(event.target.value)}
                            fullWidth
                            autoComplete="off"
                            helperText={!form.imagemUrl
                              ? 'Envie primeiro a foto da embalagem. Depois informe o termo comercial para cruzar com os sites externos.'
                              : visualSearchFileName
                              ? `Ultima imagem recebida: ${visualSearchFileName}. Ajuste o termo e busque nos sites externos.`
                              : 'Use o nome da embalagem, marca ou linha comercial para cruzar com os dados externos.'}
                          />
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button
                              variant="contained"
                              onClick={() => void handleLookupByVisualSearch()}
                              disabled={externalLookupLoading || normalizedVisualSearchTerm.length < 3 || !externalCatalogEnabled || !form.imagemUrl}
                            >
                              {externalVisualLookupRunning ? 'Buscando sites...' : 'Buscar nos sites externos'}
                            </Button>
                            <Button
                              variant="text"
                              onClick={() => setVisualSearchTerm(buildPreferredVisualSearchTerm(form.nome, form.nome, visualSearchFileName))}
                              disabled={!normalizeExternalCatalogSearchTerm(form.nome)}
                            >
                              Usar nome do cadastro
                            </Button>
                          </Stack>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Fluxo profissional: a sugestao externa entra como apoio de cadastro. Depois de aplicar, nome, marca, descricao, imagem e preco continuam editaveis normalmente no seu sistema.
                        </Typography>
                      </Stack>
                    </Grid>
                    {form.imagemUrl ? (
                      <Grid item xs={12} md={4} lg={3}>
                        <Box
                          sx={{
                            borderRadius: 3,
                            overflow: 'hidden',
                            border: '1px solid rgba(23, 75, 138, 0.12)',
                            bgcolor: 'rgba(23, 75, 138, 0.04)',
                            minHeight: 150,
                            display: 'grid',
                            placeItems: 'center',
                            p: 1.25
                          }}
                        >
                          <Box
                            component="img"
                            src={form.imagemUrl}
                            alt={form.nome || 'Preview do produto'}
                            sx={{
                              width: '100%',
                              height: 150,
                              objectFit: 'contain'
                            }}
                          />
                        </Box>
                      </Grid>
                    ) : null}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              {externalCatalogStatus && (
                <Alert severity={externalCatalogStatus.disponivel ? 'info' : 'warning'} sx={{ borderRadius: 3, mb: externalLookup ? 2 : 0 }}>
                  {externalCatalogStatus.provedor ? `${externalCatalogStatus.provedor}: ` : ''}
                  {externalCatalogStatus.mensagem}
                </Alert>
              )}

              {externalLookup && (
                <Card sx={{ borderRadius: 4, border: '1px solid rgba(23, 75, 138, 0.16)' }}>
                  <CardContent>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5}>
                      {externalLookup.imagemUrl ? (
                        <CardMedia
                          component="img"
                          image={externalLookup.imagemUrl}
                          alt={externalLookup.nome ?? 'Produto externo'}
                          sx={{
                            width: { xs: '100%', md: 168 },
                            height: 168,
                            objectFit: 'contain',
                            borderRadius: 3,
                            bgcolor: 'rgba(23, 75, 138, 0.04)'
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: { xs: '100%', md: 168 },
                            height: 168,
                            borderRadius: 3,
                            bgcolor: 'rgba(23, 75, 138, 0.04)',
                            color: 'text.secondary',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            px: 2
                          }}
                        >
                          Imagem externa nao encontrada para esta sugestao.
                        </Box>
                      )}

                      <Stack spacing={1.25} sx={{ flex: 1 }}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
                        >
                          <Box>
                            <Typography variant="overline" color="text.secondary">
                              Busca inteligente externa
                            </Typography>
                            <Typography variant="h6">{externalLookup.nome ?? 'Produto localizado'}</Typography>
                            {(isDescriptionLookupOrigin(externalLookupOrigin) || isVisualLookupOrigin(externalLookupOrigin)) && externalLookupSearchTerm && (
                              <Typography variant="body2" color="text.secondary">
                                {isVisualLookupOrigin(externalLookupOrigin)
                                  ? `Busca visual cruzada com "${externalLookupSearchTerm}".`
                                  : `Resultado para "${externalLookupSearchTerm}".`}
                              </Typography>
                            )}
                          </Box>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip
                              size="small"
                              color="primary"
                              variant="outlined"
                              label={getExternalLookupOriginLabel(externalLookupOrigin)}
                            />
                            <Chip size="small" variant="outlined" label={externalLookup.provedor} />
                          </Stack>
                        </Stack>

                        {externalLookup.gtin && (
                          <Typography variant="body2" color="text.secondary">
                            {isLikelyGtin(externalLookup.gtin) ? `GTIN: ${externalLookup.gtin}` : `Referencia catalogada: ${externalLookup.gtin}`}
                          </Typography>
                        )}

                        {externalLookup.descricao && (
                          <Typography variant="body2" color="text.secondary">
                            {externalLookup.descricao}
                          </Typography>
                        )}

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
                          <Typography variant="body2"><strong>Marca:</strong> {externalLookup.marca ?? 'Nao informada'}</Typography>
                          <Typography variant="body2"><strong>NCM:</strong> {externalLookup.ncm ?? 'Nao informado'}</Typography>
                          <Typography variant="body2"><strong>Unidade sugerida:</strong> {externalLookup.unidadeSugerida ?? 'UN'}</Typography>
                          {externalLookup.precoMedio !== null && (
                            <Typography variant="body2"><strong>Preco medio:</strong> {formatCurrency(externalLookup.precoMedio)}</Typography>
                          )}
                        </Stack>

                        <Typography variant="body2" color="text.secondary">
                          {externalLookup.mensagem}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Os dados encontrados ja entram no cadastro local. A imagem externa passa a ser a principal da vitrine, e voce ainda pode ajustar qualquer campo antes de salvar.
                        </Typography>
                      </Stack>
                    </Stack>
                  </CardContent>
                  <CardActions sx={{ px: 2.5, pb: 2.5, pt: 0, gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="contained" onClick={applyExternalLookupToForm}>
                      Reaplicar dados externos no cadastro
                    </Button>
                    {externalLookup.fonteUrl ? (
                      <Button href={externalLookup.fonteUrl} target="_blank" rel="noreferrer">
                        Abrir fonte externa
                      </Button>
                    ) : null}
                    {externalLookup.buscaUrl ? (
                      <Button href={externalLookup.buscaUrl} target="_blank" rel="noreferrer">
                        Abrir busca do site
                      </Button>
                    ) : null}
                    {isVisualLookupOrigin(externalLookupOrigin) ? (
                      <Button
                        onClick={() => setVisualSearchTerm(buildPreferredVisualSearchTerm(form.nome, form.nome, visualSearchFileName))}
                        disabled={!normalizeExternalCatalogSearchTerm(form.nome)}
                      >
                        Trazer termo do cadastro
                      </Button>
                    ) : null}
                    {isVisualLookupOrigin(externalLookupOrigin) ? (
                      <Button
                        onClick={() => void handleLookupByVisualSearch()}
                        disabled={externalLookupLoading || normalizedVisualSearchTerm.length < 3 || !externalCatalogEnabled}
                      >
                        {externalVisualLookupRunning ? 'Atualizando...' : 'Atualizar busca visual'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void handleLookupByDescription()}
                        disabled={externalLookupLoading || normalizedExternalLookupName.length < 3 || !externalCatalogEnabled}
                      >
                        {externalNameLookupRunning ? 'Atualizando...' : 'Atualizar busca'}
                      </Button>
                    )}
                    <Button onClick={dismissExternalLookupSuggestion}>
                      Ocultar sugestao
                    </Button>
                  </CardActions>
                </Card>
              )}
            </Grid>
            <Grid item xs={12}>
              <ScannerActionBar
                contexto="produto-cadastro-codigo"
                title="Ler codigo do produto"
                description="Leia codigo de barras ou QR Code. Quando o QR vier estruturado, o sistema tenta distribuir os dados nas areas padrao e guardar o restante nos campos personalizados."
                defaultMode="CodigoBarras"
                availableModes={['CodigoBarras', 'QrCode']}
                onDetected={(code, format) => void handleScannedCode(code, format)}
                onFocusInput={() => barcodeInputRef.current?.focus()}
              />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Fluxo inteligente: voce pode capturar codigo de barras e QR no mesmo produto. Se o QR trouxer dados estruturados, o sistema preenche o que reconhece e guarda o restante em campos personalizados sem depender de novo desenvolvimento.
              </Alert>
            </Grid>
            <Grid item xs={12}>
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>Codigos alternativos</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use para QR interno, caixa secundaria ou outra identificacao operacional do produto.
                    </Typography>
                  </Box>
                  <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addAlternateCode}>
                    Adicionar codigo
                  </Button>
                </Stack>

                {form.codigosAlternativos.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum codigo alternativo cadastrado neste produto.
                  </Typography>
                ) : (
                  form.codigosAlternativos.map((item, index) => (
                    <Grid container spacing={1.25} key={`${index}-${item.codigo}`}>
                      <Grid item xs={12} md={7}>
                        <TextField
                          label={`Codigo alternativo ${index + 1}`}
                          value={item.codigo}
                          onChange={(event) => updateAlternateCode(index, 'codigo', event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          select
                          label="Tipo"
                          value={item.tipo}
                          onChange={(event) => updateAlternateCode(index, 'tipo', event.target.value)}
                          fullWidth
                        >
                          {productCodeTypeOptions.map((option) => (
                            <MenuItem key={`${index}-${option.value}`} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} md={1}>
                        <IconButton color="error" onClick={() => removeAlternateCode(index)} sx={{ mt: { md: 1 } }}>
                          <DeleteOutlineRoundedIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))
                )}
              </Stack>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Descricao"
                value={form.descricao ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value || null }))}
                helperText="Esta descricao aparece no catalogo digital, na consulta de preco e ajuda o operador a identificar o item em telas menores."
                fullWidth
                multiline
                minRows={2}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Marca"
                value={form.marca ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, marca: event.target.value || null }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Autocomplete
                fullWidth
                options={ncmOptions}
                value={matchingNcmOption}
                inputValue={form.ncm ?? ''}
                loading={ncmOptionsLoading}
                filterOptions={(options) => options}
                isOptionEqualToValue={(option, value) => option.codigo === value.codigo}
                getOptionLabel={(option) => `${option.codigo} - ${option.descricao}`}
                noOptionsText={
                  normalizedNcm.length === 8
                    ? 'NCM ainda nao encontrado na tabela interna. Voce pode cadastrar rapido ou aplicar a tributacao para criar o registro provisoriamente.'
                    : 'Digite o codigo ou parte da descricao oficial para buscar o NCM.'
                }
                onInputChange={(_, nextValue, reason) => {
                  if (reason === 'reset') {
                    return;
                  }

                  lastAutomaticFiscalSuggestionKeyRef.current = null;
                  clearFieldErrors('ncm');
                  setForm((current) => ({ ...current, ncm: nextValue || null }));
                }}
                onChange={(_, option) => {
                  if (!option) {
                    return;
                  }

                  lastAutomaticFiscalSuggestionKeyRef.current = null;
                  clearFieldErrors('ncm');
                  const nextForm = {
                    ...form,
                    ncm: option.codigo,
                    cest: form.cest ?? option.cestPadraoCodigo ?? null
                  };

                  setForm(nextForm);
                  void applyFiscalSuggestionByNcm(true, nextForm);
                }}
                renderOption={(props, option) => (
                  <Box component="li" {...props} sx={{ py: 1.1 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{option.codigo}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {option.descricao}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.cestPadraoCodigo ? `CEST padrao ${option.cestPadraoCodigo}` : 'Sem CEST padrao'} · {option.sujeitoSt ? 'Possui indicio de ST' : 'Sem ST cadastrada'}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="NCM"
                    onBlur={() => {
                      void applyFiscalSuggestionByNcm();
                    }}
                    error={Boolean(fieldErrors.ncm)}
                    helperText={resolveFieldHelperText(
                      'ncm',
                      matchingNcmOption?.observacaoCadastro
                        ?? (matchingNcmOption
                          ? `${matchingNcmOption.descricao}${matchingNcmOption.cestPadraoCodigo ? ` · CEST ${matchingNcmOption.cestPadraoCodigo}` : ''}`
                          : 'Ao informar 8 digitos, o sistema busca o NCM oficial do Brasil, cadastra o registro ausente quando necessario e sugere CST, PIS, COFINS, ICMS, IPI e CFOP.')
                    )}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {ncmOptionsLoading ? <CircularProgress size={18} color="inherit" sx={{ mr: 1 }} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      )
                    }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Imagem do produto"
                value={form.imagemUrl ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, imagemUrl: event.target.value || null }))}
                helperText="Use uma imagem leve e frontal. Ela sera reaproveitada na vitrine digital para celular, computador e terminais Android."
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Nome, descricao, imagem, preco de venda e status ativo agora alimentam a vitrine digital do produto. Assim voce cadastra uma vez e reaproveita o mesmo item no PDV, na consulta de preco e no catalogo responsivo.
              </Alert>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Resumo comercial do comprador"
                value={form.catalogoResumo ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, catalogoResumo: event.target.value || null }))}
                helperText="Texto mais vendedor para o portal do comprador. Se ficar vazio, o sistema usa a descricao normal."
                fullWidth
                multiline
                minRows={2}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Titulo da promocao"
                value={form.promocaoTitulo ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, promocaoTitulo: event.target.value || null }))}
                helperText="Ex.: Oferta da semana, Leve agora."
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <MoneyInput
                label="Preco promocional"
                value={form.precoPromocional ?? 0}
                onChange={(value) => setForm((current) => ({ ...current, precoPromocional: value > 0 ? value : null }))}
                helperText="Opcional. Deve ser menor que o preco de venda."
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Inicio da promocao"
                type="datetime-local"
                value={form.promocaoInicioUtc ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, promocaoInicioUtc: event.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Fim da promocao"
                type="datetime-local"
                value={form.promocaoFimUtc ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, promocaoFimUtc: event.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={form.destaqueCatalogoComprador}
                    onChange={(event) => setForm((current) => ({ ...current, destaqueCatalogoComprador: event.target.checked }))}
                  />
                )}
                label="Destacar este item no catalogo do comprador"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Fornecedor (cliente/parceiro)"
                value={form.clienteFornecedorId ?? ''}
                onChange={(event) => handleSupplierChange(event.target.value)}
                helperText="Selecione um fornecedor com documento real cadastrado. Se o QR trouxer CNPJ/CPF ou nome, o sistema tenta vincular automaticamente."
                fullWidth
              >
                <MenuItem value="">Sem fornecedor principal</MenuItem>
                {supplierClients.map((client) => (
                  <MenuItem key={client.clienteId} value={client.clienteId}>
                    {client.nome}{client.documento ? ` · ${client.documento}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="CPF/CNPJ do fornecedor"
                value={selectedSupplierDocument ? formatCpfCnpj(selectedSupplierDocument) : ''}
                helperText={
                  selectedSupplier
                    ? selectedSupplierDocument
                      ? 'Documento real herdado do cadastro do fornecedor.'
                      : 'Esse fornecedor ainda nao possui CPF/CNPJ cadastrado.'
                    : 'Selecione um fornecedor para usar o documento real dele no vinculo do produto.'
                }
                InputProps={{ readOnly: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Codigo do item no fornecedor"
                value={form.codigoProdutoFornecedor ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value || null;
                  setForm((current) => {
                    const principalIndex = current.fornecedores.findIndex((item) => item.fornecedorPrincipal);
                    if (principalIndex < 0) {
                      return {
                        ...current,
                        codigoProdutoFornecedor: nextValue
                      };
                    }

                    return syncProductSupplierForm({
                      ...current,
                      codigoProdutoFornecedor: nextValue,
                      fornecedores: current.fornecedores.map((item, itemIndex) =>
                        itemIndex === principalIndex
                          ? {
                              ...item,
                              codigoProdutoFornecedor: nextValue
                            }
                          : item
                      )
                    });
                  });
                }}
                helperText={
                  selectedSupplier
                    ? `Se ${selectedSupplier.nome} usa um codigo proprio para este item, informe aqui.`
                    : 'Primeiro escolha o fornecedor principal para vincular um codigo especifico do item.'
                }
                disabled={!selectedSupplier}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Ultima NF de compra"
                value={form.ultimaNotaFiscalCompra ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, ultimaNotaFiscalCompra: event.target.value || null }))}
                helperText="Numero ou referencia da ultima nota fiscal de entrada."
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Paper variant="outlined" sx={{ borderRadius: 4, p: 2 }}>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>Fornecedores do produto</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Cadastre fornecedores alternativos, compare preco, prazo e mantenha um fornecedor principal compativel com o fluxo atual.
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      startIcon={<AddRoundedIcon />}
                      onClick={() => addSupplierLink()}
                    >
                      Adicionar fornecedor
                    </Button>
                  </Stack>

                  {form.fornecedores.length === 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      Nenhum fornecedor alternativo cadastrado ainda. O fornecedor principal selecionado acima continua sendo aceito, e voce pode adicionar outros fornecedores aqui para comparar compra, prazo e ultimo preco pago.
                    </Alert>
                  ) : (
                    <Stack spacing={1.5}>
                      {form.fornecedores.map((supplierLink, index) => {
                        const linkedSupplier = supplierClients.find((item) => item.clienteId === supplierLink.clienteFornecedorId) ?? null;

                        return (
                          <Paper key={`supplier-link-${index}`} variant="outlined" sx={{ borderRadius: 3, p: 1.5 }}>
                            <Grid container spacing={1.25}>
                              <Grid item xs={12} md={4}>
                                <TextField
                                  select
                                  label={`Fornecedor ${index + 1}`}
                                  value={supplierLink.clienteFornecedorId ?? ''}
                                  onChange={(event) => updateSupplierLink(index, 'clienteFornecedorId', event.target.value || null)}
                                  helperText={linkedSupplier?.documento ? `Documento: ${formatCpfCnpj(linkedSupplier.documento)}` : 'Selecione um fornecedor ativo marcado no cadastro de clientes.'}
                                  fullWidth
                                >
                                  <MenuItem value="">Selecione</MenuItem>
                                  {supplierClients.map((client) => (
                                    <MenuItem key={client.clienteId} value={client.clienteId}>
                                      {client.nome}{client.documento ? ` · ${client.documento}` : ''}
                                    </MenuItem>
                                  ))}
                                </TextField>
                              </Grid>
                              <Grid item xs={12} md={4}>
                                <TextField
                                  label="Nome no fornecedor"
                                  value={supplierLink.nomeProdutoFornecedor ?? ''}
                                  onChange={(event) => updateSupplierLink(index, 'nomeProdutoFornecedor', event.target.value || null)}
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={4}>
                                <TextField
                                  label="Codigo no fornecedor"
                                  value={supplierLink.codigoProdutoFornecedor ?? ''}
                                  onChange={(event) => updateSupplierLink(index, 'codigoProdutoFornecedor', event.target.value || null)}
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={2}>
                                <TextField
                                  label="Preco compra"
                                  type="number"
                                  value={renderNullableNumber(supplierLink.precoCompra)}
                                  onChange={(event) => updateSupplierLink(index, 'precoCompra', parseNullableNumber(event.target.value))}
                                  inputProps={{ min: 0, step: '0.01' }}
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={2}>
                                <TextField
                                  label="Ultimo preco pago"
                                  type="number"
                                  value={renderNullableNumber(supplierLink.ultimoPrecoPago)}
                                  onChange={(event) => updateSupplierLink(index, 'ultimoPrecoPago', parseNullableNumber(event.target.value))}
                                  inputProps={{ min: 0, step: '0.01' }}
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={2}>
                                <TextField
                                  label="Qtd. minima"
                                  type="number"
                                  value={renderNullableNumber(supplierLink.quantidadeMinima)}
                                  onChange={(event) => updateSupplierLink(index, 'quantidadeMinima', parseNullableNumber(event.target.value))}
                                  inputProps={{ min: 0, step: '0.001' }}
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={2}>
                                <TextField
                                  label="Prazo entrega"
                                  type="number"
                                  value={renderNullableNumber(supplierLink.prazoEntregaDias)}
                                  onChange={(event) => updateSupplierLink(index, 'prazoEntregaDias', parseNullableInteger(event.target.value))}
                                  inputProps={{ min: 0, step: '1' }}
                                  helperText="Dias"
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={2}>
                                <TextField
                                  label="Ultima compra"
                                  type="date"
                                  value={supplierLink.ultimaCompraEm ?? ''}
                                  onChange={(event) => updateSupplierLink(index, 'ultimaCompraEm', event.target.value || null)}
                                  InputLabelProps={{ shrink: true }}
                                  fullWidth
                                />
                              </Grid>
                              <Grid item xs={12} md={2}>
                                <Stack direction={{ xs: 'column', sm: 'row', md: 'column' }} spacing={0.5}>
                                  <FormControlLabel
                                    control={(
                                      <Checkbox
                                        checked={supplierLink.fornecedorPrincipal}
                                        onChange={() => setSupplierPrincipal(index)}
                                      />
                                    )}
                                    label="Principal"
                                  />
                                  <FormControlLabel
                                    control={(
                                      <Checkbox
                                        checked={supplierLink.ativo}
                                        onChange={(event) => updateSupplierLink(index, 'ativo', event.target.checked)}
                                      />
                                    )}
                                    label="Ativo"
                                  />
                                  <Button color="error" onClick={() => removeSupplierLink(index)}>
                                    Remover
                                  </Button>
                                </Stack>
                              </Grid>
                              {(supplierLink.precoCompra != null || supplierLink.ultimoPrecoPago != null || supplierLink.prazoEntregaDias != null) && (
                                <Grid item xs={12}>
                                  <Typography variant="caption" color="text.secondary">
                                    {buildSupplierComparisonSummary(supplierLink)}
                                  </Typography>
                                </Grid>
                              )}
                            </Grid>
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            </Grid>
            {selectedSupplier && !selectedSupplierDocument && (
              <Grid item xs={12}>
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  O fornecedor {selectedSupplier.nome} ainda nao possui CPF/CNPJ cadastrado. Complete esse dado no cadastro de clientes para o vinculo automatico funcionar por QR, codigo de barras e fluxo de compra.
                </Alert>
              </Grid>
            )}
            <Grid item xs={12}>
              <Stack spacing={1.25}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>Area fiscal padrao do sistema</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Preencha aqui os dados tributarios principais do produto. Agora o cadastro separa CFOP para operacoes dentro e fora do estado e permite usar um perfil fiscal padrao do item.
                  </Typography>
                </Box>
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Regra pratica: use CSOSN para empresa no Simples Nacional e CST ICMS para regime normal. Regime atual da empresa: {formatRegimeTributario(regimeTributarioEmpresa)}.
                </Alert>
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  As sugestoes de CFOP abaixo cobrem o cenario padrao de revenda ou producao propria. ST, devolucao, bonificacao, transferencia, industrializacao por encomenda e operacoes com consumidor final podem exigir outro CFOP.
                </Alert>
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  NCM e a classificacao oficial do Brasil/Mercosul, nao um cadastro "do mundo". Lote, fabricacao e validade normalmente vem da etiqueta do item, XML de compra ou QR/GS1, e nao de uma base publica de NCM.
                </Alert>
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Perfil fiscal do item"
                value={form.perfilFiscalPadrao ?? ''}
                onChange={(event) => {
                  clearFieldErrors('perfilFiscalPadrao');
                  const nextProfile = (event.target.value || null) as ProdutoPerfilFiscalPadrao | null;
                  setForm((current) => applyFiscalProfileSuggestion(
                    { ...current, perfilFiscalPadrao: nextProfile },
                    false
                  ));
                }}
                error={Boolean(fieldErrors.perfilFiscalPadrao)}
                helperText={
                  resolveFieldHelperText(
                    'perfilFiscalPadrao',
                    form.perfilFiscalPadrao
                    ? getFiscalProfileDescription(form.perfilFiscalPadrao)
                    : 'Escolha um perfil para sugerir CFOPs padrao e acelerar o cadastro.'
                  )
                }
                fullWidth
              >
                <MenuItem value="">Personalizado</MenuItem>
                {availableFiscalProfiles.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="CEST"
                value={form.cest ?? ''}
                onChange={(event) => {
                  clearFieldErrors('cest');
                  setForm((current) => ({ ...current, cest: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.cest)}
                helperText={resolveFieldHelperText('cest', 'Codigo Especificador da Substituicao Tributaria.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Origem fiscal"
                value={form.origemFiscal ?? ''}
                onChange={(event) => {
                  clearFieldErrors('origemFiscal');
                  setForm((current) => ({ ...current, origemFiscal: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.origemFiscal)}
                helperText={resolveFieldHelperText('origemFiscal', 'Origem da mercadoria para emissao fiscal.')}
                fullWidth
              >
                <MenuItem value="">Nao informado</MenuItem>
                {availableOrigins.map((option) => (
                  <MenuItem key={option.codigo} value={option.codigo}>
                    {option.codigo} - {option.descricao}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Beneficio fiscal"
                value={form.beneficioFiscalCodigo ?? ''}
                onChange={(event) => {
                  clearFieldErrors('beneficioFiscalCodigo');
                  setForm((current) => ({ ...current, beneficioFiscalCodigo: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.beneficioFiscalCodigo)}
                helperText={resolveFieldHelperText(
                  'beneficioFiscalCodigo',
                  availableBeneficioFiscalOptions.length > 0
                    ? 'Codigo de beneficio fiscal cadastrado para a UF e o NCM.'
                    : 'Nenhum beneficio fiscal foi parametrizado ainda para esta empresa.'
                )}
                fullWidth
              >
                <MenuItem value="">Nao informado</MenuItem>
                {availableBeneficioFiscalOptions.map((option) => (
                  <MenuItem key={option.codigo} value={option.codigo}>
                    {option.codigo} - {option.descricao}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Codigo ANP"
                value={form.codigoAnp ?? ''}
                onChange={(event) => {
                  clearFieldErrors('codigoAnp');
                  setForm((current) => ({ ...current, codigoAnp: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.codigoAnp)}
                helperText={resolveFieldHelperText('codigoAnp', 'Obrigatorio apenas para combustiveis, gases e derivados monitorados pela ANP.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Unidade tributavel"
                value={form.unidadeTributavel ?? ''}
                onChange={(event) => {
                  clearFieldErrors('unidadeTributavel');
                  setForm((current) => ({ ...current, unidadeTributavel: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.unidadeTributavel)}
                helperText={resolveFieldHelperText('unidadeTributavel', 'Unidade usada no XML fiscal. Normalmente acompanha a unidade comercial.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="EX TIPI"
                value={form.exTipi ?? ''}
                onChange={(event) => {
                  clearFieldErrors('exTipi');
                  setForm((current) => ({ ...current, exTipi: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.exTipi)}
                helperText={resolveFieldHelperText('exTipi', 'Use somente quando o NCM possuir excecao de TIPI aplicavel ao item.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant="contained"
                  onClick={() => {
                    void applyFiscalSuggestionByNcm(true);
                  }}
                  disabled={!canApplyFiscalSuggestion || applyingFiscalSuggestion}
                  startIcon={applyingFiscalSuggestion ? <CircularProgress color="inherit" size={16} /> : undefined}
                >
                  Buscar tributacao automatica
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    void handleQuickCreateNcm();
                  }}
                  disabled={!canApplyFiscalSuggestion || quickCreatingNcm || Boolean(matchingNcmOption)}
                >
                  {quickCreatingNcm ? 'Cadastrando NCM...' : 'Cadastrar NCM ausente'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setForm((current) => applyFiscalProfileSuggestion(current, true))}
                  disabled={!form.perfilFiscalPadrao}
                >
                  Aplicar sugestao de CFOP
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  O sistema pode preencher automaticamente a base fiscal pelo NCM e, se voce ajustar so o perfil, reaplicar apenas os CFOPs padrao.
                </Typography>
              </Stack>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="CFOP compra dentro do estado"
                value={form.cfopCompraPadrao ?? ''}
                onChange={(event) => {
                  clearFieldErrors('cfopCompraPadrao');
                  setForm((current) => ({ ...current, cfopCompraPadrao: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.cfopCompraPadrao)}
                helperText={resolveFieldHelperText('cfopCompraPadrao', 'Operacao interna de entrada.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="CFOP compra fora do estado"
                value={form.cfopCompraInterestadual ?? ''}
                onChange={(event) => {
                  clearFieldErrors('cfopCompraInterestadual');
                  setForm((current) => ({ ...current, cfopCompraInterestadual: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.cfopCompraInterestadual)}
                helperText={resolveFieldHelperText('cfopCompraInterestadual', 'Operacao interestadual de entrada.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="CFOP venda dentro do estado"
                value={form.cfopVendaPadrao ?? ''}
                onChange={(event) => {
                  clearFieldErrors('cfopVendaPadrao');
                  setForm((current) => ({ ...current, cfopVendaPadrao: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.cfopVendaPadrao)}
                helperText={resolveFieldHelperText('cfopVendaPadrao', 'Operacao interna de saida.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="CFOP venda fora do estado"
                value={form.cfopVendaInterestadual ?? ''}
                onChange={(event) => {
                  clearFieldErrors('cfopVendaInterestadual');
                  setForm((current) => ({ ...current, cfopVendaInterestadual: event.target.value || null }));
                }}
                error={Boolean(fieldErrors.cfopVendaInterestadual)}
                helperText={resolveFieldHelperText('cfopVendaInterestadual', 'Operacao interestadual de saida.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="CSOSN"
                value={form.csosn ?? ''}
                onChange={(event) => handleCsosnChange(event.target.value)}
                error={Boolean(fieldErrors.csosn)}
                helperText={resolveFieldHelperText(
                  'csosn',
                  empresaUsaSimples
                    ? 'Obrigatorio para empresa no Simples Nacional.'
                    : 'Bloqueado porque a empresa nao usa Simples Nacional.'
                )}
                disabled={!empresaUsaSimples}
                fullWidth
              >
                <MenuItem value="">Nao informado</MenuItem>
                {availableCsosnOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="CST ICMS"
                value={form.cstIcms ?? ''}
                onChange={(event) => handleCstIcmsChange(event.target.value)}
                error={Boolean(fieldErrors.cstIcms)}
                helperText={resolveFieldHelperText(
                  'cstIcms',
                  empresaUsaSimples
                    ? 'Bloqueado porque a empresa usa Simples Nacional.'
                    : 'Obrigatorio para empresa fora do Simples Nacional.'
                )}
                disabled={empresaUsaSimples}
                fullWidth
              >
                <MenuItem value="">Nao informado</MenuItem>
                {availableCstIcmsOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="CST PIS"
                value={form.cstPis ?? ''}
                onChange={(event) => handleCstPisChange(event.target.value)}
                error={Boolean(fieldErrors.cstPis)}
                helperText={resolveFieldHelperText(
                  'cstPis',
                  form.cstPis === '01' && sugestaoPisCofins
                    ? `CST PIS 01 aplica PIS ${formatAliquotaPreview(sugestaoPisCofins?.aliquotaPis)} e COFINS ${formatAliquotaPreview(sugestaoPisCofins?.aliquotaCofins)} para ${formatRegimeTributario(regimeTributarioEmpresa)}.`
                    : undefined
                )}
                fullWidth
              >
                <MenuItem value="">Nao informado</MenuItem>
                {availableCstPisCofinsOptions.map((option) => (
                  <MenuItem key={`pis-${option.codigo}`} value={option.codigo}>
                    {option.codigo} - {option.descricao}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                select
                label="CST COFINS"
                value={form.cstCofins ?? ''}
                onChange={(event) => handleCstCofinsChange(event.target.value)}
                error={Boolean(fieldErrors.cstCofins)}
                helperText={resolveFieldHelperText('cstCofins', form.cstPis === '01' ? 'Se nao houver excecao fiscal, use 01 para acompanhar o PIS padrao.' : undefined)}
                fullWidth
              >
                <MenuItem value="">Nao informado</MenuItem>
                {availableCstPisCofinsOptions.map((option) => (
                  <MenuItem key={`cofins-${option.codigo}`} value={option.codigo}>
                    {option.codigo} - {option.descricao}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Aliquota ICMS %"
                type="number"
                value={renderNullableNumber(form.aliquotaIcms)}
                onChange={(event) => handleAliquotaChange('aliquotaIcms', event.target.value)}
                error={Boolean(fieldErrors.aliquotaIcms)}
                helperText={resolveFieldHelperText('aliquotaIcms')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Aliquota IPI %"
                type="number"
                value={renderNullableNumber(form.aliquotaIpi)}
                onChange={(event) => handleAliquotaChange('aliquotaIpi', event.target.value)}
                error={Boolean(fieldErrors.aliquotaIpi)}
                helperText={resolveFieldHelperText('aliquotaIpi', 'Quando houver IPI, informe a aliquota valida para o item.')}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Aliquota PIS %"
                type="number"
                value={renderNullableNumber(form.aliquotaPis)}
                onChange={(event) => handleAliquotaChange('aliquotaPis', event.target.value)}
                error={Boolean(fieldErrors.aliquotaPis)}
                helperText={resolveFieldHelperText('aliquotaPis', buildAliquotaHelperText('PIS', sugestaoPisCofins?.aliquotaPis, form.aliquotaPis))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Aliquota COFINS %"
                type="number"
                value={renderNullableNumber(form.aliquotaCofins)}
                onChange={(event) => handleAliquotaChange('aliquotaCofins', event.target.value)}
                error={Boolean(fieldErrors.aliquotaCofins)}
                helperText={resolveFieldHelperText('aliquotaCofins', buildAliquotaHelperText('COFINS', sugestaoPisCofins?.aliquotaCofins, form.aliquotaCofins))}
                fullWidth
              />
            </Grid>
            {precisaJustificativaFiscal && (
              <Grid item xs={12}>
                <Stack spacing={1.5}>
                  <Alert severity="warning" sx={{ borderRadius: 3 }}>
                    Alteracao fiscal manual detectada. Informe a justificativa para salvar e manter a auditoria desse ajuste.
                  </Alert>
                  {pisCofinsDiferentes && (
                    <Box>
                      <FormControlLabel
                        control={(
                          <Checkbox
                            checked={form.confirmaPisCofinsDiferentes ?? false}
                            onChange={(event) => {
                              clearFieldErrors('confirmaPisCofinsDiferentes', 'justificativaFiscalManual');
                              setForm((current) => ({
                                ...current,
                                confirmaPisCofinsDiferentes: event.target.checked
                              }));
                            }}
                          />
                        )}
                        label="Confirmo que CST PIS e CST COFINS devem permanecer diferentes neste item."
                      />
                      {fieldErrors.confirmaPisCofinsDiferentes && (
                        <Typography variant="body2" color="error.main">
                          {fieldErrors.confirmaPisCofinsDiferentes}
                        </Typography>
                      )}
                    </Box>
                  )}
                  <TextField
                    label="Justificativa fiscal manual"
                    value={form.justificativaFiscalManual ?? ''}
                    onChange={(event) => {
                      clearFieldErrors('justificativaFiscalManual', 'confirmaPisCofinsDiferentes');
                      setForm((current) => ({
                        ...current,
                        justificativaFiscalManual: event.target.value || null
                      }));
                    }}
                    error={Boolean(fieldErrors.justificativaFiscalManual)}
                    helperText={resolveFieldHelperText('justificativaFiscalManual', 'Explique o motivo da alteracao manual para registrar a auditoria fiscal do produto.')}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                </Stack>
              </Grid>
            )}
            <Grid item xs={12}>
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>Campos personalizados e dados capturados</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Aqui ficam os dados extras vindos do QR Code e os campos livres do produto. Os campos padrao da empresa entram automaticamente em novos cadastros.
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                    <Button variant="outlined" onClick={openTemplateDialog}>
                      Gerenciar padroes da empresa
                    </Button>
                    <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addCustomField}>
                      Adicionar campo
                    </Button>
                  </Stack>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                  {trackedProductFieldPresets.map((preset) => (
                    <Button
                      key={preset.key}
                      variant="outlined"
                      size="small"
                      onClick={() => addTrackedCustomField(preset.key)}
                      disabled={hasCustomFieldKey(form.camposCustomizados, preset.key)}
                    >
                      {hasCustomFieldKey(form.camposCustomizados, preset.key)
                        ? `${preset.label} pronto`
                        : `Adicionar ${preset.label}`}
                    </Button>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Para produtos pereciveis, o ideal e controlar validade e fabricacao por lote. Enquanto isso, estes campos ajudam o cadastro e tambem recebem dados lidos do QR/GS1 quando existirem.
                </Typography>

                {form.camposCustomizados.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum campo extra salvo ainda. Quando um QR estruturado trouxer mais informacoes, elas aparecem aqui para edicao.
                  </Typography>
                ) : (
                  form.camposCustomizados.map((item, index) => (
                    <Grid container spacing={1.25} key={`${index}-${item.chave}`}>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label={`Campo ${index + 1}`}
                          value={item.chave}
                          onChange={(event) => updateCustomField(index, 'chave', event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={7}>
                        <TextField
                          label="Valor"
                          value={item.valor ?? ''}
                          onChange={(event) => updateCustomField(index, 'valor', event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={1}>
                        <IconButton color="error" onClick={() => removeCustomField(index)} sx={{ mt: { md: 1 } }}>
                          <DeleteOutlineRoundedIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  ))
                )}
              </Stack>
            </Grid>
            <Grid item xs={12}>
              <Card variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden' }}>
                <Grid container>
                  <Grid item xs={12} md={3}>
                    {form.imagemUrl ? (
                      <Box
                        component="img"
                        src={form.imagemUrl}
                        alt={form.nome || 'Produto'}
                        sx={{
                          width: '100%',
                          height: '100%',
                          minHeight: 180,
                          objectFit: 'contain',
                          bgcolor: 'rgba(23, 75, 138, 0.04)',
                          p: 2
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          minHeight: 180,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: 'rgba(23, 75, 138, 0.05)',
                          color: 'primary.main',
                          fontSize: 32,
                          fontWeight: 900
                        }}
                      >
                        {(form.nome.trim().slice(0, 2) || 'PD').toUpperCase()}
                      </Box>
                    )}
                  </Grid>
                  <Grid item xs={12} md={9}>
                    <CardContent>
                      <Stack spacing={1.25}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap justifyContent="space-between">
                          <Box>
                            <Typography variant="overline" color="text.secondary">
                              Previa da vitrine digital
                            </Typography>
                            <Typography variant="h6">
                              {form.nome.trim() || 'Produto sem nome ainda'}
                            </Typography>
                          </Box>
                          <Chip
                            label={form.ativo ? 'Ativo para exibir' : 'Inativo'}
                            color={form.ativo ? 'success' : 'default'}
                            variant={form.ativo ? 'filled' : 'outlined'}
                          />
                        </Stack>
                        <Typography color="text.secondary">
                          {form.catalogoResumo?.trim() || form.descricao?.trim() || 'A descricao cadastrada vai aparecer aqui para ajudar quem consulta pelo celular, computador ou maquininha.'}
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
                          <Typography variant="body2"><strong>Preco:</strong> {formatCurrency(form.precoVenda)}</Typography>
                          {form.precoPromocional ? (
                            <Typography variant="body2"><strong>Oferta:</strong> {formatCurrency(form.precoPromocional)}</Typography>
                          ) : null}
                          <Typography variant="body2"><strong>Unidade:</strong> {form.unidadeMedida || 'UN'}</Typography>
                          <Typography variant="body2"><strong>Marca:</strong> {form.marca?.trim() || 'Nao informada'}</Typography>
                          <Typography variant="body2"><strong>Codigo:</strong> {form.codigoBarras?.trim() || 'Sem codigo principal'}</Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Grid>
                </Grid>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <MoneyInput
                label="Preco venda"
                value={form.precoVenda}
                onChange={(value) => setForm((current) => ({ ...current, precoVenda: value }))}
                helperText="Preco usado no PDV, na consulta de preco e na nova vitrine digital."
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <MoneyInput label="Preco custo" value={form.precoCusto} onChange={(value) => setForm((current) => ({ ...current, precoCusto: value }))} fullWidth />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Estoque"
                type="number"
                value={form.estoqueAtual}
                onChange={(event) => setForm((current) => ({ ...current, estoqueAtual: Number(event.target.value) }))}
                disabled={form.controlaLote}
                helperText={form.controlaLote ? 'O saldo passa a ser a soma dos lotes.' : undefined}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Minimo"
                type="number"
                value={form.estoqueMinimo}
                onChange={(event) => setForm((current) => ({ ...current, estoqueMinimo: Number(event.target.value) }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                label="Unidade"
                value={form.unidadeMedida}
                onChange={(event) => {
                  const nextUnit = event.target.value;
                  setForm((current) => ({
                    ...current,
                    unidadeMedida: nextUnit,
                    unidadeTributavel:
                      !current.unidadeTributavel || current.unidadeTributavel === current.unidadeMedida
                        ? nextUnit
                        : current.unidadeTributavel
                  }));
                }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={form.controlaEstoque}
                      disabled={form.controlaLote}
                      onChange={(event) => setForm((current) => ({ ...current, controlaEstoque: event.target.checked }))}
                    />
                  )}
                  label="Controla estoque"
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={form.controlaLote}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setForm((current) => ({
                          ...current,
                          controlaLote: checked,
                          controlaEstoque: checked ? true : current.controlaEstoque,
                          estoqueAtual: checked ? 0 : current.estoqueAtual,
                          politicaBaixaLote: checked ? (current.politicaBaixaLote ?? 'FEFO') : current.politicaBaixaLote
                        }));
                      }}
                    />
                  )}
                  label="Controla por lote"
                />
                <FormControlLabel
                  control={<Checkbox checked={form.ativo} onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))} />}
                  label="Produto ativo"
                />
              </Stack>
            </Grid>
            <Grid item xs={12}>
              <Alert severity={form.ativo ? 'info' : 'warning'} sx={{ borderRadius: 3 }}>
                {form.ativo
                  ? 'Produtos ativos podem aparecer na vitrine digital, na consulta de preco e no PDV conforme permissao e disponibilidade.'
                  : 'Produto inativo continua no cadastro, mas deixa de aparecer nos fluxos operacionais e na vitrine digital.'}
              </Alert>
            </Grid>
            {form.controlaLote && (
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  label="Politica de baixa"
                  value={form.politicaBaixaLote ?? 'FEFO'}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    politicaBaixaLote: event.target.value as PoliticaBaixaEstoqueLote
                  }))}
                  helperText={selectedLotPolicy.description}
                  fullWidth
                >
                  {lotPolicyOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            {editingProduct && canDeleteProduct && (
              <Grid item xs={12}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <Button color="warning" onClick={() => { setDeleteProduct(editingProduct); setDeletePermanent(false); }}>
                    Inativar produto
                  </Button>
                  <Button color="error" onClick={() => { setDeleteProduct(editingProduct); setDeletePermanent(true); }}>
                    Excluir permanente
                  </Button>
                </Stack>
              </Grid>
            )}
            {supplierClients.length === 0 && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  {canViewClientsModule
                    ? 'Nenhum cliente marcado como fornecedor foi encontrado. Ative essa opcao no cadastro de clientes para vincular produtos a quem fornece a mercadoria.'
                    : 'A base de clientes e fornecedores nao esta liberada para este usuario. O produto pode ser salvo, mas sem vinculo de fornecedor.'}
                </Alert>
              </Grid>
            )}
            {!form.controlaEstoque && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Este produto nao controla estoque. O campo de estoque continua disponivel para cadastro inicial e consultas, mas nao sera baixado automaticamente na venda.
                </Alert>
              </Grid>
            )}
            {form.controlaLote && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  O produto passa a usar rastreio por lote com {selectedLotPolicy.label}. Fabricacao, validade e saldo ficam por entrada de lote, e a venda baixa automaticamente seguindo essa politica.
                </Alert>
              </Grid>
            )}
            {!editingProduct && form.controlaLote && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Salve o produto primeiro para liberar o registro das entradas de lote. Depois disso, o saldo sera alimentado so pelos lotes.
                </Alert>
              </Grid>
            )}
            {lotControlPendingSave && (
              <Grid item xs={12}>
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  O controle por lote foi ativado neste rascunho. Salve as alteracoes para habilitar a entrada de lotes neste produto.
                </Alert>
              </Grid>
            )}
            {savedLotControlEnabled && (
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 700 }}>Lotes e validade</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Registre cada entrada com lote, fabricacao e validade. A baixa das vendas segue {selectedLotPolicy.label}.
                        </Typography>
                      </Box>
                      <FormControlLabel
                        control={(
                          <Checkbox
                            checked={onlyLotsWithBalance}
                            onChange={(event) => setOnlyLotsWithBalance(event.target.checked)}
                          />
                        )}
                        label="Mostrar apenas com saldo"
                      />
                    </Stack>

                    {lotEntryError && (
                      <Alert severity="error" sx={{ borderRadius: 3 }}>
                        {lotEntryError}
                      </Alert>
                    )}

                    {productLotsError && (
                      <Alert severity="warning" sx={{ borderRadius: 3 }}>
                        {productLotsError}
                      </Alert>
                    )}

                    <Grid container spacing={1.25}>
                      <Grid item xs={12} md={2}>
                        <TextField
                          label="Lote"
                          value={lotEntryForm.codigoLote}
                          onChange={(event) => setLotEntryForm((current) => ({ ...current, codigoLote: event.target.value }))}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <TextField
                          label="Quantidade"
                          type="number"
                          value={lotEntryForm.quantidadeEntrada}
                          onChange={(event) => setLotEntryForm((current) => ({
                            ...current,
                            quantidadeEntrada: Number(event.target.value)
                          }))}
                          inputProps={{ min: 0, step: '0.001' }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <TextField
                          label="Entrada"
                          type="date"
                          value={lotEntryForm.dataEntrada}
                          onChange={(event) => setLotEntryForm((current) => ({ ...current, dataEntrada: event.target.value }))}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <TextField
                          label="Fabricacao"
                          type="date"
                          value={lotEntryForm.dataFabricacao}
                          onChange={(event) => setLotEntryForm((current) => ({ ...current, dataFabricacao: event.target.value }))}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <TextField
                          label="Validade"
                          type="date"
                          value={lotEntryForm.dataValidade}
                          onChange={(event) => setLotEntryForm((current) => ({ ...current, dataValidade: event.target.value }))}
                          InputLabelProps={{ shrink: true }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <TextField
                          label="Custo unit."
                          type="number"
                          value={renderNullableNumber(lotEntryForm.precoCustoUnitario)}
                          onChange={(event) => setLotEntryForm((current) => ({
                            ...current,
                            precoCustoUnitario: parseNullableNumber(event.target.value)
                          }))}
                          inputProps={{ min: 0, step: '0.01' }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Documento"
                          value={lotEntryForm.documentoReferencia}
                          onChange={(event) => setLotEntryForm((current) => ({
                            ...current,
                            documentoReferencia: event.target.value
                          }))}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={8}>
                        <TextField
                          label="Observacao"
                          value={lotEntryForm.observacao}
                          onChange={(event) => setLotEntryForm((current) => ({
                            ...current,
                            observacao: event.target.value
                          }))}
                          fullWidth
                        />
                      </Grid>
                    </Grid>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        Use um lote por recebimento real. Se o mesmo codigo voltar depois, o sistema soma uma nova entrada e preserva o historico.
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button variant="outlined" onClick={resetLotEntryState} disabled={registeringLotEntry}>
                          Limpar
                        </Button>
                        <Button
                          variant="contained"
                          onClick={() => void handleRegisterLotEntry()}
                          disabled={!canEditProduct || !canRegisterLotEntry || registeringLotEntry}
                        >
                          {registeringLotEntry ? 'Registrando...' : 'Registrar entrada'}
                        </Button>
                      </Stack>
                    </Stack>

                    {loadingProductLots ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size={18} />
                        <Typography variant="body2" color="text.secondary">
                          Carregando lotes do produto...
                        </Typography>
                      </Stack>
                    ) : productLots.length === 0 ? (
                      <Alert severity="info" sx={{ borderRadius: 3 }}>
                        Nenhum lote encontrado para este produto ainda. A primeira entrada registrada aqui ja passa a compor o saldo disponivel.
                      </Alert>
                    ) : (
                      <Box sx={{ overflowX: 'auto' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Lote</TableCell>
                              <TableCell>Entrada</TableCell>
                              <TableCell>Fabricacao</TableCell>
                              <TableCell>Validade</TableCell>
                              <TableCell align="right">Qtd. entrada</TableCell>
                              <TableCell align="right">Saldo</TableCell>
                              <TableCell align="right">Custo</TableCell>
                              <TableCell>Status</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {productLots.map((lot) => (
                              <TableRow key={lot.estoqueLoteId}>
                                <TableCell>
                                  <Stack spacing={0.25}>
                                    <Typography sx={{ fontWeight: 700 }}>{lot.codigoLote}</Typography>
                                    {lot.documentoReferencia && (
                                      <Typography variant="caption" color="text.secondary">
                                        Doc.: {lot.documentoReferencia}
                                      </Typography>
                                    )}
                                  </Stack>
                                </TableCell>
                                <TableCell>{formatDateDisplay(lot.dataEntrada)}</TableCell>
                                <TableCell>{formatDateDisplay(lot.dataFabricacao)}</TableCell>
                                <TableCell>{formatDateDisplay(lot.dataValidade)}</TableCell>
                                <TableCell align="right">{lot.quantidadeEntrada.toFixed(3)}</TableCell>
                                <TableCell align="right">{lot.quantidadeDisponivel.toFixed(3)}</TableCell>
                                <TableCell align="right">{lot.precoCustoUnitario != null ? formatCurrency(lot.precoCustoUnitario) : '-'}</TableCell>
                                <TableCell>{describeLotStatus(lot)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            )}
            {editingProduct && !form.ativo && (
              <Grid item xs={12}>
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                  Produto inativo nao aparece na venda. Marque "Produto ativo" para liberar o item novamente no PDV.
                </Alert>
              </Grid>
            )}
          </Grid>
          <RemoteProductImageDialog
            open={productImageRemoteDialogOpen}
            contexto={PRODUCT_IMAGE_SCANNER_CONTEXT}
            title="Foto do produto no celular"
            description="Pareie o celular com este cadastro para fotografar a embalagem e enviar a imagem direto para dentro do sistema."
            onClose={() => setProductImageRemoteDialogOpen(false)}
          />
      </DetachableDialog>

      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Campos padrao da empresa</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {templateDialogError && (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {templateDialogError}
              </Alert>
            )}

            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Crie aqui os campos que devem nascer em todo novo produto da empresa. O que vier do QR continua podendo complementar ou sobrescrever o valor do item.
            </Alert>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Typography color="text.secondary">
                Esses campos aparecem automaticamente nos proximos cadastros de produto.
              </Typography>
              <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addTemplateDraft} disabled={!canEditProduct}>
                Adicionar campo padrao
              </Button>
            </Stack>

            {templateDrafts.length === 0 ? (
              <Typography color="text.secondary">
                Nenhum campo padrao salvo ainda. Adicione os campos que a empresa usa com frequencia, como lote interno, prateleira, referencia fiscal complementar ou classificacoes proprias.
              </Typography>
            ) : (
              templateDrafts.map((item, index) => (
                <Grid container spacing={1.25} key={`template-${index}-${item.chave}`}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label={`Campo padrao ${index + 1}`}
                      value={item.chave}
                      onChange={(event) => updateTemplateDraft(index, 'chave', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={7}>
                    <TextField
                      label="Valor padrao"
                      value={item.valorPadrao ?? ''}
                      onChange={(event) => updateTemplateDraft(index, 'valorPadrao', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={1}>
                    <IconButton color="error" onClick={() => removeTemplateDraft(index)} sx={{ mt: { md: 1 } }} disabled={!canEditProduct}>
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setTemplateDialogOpen(false)} disabled={savingTemplates}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleSaveTemplates()} disabled={savingTemplates || !canEditProduct}>
            Salvar campos padrao
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteProduct)}
        title={deletePermanent ? 'Excluir produto permanentemente' : 'Inativar produto'}
        description={
          deletePermanent
            ? `Deseja excluir permanentemente o produto ${deleteProduct?.nome ?? ''}? Esta acao so funciona quando nao houver vendas nem historico de estoque.`
            : `Deseja inativar o produto ${deleteProduct?.nome ?? ''}? Ele deixa de aparecer na venda, mas o historico continua preservado.`
        }
        confirmLabel={deletePermanent ? 'Excluir permanente' : 'Inativar'}
        onCancel={() => {
          setDeleteProduct(null);
          setDeletePermanent(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </Stack>
  );
}

function buildProductFormWithTemplates(
  baseForm: ProdutoPayload,
  fieldTemplates: ProdutoCampoPadrao[]
): ProdutoPayload {
  const normalizedForm = normalizeProductForm(baseForm);
  const mergedCustomFields = mergeCustomFieldsWithTemplates(normalizedForm.camposCustomizados, fieldTemplates);
  return syncProductSupplierForm({
    ...normalizedForm,
    codigosAlternativos: [...normalizedForm.codigosAlternativos],
    fornecedores: normalizedForm.fornecedores.map((item) => ({ ...item })),
    camposCustomizados: mergedCustomFields
  });
}

function buildNextProductForm(
  currentForm: ProdutoPayload,
  fieldTemplates: ProdutoCampoPadrao[],
  regimeTributarioEmpresa: EmpresaRegimeTributario | null
) {
  return applyRegimeRulesToForm(buildProductFormWithTemplates(
    {
      ...emptyForm,
      clienteFornecedorId: currentForm.clienteFornecedorId,
      origemFiscal: currentForm.origemFiscal,
      perfilFiscalPadrao: currentForm.perfilFiscalPadrao,
      cfopCompraPadrao: currentForm.cfopCompraPadrao,
      cfopCompraInterestadual: currentForm.cfopCompraInterestadual,
      cfopVendaPadrao: currentForm.cfopVendaPadrao,
      cfopVendaInterestadual: currentForm.cfopVendaInterestadual,
      csosn: currentForm.csosn,
      cstIcms: currentForm.cstIcms,
      cstPis: currentForm.cstPis,
      cstCofins: currentForm.cstCofins,
      beneficioFiscalCodigo: currentForm.beneficioFiscalCodigo,
      codigoAnp: currentForm.codigoAnp,
      unidadeTributavel: currentForm.unidadeTributavel,
      exTipi: currentForm.exTipi,
      aliquotaIcms: currentForm.aliquotaIcms,
      aliquotaIpi: currentForm.aliquotaIpi,
      aliquotaPis: currentForm.aliquotaPis,
      aliquotaCofins: currentForm.aliquotaCofins,
      ultimaNotaFiscalCompra: currentForm.ultimaNotaFiscalCompra,
      fornecedores: buildNextProductSupplierLinks(currentForm),
      ativo: true,
      controlaEstoque: currentForm.controlaEstoque,
      controlaLote: currentForm.controlaLote,
      politicaBaixaLote: currentForm.politicaBaixaLote
    },
    fieldTemplates
  ), regimeTributarioEmpresa);
}

function buildNextProductSupplierLinks(currentForm: ProdutoPayload) {
  const normalizedForm = syncProductSupplierForm(currentForm);
  const principalSupplier = normalizedForm.fornecedores.find((item) => item.fornecedorPrincipal && item.clienteFornecedorId);
  if (!principalSupplier?.clienteFornecedorId) {
    return [];
  }

  return [
    createSupplierLink({
      clienteFornecedorId: principalSupplier.clienteFornecedorId,
      fornecedorPrincipal: true,
      ativo: true
    })
  ];
}

function buildLegacySupplierLinks(product: Produto) {
  if (!product.clienteFornecedorId) {
    return [];
  }

  return [
    createSupplierLink({
      clienteFornecedorId: product.clienteFornecedorId,
      codigoProdutoFornecedor: product.codigoProdutoFornecedor,
      nomeProdutoFornecedor: product.nome,
      fornecedorPrincipal: true,
      ativo: true
    })
  ];
}

function createSupplierLink(overrides: Partial<ProdutoFornecedorPayload> = {}): ProdutoFornecedorPayload {
  return {
    ...emptySupplierLink,
    ...overrides
  };
}

function normalizeProductForm(form: ProdutoPayload): ProdutoPayload {
  return {
    ...emptyForm,
    ...form,
    politicaBaixaLote: form.politicaBaixaLote ?? 'FEFO',
    codigosAlternativos: [...(form.codigosAlternativos ?? [])],
    camposCustomizados: [...(form.camposCustomizados ?? [])],
    fornecedores: (form.fornecedores ?? []).map((item) => createSupplierLink(item))
  };
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

function normalizeFiscalAssistenteContext(context: ProdutoFiscalAssistenteContexto | null) {
  if (!context) {
    return null;
  }

  return {
    ...context,
    perfisFiscais: context.perfisFiscais ?? [],
    origensFiscais: context.origensFiscais ?? [],
    cfops: context.cfops ?? [],
    csosns: context.csosns ?? [],
    cstIcms: context.cstIcms ?? [],
    cstPisCofins: context.cstPisCofins ?? [],
    beneficiosFiscais: context.beneficiosFiscais ?? []
  };
}

function syncProductSupplierForm(
  form: ProdutoPayload,
  forcedPrincipalSupplierId?: string | null
): ProdutoPayload {
  const normalizedForm = normalizeProductForm(form);
  let fornecedores = normalizedForm.fornecedores.map((item) => createSupplierLink(item));
  let principalSupplierId = forcedPrincipalSupplierId === undefined ? normalizedForm.clienteFornecedorId : forcedPrincipalSupplierId;

  if (principalSupplierId) {
    const principalExists = fornecedores.some((item) => item.clienteFornecedorId === principalSupplierId);
    if (!principalExists) {
      fornecedores = [
          ...fornecedores,
          createSupplierLink({
            clienteFornecedorId: principalSupplierId,
            codigoProdutoFornecedor: normalizedForm.codigoProdutoFornecedor,
            nomeProdutoFornecedor: normalizedForm.nome || null,
            fornecedorPrincipal: true,
            ativo: true
          })
      ];
    }
  }

  const activeSuppliers = fornecedores.filter((item) => item.ativo && item.clienteFornecedorId);
  if (!principalSupplierId) {
    const explicitPrincipal = activeSuppliers.find((item) => item.fornecedorPrincipal);
    principalSupplierId = explicitPrincipal?.clienteFornecedorId ?? (activeSuppliers.length === 1 ? activeSuppliers[0].clienteFornecedorId : null);
  }

  fornecedores = fornecedores.map((item) => {
    if (!item.clienteFornecedorId) {
      return {
        ...item,
        fornecedorPrincipal: false
      };
    }

    const isPrincipal = Boolean(principalSupplierId) && item.clienteFornecedorId === principalSupplierId;
    return {
      ...item,
      fornecedorPrincipal: isPrincipal,
      ativo: isPrincipal ? true : item.ativo
    };
  });

  const principalSupplier = principalSupplierId
    ? fornecedores.find((item) => item.clienteFornecedorId === principalSupplierId) ?? null
    : null;

  return {
    ...normalizedForm,
    clienteFornecedorId: principalSupplier?.clienteFornecedorId ?? null,
    codigoProdutoFornecedor: principalSupplier?.codigoProdutoFornecedor ?? null,
    fornecedores
  };
}

function mergeCustomFieldsWithTemplates(
  customFields: ProdutoCampoCustomizadoPayload[],
  fieldTemplates: ProdutoCampoPadrao[]
) {
  const existingFields = customFields.map((item) => ({
    chave: item.chave,
    valor: item.valor
  }));

  if (fieldTemplates.length === 0) {
    return existingFields;
  }

  const mergedFields: ProdutoCampoCustomizadoPayload[] = [];
  const existingByKey = new Map(
    existingFields.map((item) => [normalizeCustomFieldKey(item.chave), item] as const)
  );

  for (const template of [...fieldTemplates].sort((left, right) => left.ordem - right.ordem)) {
    const normalizedKey = normalizeCustomFieldKey(template.chave);
    if (!normalizedKey) {
      continue;
    }

    const existing = existingByKey.get(normalizedKey);
    mergedFields.push({
      chave: template.chave,
      valor: existing?.valor ?? template.valorPadrao ?? null
    });
    existingByKey.delete(normalizedKey);
  }

  for (const field of existingFields) {
    if (!normalizeCustomFieldKey(field.chave)) {
      continue;
    }

    if (existingByKey.has(normalizeCustomFieldKey(field.chave))) {
      mergedFields.push(field);
    }
  }

  return mergedFields;
}

function applyCapturedSupplierToForm(
  form: ProdutoPayload,
  supplierHints: ProductCaptureSupplierHints,
  supplierClients: Cliente[]
) {
  const matchedSupplier = findSupplierByHints(supplierClients, supplierHints);
  if (!matchedSupplier || form.clienteFornecedorId) {
    return form;
  }

  return syncProductSupplierForm({
    ...form,
    clienteFornecedorId: matchedSupplier.clienteId
  });
}

function findSupplierByHints(
  supplierClients: Cliente[],
  supplierHints: ProductCaptureSupplierHints
) {
  const supplierDocument = onlyDigits(supplierHints.supplierDocument);
  if (supplierDocument) {
    const byDocument = supplierClients.find((item) => onlyDigits(item.documento) === supplierDocument);
    if (byDocument) {
      return byDocument;
    }
  }

  const normalizedSupplierName = normalizeSupplierName(supplierHints.supplierName);
  if (!normalizedSupplierName) {
    return null;
  }

  const exactMatch = supplierClients.find((item) => normalizeSupplierName(item.nome) === normalizedSupplierName);
  if (exactMatch) {
    return exactMatch;
  }

  return supplierClients.find((item) => {
    const normalizedClientName = normalizeSupplierName(item.nome);
    return normalizedClientName.includes(normalizedSupplierName) || normalizedSupplierName.includes(normalizedClientName);
  }) ?? null;
}

function hasSupplierHint(supplierHints: ProductCaptureSupplierHints) {
  return Boolean(onlyDigits(supplierHints.supplierDocument) || normalizeSupplierName(supplierHints.supplierName));
}

function normalizeSupplierName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCustomFieldKey(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasCustomFieldKey(customFields: ProdutoCampoCustomizadoPayload[], key: string) {
  const normalizedKey = normalizeCustomFieldKey(key);
  return customFields.some((item) => normalizeCustomFieldKey(item.chave) === normalizedKey);
}

function applyFiscalProfileSuggestion(form: ProdutoPayload, forceOverwrite: boolean) {
  if (!form.perfilFiscalPadrao) {
    return form;
  }

  const suggestion = getFiscalProfileSuggestion(form.perfilFiscalPadrao);
  if (!suggestion) {
    return form;
  }

  return {
    ...form,
    cfopCompraPadrao: forceOverwrite || !form.cfopCompraPadrao ? suggestion.cfopCompraPadrao : form.cfopCompraPadrao,
    cfopCompraInterestadual: forceOverwrite || !form.cfopCompraInterestadual ? suggestion.cfopCompraInterestadual : form.cfopCompraInterestadual,
    cfopVendaPadrao: forceOverwrite || !form.cfopVendaPadrao ? suggestion.cfopVendaPadrao : form.cfopVendaPadrao,
    cfopVendaInterestadual: forceOverwrite || !form.cfopVendaInterestadual ? suggestion.cfopVendaInterestadual : form.cfopVendaInterestadual
  };
}

function applyFiscalSuggestionToForm(form: ProdutoPayload, suggestion: ProdutoFiscalSugestaoNcm): ProdutoPayload {
  return {
    ...form,
    ncm: suggestion.ncm ?? form.ncm,
    cest: suggestion.cest,
    origemFiscal: suggestion.origemFiscal,
    perfilFiscalPadrao: suggestion.perfilFiscalPadrao,
    cfopVendaPadrao: suggestion.cfopVendaPadrao,
    cfopVendaInterestadual: suggestion.cfopVendaInterestadual,
    cfopCompraPadrao: suggestion.cfopCompraPadrao,
    cfopCompraInterestadual: suggestion.cfopCompraInterestadual,
    csosn: suggestion.csosn,
    cstIcms: suggestion.cstIcms,
    cstPis: suggestion.cstPis,
    cstCofins: suggestion.cstCofins,
    beneficioFiscalCodigo: suggestion.beneficioFiscalCodigo,
    codigoAnp: suggestion.codigoAnp,
    unidadeTributavel: suggestion.unidadeTributavel,
    exTipi: suggestion.exTipi,
    aliquotaIcms: suggestion.aliquotaIcms,
    aliquotaIpi: suggestion.aliquotaIpi,
    aliquotaPis: suggestion.aliquotaPis,
    aliquotaCofins: suggestion.aliquotaCofins,
    justificativaFiscalManual: null,
    confirmaPisCofinsDiferentes: false
  };
}

function buildFiscalSuggestionRequestKey(form: ProdutoPayload) {
  return [
    onlyDigits(form.ncm),
    form.cest ?? '',
    form.perfilFiscalPadrao ?? '',
    form.origemFiscal ?? '',
    form.beneficioFiscalCodigo ?? '',
    form.codigoAnp ?? '',
    form.unidadeMedida ?? '',
    form.unidadeTributavel ?? '',
    form.exTipi ?? ''
  ].join('|');
}

function upsertFiscalNcmOption(current: FiscalNcm[], next: FiscalNcm) {
  const remaining = current.filter((item) => item.codigo !== next.codigo);
  return [next, ...remaining].slice(0, 30);
}

function getFiscalProfileSuggestion(profile: ProdutoPerfilFiscalPadrao) {
  switch (profile) {
    case 'RevendaMercadoria':
      return {
        cfopCompraPadrao: '1102',
        cfopCompraInterestadual: '2102',
        cfopVendaPadrao: '5102',
        cfopVendaInterestadual: '6102'
      };
    case 'ProducaoEstabelecimento':
      return {
        cfopCompraPadrao: '1101',
        cfopCompraInterestadual: '2101',
        cfopVendaPadrao: '5101',
        cfopVendaInterestadual: '6101'
      };
    default:
      return null;
  }
}

function getFiscalProfileDescription(profile: ProdutoPerfilFiscalPadrao) {
  return fiscalProfileOptions.find((option) => option.value === profile)?.description
    ?? 'Perfil fiscal padrao do item.';
}

function inferProductCodeType(code: string, format?: string | null): ProdutoCodigoTipo {
  const normalizedFormat = (format ?? '').toUpperCase();
  const normalizedCode = code.trim();

  if (normalizedFormat.includes('QR')) {
    return 'Qr';
  }

  if (/^\d{8,14}$/.test(normalizedCode)) {
    return 'Ean';
  }

  return 'Interno';
}

function normalizeGtin(code: string | null | undefined) {
  return (code ?? '').replace(/\D/g, '');
}

function isLikelyGtin(code: string | null | undefined) {
  const normalized = normalizeGtin(code);
  return /^\d{8,14}$/.test(normalized);
}

function createEmptyLotEntryFormState(): ProductLotEntryFormState {
  return {
    codigoLote: '',
    quantidadeEntrada: 0,
    dataEntrada: getTodayInputValue(),
    dataFabricacao: '',
    dataValidade: '',
    precoCustoUnitario: null,
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

function formatDateDisplay(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const normalized = value.slice(0, 10);
  const parts = normalized.split('-');
  if (parts.length !== 3) {
    return normalized;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

  return lot.dataValidade ? 'Disponivel' : 'Sem validade';
}

function renderNullableNumber(value: number | null) {
  return value ?? '';
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

function parseNullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = Number(value.replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : null;
}

function parseNullableInteger(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = Number(value.replace(',', '.'));
  if (!Number.isFinite(normalized)) {
    return null;
  }

  return Math.trunc(normalized);
}

function getProductPrincipalSupplier(product: Produto) {
  const suppliers = product.fornecedores ?? [];
  return suppliers.find((item) => item.ativo && item.fornecedorPrincipal)
    ?? suppliers.find((item) => item.ativo)
    ?? null;
}

function getProductBestSupplier(product: Produto) {
  const suppliers = product.fornecedores ?? [];
  return suppliers.find((item) => item.ativo && item.menorPreco)
    ?? suppliers
      .filter((item) => item.ativo && item.precoCompra != null)
      .sort((left, right) => (left.precoCompra ?? Number.MAX_SAFE_INTEGER) - (right.precoCompra ?? Number.MAX_SAFE_INTEGER))[0]
    ?? null;
}

function buildSupplierComparisonSummary(supplierLink: ProdutoFornecedorPayload) {
  const parts = [
    supplierLink.precoCompra != null ? `Preco de compra: ${formatCurrency(supplierLink.precoCompra)}` : null,
    supplierLink.ultimoPrecoPago != null ? `ultimo pago: ${formatCurrency(supplierLink.ultimoPrecoPago)}` : null,
    supplierLink.quantidadeMinima != null ? `lote minimo: ${supplierLink.quantidadeMinima.toFixed(3)}` : null,
    supplierLink.prazoEntregaDias != null ? `prazo: ${supplierLink.prazoEntregaDias} dia(s)` : null
  ].filter((item): item is string => Boolean(item));

  return parts.join(' · ');
}

function buildImportedDescription(result: ProdutoCatalogoExternoConsulta) {
  return [result.descricao, result.marca ? `Marca: ${result.marca}` : null, result.ncm ? `NCM: ${result.ncm}` : null]
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(' | ') || null;
}

function buildExternalCatalogSummary(result: ProdutoCatalogoExternoConsulta) {
  const summaryParts = [
    result.descricao?.trim() || null,
    result.marca ? `Marca: ${result.marca}` : null,
    result.unidadeSugerida ? `Unidade: ${result.unidadeSugerida}` : null,
    result.precoMedio != null ? `Preco de referencia: ${formatCurrency(result.precoMedio)}` : null,
    result.gtin ? (isLikelyGtin(result.gtin) ? `GTIN: ${result.gtin}` : `Codigo externo: ${result.gtin}`) : null
  ].filter((item): item is string => Boolean(item && item.trim()));
  const baseText = summaryParts.join(' | ')
    || [result.nome, result.marca].filter((item): item is string => Boolean(item && item.trim())).join(' · ');

  if (!baseText) {
    return null;
  }

  return baseText.length <= 240 ? baseText : `${baseText.slice(0, 237).trimEnd()}...`;
}

function mergeExternalLookupIntoForm(
  currentForm: ProdutoPayload,
  result: ProdutoCatalogoExternoConsulta,
  lookupTerm: string | null,
  mode: ExternalLookupApplyMode
) {
  const normalizedForm = normalizeProductForm(currentForm);
  const externalGtin = isLikelyGtin(result.gtin) ? result.gtin : null;
  const importedDescription = buildImportedDescription(result);
  const importedSummary = buildExternalCatalogSummary(result);
  const forceCommercialOverwrite = mode === 'manual';

  return normalizeProductForm({
    ...normalizedForm,
    codigoBarras: shouldApplyExternalTextField(normalizedForm.codigoBarras, externalGtin, forceCommercialOverwrite)
      ? externalGtin
      : normalizedForm.codigoBarras,
    tipoCodigoPrincipal: shouldApplyExternalTextField(normalizedForm.codigoBarras, externalGtin, forceCommercialOverwrite)
      ? 'Ean'
      : normalizedForm.tipoCodigoPrincipal,
    nome: shouldApplyExternalName(normalizedForm.nome, result.nome, lookupTerm)
      || shouldApplyExternalTextField(normalizedForm.nome, result.nome, forceCommercialOverwrite)
      ? result.nome ?? normalizedForm.nome
      : normalizedForm.nome,
    descricao: shouldApplyExternalTextField(normalizedForm.descricao, importedDescription, forceCommercialOverwrite)
      ? importedDescription
      : normalizedForm.descricao,
    marca: shouldApplyExternalTextField(normalizedForm.marca, result.marca, forceCommercialOverwrite)
      ? result.marca
      : normalizedForm.marca,
    ncm: shouldApplyExternalTextField(normalizedForm.ncm, result.ncm, forceCommercialOverwrite)
      ? result.ncm
      : normalizedForm.ncm,
    imagemUrl: result.imagemUrl ?? normalizedForm.imagemUrl,
    catalogoResumo: shouldApplyExternalTextField(normalizedForm.catalogoResumo, importedSummary, forceCommercialOverwrite)
      ? importedSummary
      : normalizedForm.catalogoResumo,
    precoVenda: normalizedForm.precoVenda > 0 || result.precoMedio == null
      ? normalizedForm.precoVenda
      : result.precoMedio,
    unidadeMedida: normalizedForm.unidadeMedida === 'UN' && result.unidadeSugerida
      ? result.unidadeSugerida
      : normalizedForm.unidadeMedida,
    unidadeTributavel: normalizedForm.unidadeTributavel === 'UN' && result.unidadeSugerida
      ? result.unidadeSugerida
      : normalizedForm.unidadeTributavel,
    camposCustomizados: applyExternalLookupMetadataToCustomFields(
      normalizedForm.camposCustomizados,
      result,
      lookupTerm
    )
  });
}

function applyExternalLookupMetadataToCustomFields(
  customFields: ProdutoCampoCustomizadoPayload[],
  result: ProdutoCatalogoExternoConsulta,
  lookupTerm: string | null
) {
  let nextFields = [...customFields];

  nextFields = upsertCustomFieldValue(nextFields, externalCatalogMetadataFieldKeys.provider, result.provedor);
  nextFields = upsertCustomFieldValue(
    nextFields,
    externalCatalogMetadataFieldKeys.reference,
    result.gtin
      ? isLikelyGtin(result.gtin)
        ? `GTIN ${result.gtin}`
        : result.gtin
      : null
  );
  nextFields = upsertCustomFieldValue(
    nextFields,
    externalCatalogMetadataFieldKeys.searchedTerm,
    normalizeExternalCatalogSearchTerm(lookupTerm)
  );
  nextFields = upsertCustomFieldValue(nextFields, externalCatalogMetadataFieldKeys.sourceUrl, result.fonteUrl);
  nextFields = upsertCustomFieldValue(nextFields, externalCatalogMetadataFieldKeys.searchUrl, result.buscaUrl);

  return nextFields;
}

function upsertCustomFieldValue(
  customFields: ProdutoCampoCustomizadoPayload[],
  key: string,
  value: string | null | undefined
) {
  const trimmedValue = value?.trim() || null;
  const normalizedKey = normalizeCustomFieldKey(key);
  const currentIndex = customFields.findIndex((item) => normalizeCustomFieldKey(item.chave) === normalizedKey);

  if (!trimmedValue) {
    return currentIndex < 0
      ? customFields
      : customFields.filter((_, index) => index !== currentIndex);
  }

  if (currentIndex < 0) {
    return [
      ...customFields,
      {
        chave: key,
        valor: trimmedValue
      }
    ];
  }

  return customFields.map((item, index) =>
    index === currentIndex
      ? {
          ...item,
          valor: trimmedValue
        }
      : item
  );
}

function shouldApplyExternalTextField(
  currentValue: string | null | undefined,
  externalValue: string | null | undefined,
  forceOverwrite: boolean
) {
  if (!externalValue?.trim()) {
    return false;
  }

  if (forceOverwrite) {
    return true;
  }

  return !currentValue?.trim();
}

function normalizeExternalCatalogSearchTerm(value: string | null | undefined) {
  return (value ?? '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ');
}

function isDescriptionLookupOrigin(origin: ExternalLookupRequestOrigin | null | undefined) {
  return origin === 'description-manual' || origin === 'description-auto';
}

function isVisualLookupOrigin(origin: ExternalLookupRequestOrigin | null | undefined) {
  return origin === 'image-manual' || origin === 'image-auto';
}

function getExternalLookupOriginLabel(origin: ExternalLookupRequestOrigin | null | undefined) {
  if (origin === 'gtin') {
    return 'Consulta por GTIN';
  }

  if (isVisualLookupOrigin(origin)) {
    return 'Busca visual';
  }

  return 'Sugestao por nome';
}

function buildPreferredVisualSearchTerm(
  explicitSearchTerm?: string | null,
  fallbackName?: string | null,
  originalFileName?: string | null
) {
  const preferredTerms = [
    normalizeExternalCatalogSearchTerm(explicitSearchTerm),
    normalizeExternalCatalogSearchTerm(fallbackName),
    normalizeExternalCatalogSearchTerm(extractSearchTermFromImageFileName(originalFileName))
  ];

  return preferredTerms.find((item) => item.length >= 3) ?? preferredTerms.find(Boolean) ?? '';
}

function extractSearchTermFromImageFileName(fileName?: string | null) {
  const normalized = normalizeExternalCatalogSearchTerm(fileName);
  if (!normalized) {
    return '';
  }

  const withoutExtension = normalized.replace(/\.[a-z0-9]{2,5}$/i, '');
  const text = withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\b(img|image|foto|photo|camera|scan|scanner|captura|capture|pxl|dsc|whatsapp|wa)\b/gi, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = text
    .split(' ')
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && /[a-zA-Z]/.test(item));

  return tokens.join(' ').trim();
}

function shouldApplyExternalName(currentName: string, externalName: string | null, lookupTerm: string | null) {
  const normalizedCurrent = normalizeExternalCatalogSearchTerm(currentName);
  const normalizedExternal = normalizeExternalCatalogSearchTerm(externalName);
  const normalizedLookupTerm = normalizeExternalCatalogSearchTerm(lookupTerm);

  if (!normalizedExternal) {
    return false;
  }

  if (!normalizedCurrent) {
    return true;
  }

  return normalizedCurrent === normalizedLookupTerm || normalizedCurrent === normalizedExternal;
}

function buildProductNameLookupHelperText(
  normalizedName: string,
  externalCatalogStatus: ProdutoBaseExternaStatus | null,
  externalLookup: ProdutoCatalogoExternoConsulta | null,
  externalLookupOrigin: ExternalLookupRequestOrigin | null,
  externalLookupLoadingOrigin: ExternalLookupRequestOrigin | null,
  externalLookupSearchTerm: string,
  externalLookupFeedback: string | null
) {
  if (externalCatalogStatus && !externalCatalogStatus.disponivel) {
    return externalCatalogStatus.mensagem;
  }

  if (isDescriptionLookupOrigin(externalLookupLoadingOrigin)) {
    return 'Buscando nome comercial, marca, imagem e descricao em catalogos externos, inclusive fontes brasileiras...';
  }

  if (normalizedName.length < 3) {
    return 'Digite pelo menos 3 caracteres para acionar a busca inteligente externa com imagem e dados do produto, inclusive em bases do Brasil.';
  }

  if (
    externalLookup
    && (isDescriptionLookupOrigin(externalLookupOrigin) || isVisualLookupOrigin(externalLookupOrigin))
    && externalLookupSearchTerm === normalizedName
  ) {
    return isVisualLookupOrigin(externalLookupOrigin)
      ? `Busca visual pronta em ${externalLookup.provedor}. Os dados ja entraram no cadastro e continuam editaveis antes de salvar.`
      : `Sugestao pronta em ${externalLookup.provedor}. Os dados ja entraram no cadastro e continuam editaveis antes de salvar.`;
  }

  if (externalLookupFeedback) {
    return externalLookupFeedback;
  }

  return 'A busca inteligente externa usa o nome digitado para localizar foto, marca, descricao e referencia comercial em bases brasileiras e globais.';
}

function buildProductSavePayload(
  form: ProdutoPayload,
  precisaJustificativaFiscal: boolean,
  pisCofinsDiferentes: boolean
): ProdutoPayload {
  return {
    ...form,
    catalogoResumo: form.catalogoResumo?.trim() || null,
    promocaoTitulo: form.promocaoTitulo?.trim() || null,
    precoPromocional: form.precoPromocional && form.precoPromocional > 0 ? form.precoPromocional : null,
    promocaoInicioUtc: form.promocaoInicioUtc || null,
    promocaoFimUtc: form.promocaoFimUtc || null,
    estoqueAtual: form.controlaLote ? 0 : form.estoqueAtual,
    controlaEstoque: form.controlaLote ? true : form.controlaEstoque,
    politicaBaixaLote: form.controlaLote ? (form.politicaBaixaLote ?? 'FEFO') : null,
    justificativaFiscalManual: precisaJustificativaFiscal
      ? form.justificativaFiscalManual?.trim() || null
      : null,
    confirmaPisCofinsDiferentes: pisCofinsDiferentes
      ? Boolean(form.confirmaPisCofinsDiferentes)
      : false
  };
}

function applyRegimeRulesToForm(
  form: ProdutoPayload,
  regimeTributarioEmpresa: EmpresaRegimeTributario | null
): ProdutoPayload {
  if (!regimeTributarioEmpresa) {
    return form;
  }

  if (isSimplesRegime(regimeTributarioEmpresa)) {
    return {
      ...form,
      cstIcms: null
    };
  }

  return {
    ...form,
    csosn: null
  };
}

function applyPisCofinsSuggestionByCst(
  form: ProdutoPayload,
  regimeTributarioEmpresa: EmpresaRegimeTributario | null
): ProdutoPayload {
  const suggestion = getPisCofinsSuggestion(regimeTributarioEmpresa, form.cstPis);
  if (!suggestion) {
    return form;
  }

  return {
    ...form,
    cstCofins: form.cstCofins || form.cstPis,
    aliquotaPis: suggestion.aliquotaPis,
    aliquotaCofins: suggestion.aliquotaCofins
  };
}

function getPisCofinsSuggestion(
  regimeTributarioEmpresa: EmpresaRegimeTributario | null,
  cstPis: string | null | undefined
) {
  if (cstPis !== '01') {
    return null;
  }

  switch (regimeTributarioEmpresa) {
    case 'LucroReal':
      return { aliquotaPis: 1.65, aliquotaCofins: 7.6 };
    case 'LucroPresumido':
      return { aliquotaPis: 0.65, aliquotaCofins: 3.0 };
    default:
      return null;
  }
}

function hasManualAliquotaOverride(
  form: ProdutoPayload,
  suggestion: { aliquotaPis: number; aliquotaCofins: number } | null
) {
  if (!suggestion) {
    return false;
  }

  return form.aliquotaPis !== null && form.aliquotaPis !== suggestion.aliquotaPis
    || form.aliquotaCofins !== null && form.aliquotaCofins !== suggestion.aliquotaCofins;
}

function isSimplesRegime(regimeTributarioEmpresa: EmpresaRegimeTributario | null) {
  return regimeTributarioEmpresa === 'SimplesNacional' || regimeTributarioEmpresa === 'SimplesExcessoSublimite';
}

function formatRegimeTributario(regimeTributarioEmpresa: EmpresaRegimeTributario | null) {
  switch (regimeTributarioEmpresa) {
    case 'SimplesNacional':
      return 'Simples Nacional';
    case 'SimplesExcessoSublimite':
      return 'Simples com excesso de sublimite';
    case 'LucroPresumido':
      return 'Lucro Presumido';
    case 'LucroReal':
      return 'Lucro Real';
    case 'RegimeNormal':
      return 'Regime normal';
    default:
      return 'nao identificado';
  }
}

function formatAliquotaPreview(value: number | null | undefined) {
  if (value == null) {
    return '--';
  }

  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function buildAliquotaHelperText(
  label: 'PIS' | 'COFINS',
  suggested: number | null | undefined,
  current: number | null
) {
  if (suggested == null) {
    return undefined;
  }

  const suggestionText = `Sugerido para ${label}: ${formatAliquotaPreview(suggested)}%.`;
  if (current == null || current === suggested) {
    return suggestionText;
  }

  return `${suggestionText} Valor atual alterado manualmente.`;
}

function buildProductFieldErrors(message: string): Partial<Record<ProductFieldErrorKey, string>> {
  const errors: Partial<Record<ProductFieldErrorKey, string[]>> = {};

  const rules: Array<{ fields: ProductFieldErrorKey[]; phrases: string[] }> = [
    { fields: ['ncm'], phrases: ['Informe NCM valido com 8 digitos.', 'NCM invalido ou nao cadastrado na tabela fiscal.', 'Informe NCM valido.'] },
    { fields: ['cest'], phrases: ['Informe CEST para produto com regra de ST.', 'CEST invalido para a tabela fiscal.'] },
    { fields: ['perfilFiscalPadrao'], phrases: ['Selecione o perfil fiscal do item.', 'Perfil fiscal do item invalido.'] },
    { fields: ['origemFiscal'], phrases: ['Selecione uma origem fiscal valida.', 'Origem fiscal invalida.'] },
    { fields: ['cfopCompraPadrao'], phrases: ['CFOP de compra dentro do estado nao existe na tabela fiscal.', 'CFOP de compra dentro do estado precisa ser um CFOP de entrada.', 'Informe CFOP de compra dentro do estado.'] },
    { fields: ['cfopCompraInterestadual'], phrases: ['CFOP de compra fora do estado nao existe na tabela fiscal.', 'CFOP de compra fora do estado precisa ser um CFOP de entrada.', 'Informe CFOP de compra fora do estado.'] },
    { fields: ['cfopVendaPadrao'], phrases: ['CFOP de venda dentro do estado nao existe na tabela fiscal.', 'CFOP de venda dentro do estado precisa ser um CFOP de saida.', 'Informe CFOP de venda dentro do estado.'] },
    { fields: ['cfopVendaInterestadual'], phrases: ['CFOP de venda fora do estado nao existe na tabela fiscal.', 'CFOP de venda fora do estado precisa ser um CFOP de saida.', 'Informe CFOP de venda fora do estado.'] },
    { fields: ['csosn'], phrases: ['CSOSN nao deve ser preenchido quando a empresa nao usa Simples Nacional.', 'Informe CSOSN valido para empresa do Simples Nacional.', 'CSOSN invalido para a tabela fiscal.'] },
    { fields: ['cstIcms'], phrases: ['CST ICMS nao deve ser preenchido quando a empresa usa Simples Nacional.', 'Informe CST ICMS valido para empresa de regime normal.', 'CST ICMS invalido para a tabela fiscal.'] },
    { fields: ['cstPis'], phrases: ['Informe CST PIS valido.', 'CST PIS invalido para a tabela fiscal.'] },
    { fields: ['cstCofins'], phrases: ['Informe CST COFINS valido.', 'CST COFINS invalido para a tabela fiscal.'] },
    { fields: ['beneficioFiscalCodigo'], phrases: ['Beneficio fiscal invalido para a tabela fiscal.', 'Beneficio fiscal pertence a outra UF e precisa ser revisado.', 'Beneficio fiscal nao e compativel com o NCM informado.'] },
    { fields: ['codigoAnp'], phrases: ['Codigo ANP deve conter 9 digitos quando informado.'] },
    { fields: ['unidadeTributavel'], phrases: ['Unidade tributavel deve ter no maximo 10 caracteres.', 'Informe unidade tributavel.'] },
    { fields: ['exTipi'], phrases: ['EX TIPI deve conter de 1 a 3 digitos quando informado.'] },
    { fields: ['cstPis', 'cstCofins', 'confirmaPisCofinsDiferentes', 'justificativaFiscalManual'], phrases: ['Confirme e justifique a diferenca entre CST PIS e CST COFINS.'] },
    { fields: ['aliquotaIcms', 'justificativaFiscalManual'], phrases: ['Aliquota ICMS deve ficar entre 0 e 100.', 'Justifique a alteracao manual da aliquota ICMS.', 'Nao foi encontrada regra automatica para a aliquota ICMS. Revise a tabela fiscal.'] },
    { fields: ['aliquotaIpi'], phrases: ['Aliquota IPI deve ficar entre 0 e 100.'] },
    { fields: ['aliquotaPis', 'justificativaFiscalManual'], phrases: ['Aliquota PIS deve ficar entre 0 e 100.', 'Justifique a alteracao manual da aliquota PIS.', 'Nao foi encontrada regra automatica para a aliquota PIS. Revise a tabela fiscal.'] },
    { fields: ['aliquotaCofins', 'justificativaFiscalManual'], phrases: ['Aliquota COFINS deve ficar entre 0 e 100.', 'Justifique a alteracao manual da aliquota COFINS.', 'Nao foi encontrada regra automatica para a aliquota COFINS. Revise a tabela fiscal.'] }
  ];

  for (const rule of rules) {
    for (const phrase of rule.phrases) {
      if (!message.includes(phrase)) {
        continue;
      }

      for (const field of rule.fields) {
        errors[field] ??= [];
        if (!errors[field]!.includes(phrase)) {
          errors[field]!.push(phrase);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => [field, messages.join(' ')])
  ) as Partial<Record<ProductFieldErrorKey, string>>;
}
