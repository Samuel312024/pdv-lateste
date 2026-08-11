import ImageSearchRoundedIcon from '@mui/icons-material/ImageSearchRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ProductSearch } from '../components/pdv/ProductSearch';
import { RemoteProductImageDialog } from '../components/scanner/RemoteProductImageDialog';
import { ScannerActionBar } from '../components/scanner/ScannerActionBar';
import { useScanner } from '../hooks/useScanner';
import { productService } from '../services/productService';
import type {
  Produto,
  ProdutoBaseExternaStatus,
  ProdutoImagemUpload,
  ProdutoPesquisaPrecoFonte,
  ProdutoPesquisaPrecos
} from '../types';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import {
  optimizeProductImageFile,
  parseProductImageCapturePayload,
  PRODUCT_IMAGE_SCANNER_CONTEXT
} from '../utils/productImageCapture';

type PriceCheckTab = 'interna' | 'externa';

const PRICE_RESEARCH_IMAGE_CONTEXT = `${PRODUCT_IMAGE_SCANNER_CONTEXT}-consulta-preco`;

export function PriceCheckPage() {
  const [activeTab, setActiveTab] = useState<PriceCheckTab>('interna');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Produto | null>(null);
  const [recentCodes, setRecentCodes] = useState<string[]>([]);
  const [lastLookupMessage, setLastLookupMessage] = useState<string | null>(null);
  const [externalCatalogStatus, setExternalCatalogStatus] = useState<ProdutoBaseExternaStatus | null>(null);
  const [externalSearchTerm, setExternalSearchTerm] = useState('');
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalResults, setExternalResults] = useState<ProdutoPesquisaPrecos | null>(null);
  const [externalFeedback, setExternalFeedback] = useState<string | null>(null);
  const [externalImageUrl, setExternalImageUrl] = useState<string | null>(null);
  const [externalImageFileName, setExternalImageFileName] = useState('');
  const [externalRecognitionDiagnostic, setExternalRecognitionDiagnostic] = useState<string | null>(null);
  const [externalImageUploading, setExternalImageUploading] = useState(false);
  const [priceResearchRemoteDialogOpen, setPriceResearchRemoteDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const externalInputRef = useRef<HTMLInputElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const normalizedExternalSearchTerm = useMemo(
    () => normalizeExternalSearchTerm(externalSearchTerm),
    [externalSearchTerm]
  );
  const externalResearchReady = useMemo(
    () => isLikelyGtin(normalizedExternalSearchTerm) || normalizedExternalSearchTerm.length >= 3,
    [normalizedExternalSearchTerm]
  );
  const externalCatalogEnabled = externalCatalogStatus?.disponivel ?? false;

  useEffect(() => {
    requestAnimationFrame(() => {
      if (activeTab === 'externa') {
        externalInputRef.current?.focus();
        return;
      }

      inputRef.current?.focus();
    });
  }, [activeTab]);

  useEffect(() => {
    async function loadExternalCatalogStatus() {
      try {
        const status = await productService.getExternalCatalogStatus();
        setExternalCatalogStatus(status);
      } catch (error) {
        setExternalCatalogStatus(null);
        enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
      }
    }

    void loadExternalCatalogStatus();
  }, [enqueueSnackbar]);

  async function lookupByCode(rawCode: string) {
    const normalizedCode = rawCode.trim();
    if (!normalizedCode) {
      return;
    }

    setLoading(true);
    setLastLookupMessage('Consultando produto...');

    try {
      const result = await productService.getByBarcode(normalizedCode);
      setProduct(result);
      setQuery(normalizedCode);
      setRecentCodes((current) => [normalizedCode, ...current.filter((item) => item !== normalizedCode)].slice(0, 10));
      setLastLookupMessage(`Produto localizado: ${result.nome}.`);
      enqueueSnackbar(`Consulta pronta: ${result.nome}`, { variant: 'success' });
    } catch (error) {
      setProduct(null);
      setLastLookupMessage('Nenhum produto encontrado para este codigo.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }

  async function lookupProductAndCompareByCode(rawCode: string) {
    const normalizedCode = rawCode.trim();
    if (!normalizedCode) {
      return;
    }

    try {
      const result = await productService.getByBarcode(normalizedCode, true);
      setProduct(result);
      setQuery(normalizedCode);
      setRecentCodes((current) => [normalizedCode, ...current.filter((item) => item !== normalizedCode)].slice(0, 10));
      setExternalSearchTerm(result.nome);
      setExternalFeedback(`Produto interno localizado: ${result.nome}. Comparando o mercado externo agora.`);
      setActiveTab('externa');
      await runExternalPriceResearch(result.nome);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  function handleKeyboardLookup(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    void lookupByCode(query);
  }

  function handleSelectProduct(nextProduct: Produto) {
    setProduct(nextProduct);
    setQuery(nextProduct.codigoBarras ?? '');
    setLastLookupMessage(`Produto selecionado: ${nextProduct.nome}.`);
    if (nextProduct.codigoBarras) {
      setRecentCodes((current) => [nextProduct.codigoBarras!, ...current.filter((item) => item !== nextProduct.codigoBarras)].slice(0, 10));
    }
  }

  async function runExternalPriceResearch(rawTerm: string) {
    const normalizedTerm = normalizeExternalSearchTerm(rawTerm);
    if (!isLikelyGtin(normalizedTerm) && normalizedTerm.length < 3) {
      enqueueSnackbar('Informe pelo menos 3 caracteres ou um GTIN valido para comparar os precos externos.', { variant: 'warning' });
      return;
    }

    if (!externalCatalogEnabled) {
      enqueueSnackbar(externalCatalogStatus?.mensagem ?? 'A pesquisa externa nao esta habilitada nesta instalacao.', { variant: 'warning' });
      return;
    }

    setExternalLoading(true);
    setExternalFeedback('Consultando fontes externas e montando o comparativo...');

    try {
      let effectiveTerm = normalizedTerm;
      let prefaceMessage: string | null = null;

      if (isLikelyGtin(normalizedTerm)) {
        const gtinLookup = await productService.lookupByGtin(normalizedTerm);
        const gtinBasedTerm = normalizeExternalSearchTerm(gtinLookup.nome ?? gtinLookup.descricao ?? gtinLookup.gtin);
        effectiveTerm = gtinBasedTerm.length >= 3 ? gtinBasedTerm : normalizedTerm;
        setExternalSearchTerm(effectiveTerm);
        if (!externalImageUrl && gtinLookup.imagemUrl) {
          setExternalImageUrl(gtinLookup.imagemUrl);
        }
        prefaceMessage = `GTIN ${normalizedTerm} localizado em ${gtinLookup.provedor}. Cruzando agora com outras fontes por "${effectiveTerm}".`;
      }

      const result = await productService.compareExternalPrices(effectiveTerm);
      setExternalResults(result);
      setExternalFeedback(prefaceMessage ?? result.mensagem);
      enqueueSnackbar(
        result.fonteMenorPreco
          ? `Menor preco externo localizado em ${result.fonteMenorPreco}.`
          : 'Comparativo externo pronto.',
        { variant: 'success' }
      );
    } catch (error) {
      setExternalResults(null);
      const message = getErrorMessage(error);
      setExternalFeedback(message);
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setExternalLoading(false);
      requestAnimationFrame(() => {
        externalInputRef.current?.focus();
        externalInputRef.current?.select();
      });
    }
  }

  async function applyUploadedPriceResearchImage(upload: ProdutoImagemUpload, sourceLabel: string) {
    const uploadedSearchTerm = normalizeExternalSearchTerm(upload.termoBusca ?? '');
    const fileNameSearchTerm = extractSearchTermFromImageFileName(upload.nomeArquivoOriginal);
    const currentSearchTerm = normalizeExternalSearchTerm(externalSearchTerm);
    const effectiveSearchTerm = uploadedSearchTerm.length >= 3
      ? upload.termoBusca?.trim() ?? null
      : currentSearchTerm.length >= 3
        ? externalSearchTerm.trim()
        : fileNameSearchTerm;

    setPriceResearchRemoteDialogOpen(false);
    setActiveTab('externa');
    setExternalImageUrl(upload.imagemUrl);
    setExternalImageFileName(upload.nomeArquivoOriginal);
    setExternalRecognitionDiagnostic(upload.diagnosticoReconhecimento?.trim() ?? null);

    if (upload.diagnosticoReconhecimento?.trim()) {
      setExternalFeedback(upload.diagnosticoReconhecimento.trim());
      enqueueSnackbar(upload.diagnosticoReconhecimento.trim(), { variant: 'info' });
    } else {
      setExternalFeedback(`${sourceLabel} Foto recebida e pronta para a raspagem de precos.`);
    }

    enqueueSnackbar(
      upload.termoBuscaOrigem === 'python-tesseract'
        ? `${sourceLabel} OCR Python identificou um termo de busca pela imagem.`
        : `${sourceLabel} Foto aplicada a pesquisa externa.`,
      { variant: 'success' }
    );

    if (effectiveSearchTerm) {
      setExternalSearchTerm(effectiveSearchTerm);
      await runExternalPriceResearch(effectiveSearchTerm);
      return;
    }

    enqueueSnackbar('Imagem recebida. Agora informe um termo de busca para comparar os precos externos.', { variant: 'info' });
  }

  async function handleExternalImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setExternalImageUploading(true);
    try {
      const optimizedFile = await optimizeProductImageFile(file);
      const upload = await productService.uploadProductImage(
        optimizedFile,
        normalizedExternalSearchTerm.length >= 3 ? externalSearchTerm.trim() : null
      );
      await applyUploadedPriceResearchImage(upload, 'Imagem recebida deste dispositivo.');
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setExternalImageUploading(false);
    }
  }

  useScanner(async (event) => {
    const capturedProductImage = parseProductImageCapturePayload(event.codigoBarras, event.formato);
    if (capturedProductImage) {
      await applyUploadedPriceResearchImage({
        imagemUrl: capturedProductImage.imageUrl,
        nomeArquivoOriginal: capturedProductImage.fileName,
        tamanhoBytes: capturedProductImage.sizeBytes,
        termoBusca: capturedProductImage.searchTerm,
        termoBuscaOrigem: capturedProductImage.searchOrigin ?? null,
        diagnosticoReconhecimento: capturedProductImage.recognitionDiagnostic ?? null
      }, 'Imagem recebida do celular.');
      return;
    }

    if (activeTab === 'externa') {
      await lookupProductAndCompareByCode(event.codigoBarras);
      return;
    }

    await lookupByCode(event.codigoBarras);
  });

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Consulta de preco e pesquisa externa</Typography>
        <Typography color="text.secondary">
          Uma aba mostra o cadastro interno da loja. A outra cruza imagem, GTIN e nome comercial com fontes externas para comparar o mercado de forma profissional.
        </Typography>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, value: PriceCheckTab) => setActiveTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="interna" label="Consulta interna" />
        <Tab value="externa" label="Pesquisa externa" />
      </Tabs>

      {activeTab === 'interna' ? (
        <Stack spacing={3}>
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            Fluxo rapido: passe o leitor, use a camera deste dispositivo ou abra o scanner no celular. O terminal consulta o cadastro interno e nao altera estoque nem venda.
          </Alert>

          <Grid container spacing={2.5}>
            <Grid item xs={12} lg={7}>
              <Card sx={{ borderRadius: 5 }}>
                <CardContent>
                  <Stack spacing={2.5}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <QrCodeScannerRoundedIcon color="primary" />
                      <Typography variant="h6">Leitura e busca</Typography>
                    </Stack>

                    <TextField
                      label="Codigo para consulta"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={handleKeyboardLookup}
                      inputRef={inputRef}
                      helperText={loading ? 'Consultando produto...' : lastLookupMessage ?? 'Digite ou leia um codigo para consultar o preco no terminal.'}
                      fullWidth
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Button onClick={() => void lookupByCode(query)} disabled={loading || !query.trim()}>
                              Consultar
                            </Button>
                          </InputAdornment>
                        )
                      }}
                    />

                    <ScannerActionBar
                      contexto="consulta-preco-terminal"
                      title="Scanner do terminal"
                      description="Leia codigo de barras ou QR Code neste terminal para localizar o item e exibir o preco."
                      defaultMode="Auto"
                      availableModes={['CodigoBarras', 'QrCode', 'Auto']}
                      onDetected={(code) => void lookupByCode(code)}
                      onFocusInput={() => inputRef.current?.focus()}
                    />

                    <Divider />

                    <Stack spacing={1.25}>
                      <Stack direction="row" alignItems="center" spacing={1.25}>
                        <SearchRoundedIcon color="primary" fontSize="small" />
                        <Typography variant="subtitle1">Busca manual por nome ou codigo</Typography>
                      </Stack>
                      <ProductSearch
                        onSelect={handleSelectProduct}
                        label="Buscar produto para consulta"
                        placeholder="Digite nome, GTIN ou codigo interno"
                        helperText="Selecione um item para exibir o preco e os dados principais neste terminal."
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} lg={5}>
              <Card sx={{ borderRadius: 5, height: '100%' }}>
                <CardContent>
                  <Stack spacing={2.5} sx={{ height: '100%' }}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <SellRoundedIcon color="secondary" />
                      <Typography variant="h6">Produto consultado</Typography>
                    </Stack>

                    {!product ? (
                      <Stack spacing={1.5} sx={{ flex: 1, justifyContent: 'center' }}>
                        <Typography color="text.secondary">
                          Nenhum produto carregado ainda. Faça uma leitura ou use a busca manual para mostrar as informacoes neste terminal.
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack spacing={2}>
                        <Box
                          sx={{
                            p: 2.5,
                            borderRadius: 4,
                            background: 'linear-gradient(135deg, rgba(23, 75, 138, 0.12), rgba(23, 75, 138, 0.04))'
                          }}
                        >
                          <Typography color="text.secondary">Preco atual</Typography>
                          <Typography variant="h3" sx={{ mt: 0.75, fontWeight: 900 }}>
                            {formatCurrency(product.precoVenda)}
                          </Typography>
                        </Box>

                        <Box>
                          <Typography variant="h5">{product.nome}</Typography>
                          <Typography color="text.secondary">
                            {product.descricao ?? 'Sem descricao detalhada cadastrada para este item.'}
                          </Typography>
                        </Box>

                        <Grid container spacing={1.5}>
                          <Grid item xs={12} sm={6}>
                            <InfoBox label="Codigo principal" value={product.codigoBarras ?? 'Sem codigo principal'} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <InfoBox label="Tipo de codigo" value={product.tipoCodigoPrincipal ?? 'Nao definido'} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <InfoBox label="Marca" value={product.marca ?? 'Nao informada'} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <InfoBox label="Unidade" value={product.unidadeMedida} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <InfoBox
                              label="Estoque atual"
                              value={`${product.estoqueAtual.toFixed(3)} ${product.unidadeMedida}`}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <InfoBox label="Status" value={product.ativo ? 'Ativo para venda' : 'Inativo'} />
                          </Grid>
                        </Grid>
                      </Stack>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ borderRadius: 5 }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Ultimos codigos consultados</Typography>
                {recentCodes.length === 0 ? (
                  <Typography color="text.secondary">Nenhuma consulta feita neste terminal ainda.</Typography>
                ) : (
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    {recentCodes.map((code) => (
                      <Chip key={code} label={code} variant="outlined" color="primary" onClick={() => void lookupByCode(code)} />
                    ))}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      ) : (
        <Stack spacing={3}>
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            Fluxo profissional: envie uma foto da embalagem, deixe o OCR sugerir o termo comercial e o sistema cruza os sites externos suportados para montar um comparativo de mercado.
          </Alert>

          <Grid container spacing={2.5}>
            <Grid item xs={12} xl={7}>
              <Card sx={{ borderRadius: 5 }}>
                <CardContent>
                  <Stack spacing={2.5}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <PublicRoundedIcon color="primary" />
                      <Typography variant="h6">Pesquisa externa por termo, GTIN ou imagem</Typography>
                    </Stack>

                    <TextField
                      label="Termo comercial ou GTIN"
                      value={externalSearchTerm}
                      onChange={(event) => setExternalSearchTerm(event.target.value)}
                      inputRef={externalInputRef}
                      helperText={
                        externalLoading
                          ? 'Consultando Carrefour, Buscape e catalogos auxiliares...'
                          : externalFeedback ?? 'Digite um nome comercial, um GTIN ou envie a imagem da embalagem.'
                      }
                      fullWidth
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void runExternalPriceResearch(externalSearchTerm);
                        }
                      }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Button onClick={() => void runExternalPriceResearch(externalSearchTerm)} disabled={externalLoading || !externalResearchReady || !externalCatalogEnabled}>
                              Comparar
                            </Button>
                          </InputAdornment>
                        )
                      }}
                    />

                    {externalCatalogStatus ? (
                      <Alert severity={externalCatalogStatus.disponivel ? 'info' : 'warning'} sx={{ borderRadius: 3 }}>
                        {externalCatalogStatus.mensagem}
                      </Alert>
                    ) : null}

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
                      <Button
                        component="label"
                        variant="outlined"
                        startIcon={<ImageSearchRoundedIcon />}
                        disabled={externalImageUploading || externalLoading}
                      >
                        {externalImageUploading ? 'Enviando foto...' : 'Foto deste dispositivo'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          hidden
                          onChange={(event) => void handleExternalImageSelected(event)}
                        />
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<PhoneIphoneRoundedIcon />}
                        onClick={() => setPriceResearchRemoteDialogOpen(true)}
                        disabled={externalLoading}
                      >
                        Fotografar no celular
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => {
                          if (!product?.nome) {
                            enqueueSnackbar('Consulte primeiro um produto interno para reaproveitar o nome dele na pesquisa externa.', { variant: 'info' });
                            return;
                          }

                          setExternalSearchTerm(product.nome);
                          void runExternalPriceResearch(product.nome);
                        }}
                        disabled={!product?.nome || externalLoading || !externalCatalogEnabled}
                      >
                        Usar nome do produto interno
                      </Button>
                    </Stack>

                    <ScannerActionBar
                      contexto="consulta-preco-externa"
                      title="Leitura para pesquisa externa"
                      description="Leia o GTIN do produto ou use QR/celular para acelerar a comparacao de mercado."
                      defaultMode="Auto"
                      availableModes={['CodigoBarras', 'QrCode', 'Auto']}
                      onDetected={(code) => void lookupProductAndCompareByCode(code)}
                      onFocusInput={() => {
                        externalInputRef.current?.focus();
                        externalInputRef.current?.select();
                      }}
                    />

                    {externalImageUrl ? (
                      <Card variant="outlined" sx={{ borderRadius: 4 }}>
                        <CardContent>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} md={4}>
                              <Box
                                component="img"
                                src={externalImageUrl}
                                alt={externalImageFileName || 'Imagem analisada'}
                                sx={{
                                  width: '100%',
                                  maxHeight: 220,
                                  objectFit: 'contain',
                                  borderRadius: 3,
                                  bgcolor: 'rgba(15, 23, 42, 0.04)'
                                }}
                              />
                            </Grid>
                            <Grid item xs={12} md={8}>
                              <Stack spacing={1.25}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  Imagem analisada
                                </Typography>
                                <Typography color="text.secondary">
                                  {externalImageFileName || 'Foto recebida para a pesquisa externa.'}
                                </Typography>
                                {externalRecognitionDiagnostic ? (
                                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                                    {externalRecognitionDiagnostic}
                                  </Alert>
                                ) : null}
                              </Stack>
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} xl={5}>
              <Card sx={{ borderRadius: 5, height: '100%' }}>
                <CardContent>
                  <Stack spacing={2.5} sx={{ height: '100%' }}>
                    <Stack direction="row" alignItems="center" spacing={1.25}>
                      <SearchRoundedIcon color="secondary" />
                      <Typography variant="h6">Resumo da comparacao</Typography>
                    </Stack>

                    {!externalResults ? (
                      <Stack spacing={1.5} sx={{ flex: 1, justifyContent: 'center' }}>
                        <Typography color="text.secondary">
                          Nenhum comparativo externo rodou ainda. Digite um termo, envie a foto da embalagem ou aproveite o nome do produto interno.
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack spacing={2}>
                        <Box
                          sx={{
                            p: 2.5,
                            borderRadius: 4,
                            background: 'linear-gradient(135deg, rgba(17, 94, 89, 0.12), rgba(17, 94, 89, 0.04))'
                          }}
                        >
                          <Typography color="text.secondary">Termo pesquisado</Typography>
                          <Typography variant="h5" sx={{ mt: 0.75, fontWeight: 900 }}>
                            {externalResults.termo}
                          </Typography>
                        </Box>

                        <Grid container spacing={1.5}>
                          <Grid item xs={12} sm={6}>
                            <MetricBox label="Menor preco" value={formatOptionalCurrency(externalResults.menorPreco)} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <MetricBox label="Maior preco" value={formatOptionalCurrency(externalResults.maiorPreco)} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <MetricBox label="Preco medio" value={formatOptionalCurrency(externalResults.precoMedio)} />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <MetricBox label="Fonte destaque" value={externalResults.fonteMenorPreco ?? 'Sem preco visivel'} />
                          </Grid>
                        </Grid>

                        <Alert severity="info" sx={{ borderRadius: 3 }}>
                          {externalResults.mensagem}
                        </Alert>
                      </Stack>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ borderRadius: 5 }}>
            <CardContent>
              <Stack spacing={2.5}>
                <Typography variant="h6">Fontes comparadas</Typography>
                {!externalResults || externalResults.fontes.length === 0 ? (
                  <Typography color="text.secondary">Nenhuma fonte externa listada ainda.</Typography>
                ) : (
                  <Grid container spacing={2}>
                    {externalResults.fontes.map((source) => (
                      <Grid item xs={12} md={6} xl={4} key={`${source.provedor}-${source.codigo ?? source.nome}`}>
                        <ExternalPriceSourceCard source={source} />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}

      <RemoteProductImageDialog
        open={priceResearchRemoteDialogOpen}
        contexto={PRICE_RESEARCH_IMAGE_CONTEXT}
        title="Foto do produto para pesquisa externa"
        description="Pareie o celular com esta tela para fotografar a embalagem, capturar um termo comercial com OCR e disparar a comparacao externa automaticamente."
        onClose={() => setPriceResearchRemoteDialogOpen(false)}
      />
    </Stack>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.75, borderRadius: 3, border: '1px solid rgba(15, 23, 42, 0.08)', height: '100%' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ mt: 0.5, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.75, borderRadius: 3, border: '1px solid rgba(15, 23, 42, 0.08)', height: '100%' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ mt: 0.5, fontWeight: 800 }}>{value}</Typography>
    </Box>
  );
}

function ExternalPriceSourceCard({ source }: { source: ProdutoPesquisaPrecoFonte }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
      <CardContent>
        <Stack spacing={1.5} sx={{ height: '100%' }}>
          {source.imagemUrl ? (
            <Box
              component="img"
              src={source.imagemUrl}
              alt={source.nome}
              sx={{
                width: '100%',
                height: 180,
                objectFit: 'contain',
                borderRadius: 3,
                bgcolor: 'rgba(15, 23, 42, 0.04)'
              }}
            />
          ) : null}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" color="primary" variant="outlined" label={source.provedor} />
            {source.preco !== null ? (
              <Chip size="small" color="success" label={formatCurrency(source.preco)} />
            ) : (
              <Chip size="small" variant="outlined" label="Preco nao publicado" />
            )}
          </Stack>

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {source.nome}
            </Typography>
            {source.descricao ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {source.descricao}
              </Typography>
            ) : null}
          </Box>

          <Stack spacing={0.5}>
            <Typography variant="body2"><strong>Marca:</strong> {source.marca ?? 'Nao informada'}</Typography>
            <Typography variant="body2"><strong>Referencia:</strong> {source.codigo ?? 'Sem codigo externo'}</Typography>
            <Typography variant="body2"><strong>Unidade sugerida:</strong> {source.unidadeSugerida}</Typography>
            <Typography variant="body2"><strong>Relevancia:</strong> {source.relevancia}</Typography>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 'auto' }}>
            {source.fonteUrl ? (
              <Button href={source.fonteUrl} target="_blank" rel="noreferrer" variant="contained">
                Abrir oferta
              </Button>
            ) : null}
            {source.buscaUrl ? (
              <Button href={source.buscaUrl} target="_blank" rel="noreferrer" variant="outlined">
                Abrir busca
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function normalizeExternalSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function isLikelyGtin(value: string) {
  return /^\d{8,14}$/.test(value);
}

function extractSearchTermFromImageFileName(fileName: string) {
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return baseName.length >= 3 ? baseName : null;
}

function formatOptionalCurrency(value: number | null) {
  return value == null ? 'Nao informado' : formatCurrency(value);
}
