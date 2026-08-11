import type { ProdutoCampoCustomizadoPayload, ProdutoCodigoAlternativoPayload, ProdutoPayload } from '../services/productService';
import type { ProdutoCodigoTipo } from '../types';

type MappedProductFields = {
  nome?: string;
  descricao?: string;
  marca?: string;
  ncm?: string;
  cest?: string;
  origemFiscal?: string;
  cfopVendaPadrao?: string;
  cfopCompraPadrao?: string;
  csosn?: string;
  cstIcms?: string;
  cstPis?: string;
  cstCofins?: string;
  aliquotaIcms?: number;
  aliquotaPis?: number;
  aliquotaCofins?: number;
  unidadeMedida?: string;
  codigoProdutoFornecedor?: string;
  ultimaNotaFiscalCompra?: string;
};

export interface ProductCaptureSupplierHints {
  supplierDocument?: string;
  supplierName?: string;
}

interface ParsedProductCapture {
  rawValue: string;
  detectedType: ProdutoCodigoTipo;
  structured: boolean;
  principalCode: { codigo: string; tipo: ProdutoCodigoTipo } | null;
  alternateCodes: ProdutoCodigoAlternativoPayload[];
  fieldValues: MappedProductFields;
  customFields: ProdutoCampoCustomizadoPayload[];
  supplierHints: ProductCaptureSupplierHints;
}

export interface ProductCaptureMergeResult {
  nextForm: ProdutoPayload;
  importedStructuredData: boolean;
  summary: string[];
  supplierHints: ProductCaptureSupplierHints;
}

export function mergeCapturedDataIntoProductForm(
  current: ProdutoPayload,
  rawValue: string,
  format?: string | null
): ProductCaptureMergeResult {
  const parsed = analyzeCapturedProductData(rawValue, format);
  const nextForm: ProdutoPayload = {
    ...current,
    codigosAlternativos: [...current.codigosAlternativos],
    camposCustomizados: [...current.camposCustomizados]
  };
  const summary: string[] = [];

  let principalCandidate = parsed.principalCode;
  if (!principalCandidate && parsed.detectedType !== 'Qr') {
    principalCandidate = { codigo: parsed.rawValue, tipo: parsed.detectedType };
  }

  if (!principalCandidate && parsed.detectedType === 'Qr' && !nextForm.codigoBarras) {
    principalCandidate = { codigo: parsed.rawValue, tipo: 'Qr' };
  }

  if (principalCandidate) {
    if (!nextForm.codigoBarras) {
      nextForm.codigoBarras = principalCandidate.codigo;
      nextForm.tipoCodigoPrincipal = principalCandidate.tipo;
      summary.push('Codigo principal preenchido pela leitura.');
    } else if (nextForm.codigoBarras !== principalCandidate.codigo) {
      if (addAlternateCode(nextForm.codigosAlternativos, nextForm.codigoBarras, principalCandidate.codigo, principalCandidate.tipo)) {
        summary.push('Novo codigo adicionado como identificador alternativo.');
      }
    }
  }

  for (const code of parsed.alternateCodes) {
    if (addAlternateCode(nextForm.codigosAlternativos, nextForm.codigoBarras, code.codigo, code.tipo)) {
      summary.push('Leitura complementar salva como codigo alternativo.');
    }
  }

  const mappedEntries = Object.entries(parsed.fieldValues) as Array<[keyof MappedProductFields, string | number | undefined]>;
  for (const [field, value] of mappedEntries) {
    if (value === undefined || value === null) {
      continue;
    }

    switch (field) {
      case 'unidadeMedida':
        if ((!nextForm.unidadeMedida || nextForm.unidadeMedida === 'UN') && typeof value === 'string' && value.trim()) {
          nextForm.unidadeMedida = value.trim().toUpperCase();
        }
        break;
      case 'aliquotaIcms':
      case 'aliquotaPis':
      case 'aliquotaCofins':
        if (nextForm[field] === null && typeof value === 'number') {
          nextForm[field] = value;
        }
        break;
      default:
        if (!hasContent(nextForm[field]) && typeof value === 'string') {
          nextForm[field] = value;
        }
        break;
    }
  }

  if (parsed.customFields.length > 0) {
    for (const customField of parsed.customFields) {
      upsertCustomField(nextForm.camposCustomizados, customField);
    }
    summary.push('Dados extras do QR foram guardados em campos personalizados.');
  }

  return {
    nextForm,
    importedStructuredData: parsed.structured,
    summary,
    supplierHints: parsed.supplierHints
  };
}

function analyzeCapturedProductData(rawValue: string, format?: string | null): ParsedProductCapture {
  const normalizedValue = rawValue.trim();
  const detectedType = inferCapturedCodeType(normalizedValue, format);
  const structuredEntries = extractStructuredEntries(normalizedValue);
  const fieldValues: MappedProductFields = {};
  const customFields: ProdutoCampoCustomizadoPayload[] = [];
  const supplierHints: ProductCaptureSupplierHints = {};
  const usedKeys = new Set<string>();

  for (const [key, value] of structuredEntries) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey || !value.trim()) {
      continue;
    }

    if (applyMappedField(fieldValues, supplierHints, normalizedKey, value)) {
      usedKeys.add(normalizedKey);
      continue;
    }
  }

  for (const [key, value] of structuredEntries) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey || usedKeys.has(normalizedKey) || !value.trim()) {
      continue;
    }

    customFields.push({
      chave: prettifyFieldLabel(key),
      valor: value.trim()
    });
  }

  let principalCode = inferPrincipalCode(normalizedValue, detectedType, structuredEntries);
  if (principalCode?.tipo === 'Ean' && !fieldValues.ncm && structuredEntries.has('ncm')) {
    fieldValues.ncm = structuredEntries.get('ncm') ?? fieldValues.ncm;
  }

  const alternateCodes: ProdutoCodigoAlternativoPayload[] = [];
  if (detectedType === 'Qr' && normalizedValue && principalCode?.codigo !== normalizedValue) {
    alternateCodes.push({ codigo: normalizedValue, tipo: 'Qr' });
  }

  if (structuredEntries.size > 0 && detectedType === 'Qr') {
    upsertCustomField(customFields, {
      chave: 'QR Payload bruto',
      valor: normalizedValue
    });
  }

  if (!principalCode && detectedType === 'Qr') {
    const gtinLikeValue = findStructuredValue(structuredEntries, ['gtin', 'ean', 'codigobarras', 'barcode']);
    if (gtinLikeValue && /^\d{8,14}$/.test(onlyDigits(gtinLikeValue))) {
      principalCode = { codigo: onlyDigits(gtinLikeValue), tipo: 'Ean' };
    }
  }

  return {
    rawValue: normalizedValue,
    detectedType,
    structured: structuredEntries.size > 0,
    principalCode,
    alternateCodes,
    fieldValues,
    customFields,
    supplierHints
  };
}

function inferCapturedCodeType(code: string, format?: string | null): ProdutoCodigoTipo {
  const normalizedFormat = (format ?? '').toUpperCase();
  if (normalizedFormat.includes('QR')) {
    return 'Qr';
  }

  if (/^\d{8,14}$/.test(code.trim())) {
    return 'Ean';
  }

  return 'Interno';
}

function inferPrincipalCode(
  rawValue: string,
  detectedType: ProdutoCodigoTipo,
  structuredEntries: Map<string, string>
) {
  const rawDigits = onlyDigits(rawValue);
  if (detectedType === 'Ean' && /^\d{8,14}$/.test(rawDigits)) {
    return { codigo: rawDigits, tipo: 'Ean' as const };
  }

  const structuredGtin = findStructuredValue(structuredEntries, ['gtin', 'ean', 'codigobarras', 'barcode']);
  if (structuredGtin) {
    const digits = onlyDigits(structuredGtin);
    if (/^\d{8,14}$/.test(digits)) {
      return { codigo: digits, tipo: 'Ean' as const };
    }
  }

  const structuredQr = findStructuredValue(structuredEntries, ['qrcode', 'codigoqr', 'conteudoqr']);
  if (structuredQr?.trim()) {
    return { codigo: structuredQr.trim(), tipo: 'Qr' as const };
  }

  return null;
}

function extractStructuredEntries(rawValue: string) {
  return parseJsonObject(rawValue)
    ?? parseGs1AiPayload(rawValue)
    ?? parseUrlPayload(rawValue)
    ?? parseQueryStringPayload(rawValue)
    ?? parseKeyValueLines(rawValue)
    ?? new Map<string, string>();
}

function parseJsonObject(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const entries = new Map<string, string>();
    flattenUnknownValue(entries, '', parsed);
    return entries.size > 0 ? entries : null;
  } catch {
    return null;
  }
}

function parseGs1AiPayload(rawValue: string) {
  const cleaned = rawValue.replace(/\u001d/g, '|').trim();
  if (!cleaned.includes('(01)') && !cleaned.includes('(10)') && !cleaned.includes('(17)') && !cleaned.includes('(21)')) {
    return null;
  }

  const matches = [...cleaned.matchAll(/\((\d{2,4})\)([^()|]+)/g)];
  if (matches.length === 0) {
    return null;
  }

  const entries = new Map<string, string>();
  for (const match of matches) {
    const ai = match[1];
    const value = match[2]?.trim();
    if (!value) {
      continue;
    }

    switch (ai) {
      case '01':
        entries.set('gtin', onlyDigits(value));
        break;
      case '10':
        entries.set('lote', value);
        break;
      case '17':
        entries.set('validade', formatGs1Date(value));
        break;
      case '21':
        entries.set('serial', value);
        break;
      case '240':
        entries.set('codigo_fabricante', value);
        break;
      default:
        entries.set(`ai_${ai}`, value);
        break;
    }
  }

  return entries.size > 0 ? entries : null;
}

function parseUrlPayload(rawValue: string) {
  if (!/^https?:\/\//i.test(rawValue.trim())) {
    return null;
  }

  try {
    const url = new URL(rawValue.trim());
    const entries = new Map<string, string>();

    url.searchParams.forEach((value, key) => {
      if (value.trim()) {
        entries.set(key, value.trim());
      }
    });

    const pathSegments = url.pathname.split('/').filter(Boolean);
    for (let index = 0; index < pathSegments.length - 1; index += 2) {
      const key = decodeURIComponent(pathSegments[index] ?? '').trim();
      const value = decodeURIComponent(pathSegments[index + 1] ?? '').trim();
      if (!key || !value) {
        continue;
      }

      if (/^\d{2,4}$/.test(key)) {
        appendGs1PathEntry(entries, key, value);
      } else {
        entries.set(key, value);
      }
    }

    return entries.size > 0 ? entries : null;
  } catch {
    return null;
  }
}

function parseQueryStringPayload(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed.includes('=') || trimmed.includes('\n')) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams(trimmed.startsWith('?') ? trimmed : `?${trimmed}`);
    const entries = new Map<string, string>();
    searchParams.forEach((value, key) => {
      if (value.trim()) {
        entries.set(key, value.trim());
      }
    });
    return entries.size > 0 ? entries : null;
  } catch {
    return null;
  }
}

function parseKeyValueLines(rawValue: string) {
  const lines = rawValue
    .split(/\r?\n|[;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const entries = new Map<string, string>();
  for (const line of lines) {
    const separatorIndex = line.includes(':') ? line.indexOf(':') : line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }

    entries.set(key, value);
  }

  return entries.size > 0 ? entries : null;
}

function flattenUnknownValue(entries: Map<string, string>, prefix: string, value: unknown) {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenUnknownValue(entries, prefix ? `${prefix}.${index + 1}` : `${index + 1}`, item));
    return;
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      flattenUnknownValue(entries, prefix ? `${prefix}.${childKey}` : childKey, childValue);
    }
    return;
  }

  entries.set(prefix || 'valor', String(value));
}

function appendGs1PathEntry(entries: Map<string, string>, ai: string, value: string) {
  switch (ai) {
    case '01':
      entries.set('gtin', onlyDigits(value));
      break;
    case '10':
      entries.set('lote', value);
      break;
    case '17':
      entries.set('validade', formatGs1Date(value));
      break;
    case '21':
      entries.set('serial', value);
      break;
    default:
      entries.set(`ai_${ai}`, value);
      break;
  }
}

function applyMappedField(
  fields: MappedProductFields,
  supplierHints: ProductCaptureSupplierHints,
  normalizedKey: string,
  rawValue: string
) {
  const value = rawValue.trim();
  if (!value) {
    return false;
  }

  switch (normalizedKey) {
    case 'nome':
    case 'produto':
    case 'productname':
    case 'descricaoitem':
      fields.nome = value;
      return true;
    case 'descricao':
    case 'desc':
    case 'detalhes':
    case 'resumo':
      fields.descricao = value;
      return true;
    case 'marca':
    case 'brand':
    case 'fabricante':
      fields.marca = value;
      return true;
    case 'ncm':
      fields.ncm = onlyDigits(value) || value;
      return true;
    case 'cest':
      fields.cest = onlyDigits(value) || value;
      return true;
    case 'origem':
    case 'origemfiscal':
    case 'origemmercadoria':
      fields.origemFiscal = value;
      return true;
    case 'cfopvenda':
    case 'cfopsaida':
      fields.cfopVendaPadrao = onlyDigits(value) || value;
      return true;
    case 'cfopcompra':
    case 'cfopentrada':
      fields.cfopCompraPadrao = onlyDigits(value) || value;
      return true;
    case 'csosn':
      fields.csosn = onlyDigits(value) || value;
      return true;
    case 'csticms':
      fields.cstIcms = onlyDigits(value) || value;
      return true;
    case 'cstpis':
      fields.cstPis = onlyDigits(value) || value;
      return true;
    case 'cstcofins':
      fields.cstCofins = onlyDigits(value) || value;
      return true;
    case 'aliquotaicms':
      fields.aliquotaIcms = parsePercent(value);
      return true;
    case 'aliquotapis':
      fields.aliquotaPis = parsePercent(value);
      return true;
    case 'aliquotacofins':
      fields.aliquotaCofins = parsePercent(value);
      return true;
    case 'unidademedida':
    case 'unidade':
    case 'um':
      fields.unidadeMedida = value.toUpperCase();
      return true;
    case 'codigofornecedor':
    case 'skufornecedor':
    case 'suppliercode':
      fields.codigoProdutoFornecedor = value;
      return true;
    case 'fornecedor':
    case 'nomefornecedor':
    case 'fornecedornome':
    case 'fornecedorrazaosocial':
    case 'razaosocialfornecedor':
    case 'supplier':
    case 'suppliername':
    case 'emitente':
    case 'emitentenome':
    case 'emitenterazaosocial':
    case 'razaosocialemitente':
      supplierHints.supplierName = value;
      return true;
    case 'cnpj':
    case 'cpfcnpj':
    case 'documentofornecedor':
    case 'fornecedorcnpj':
    case 'fornecedordocumento':
    case 'cnpjfornecedor':
    case 'suppliercnpj':
    case 'supplierdocument':
    case 'emitentecnpj':
    case 'emitentedocumento':
    case 'fabricantecnpj':
      supplierHints.supplierDocument = onlyDigits(value) || value;
      return true;
    case 'ultimanf':
    case 'ultimanotafiscal':
    case 'notafiscal':
      fields.ultimaNotaFiscalCompra = value;
      return true;
    default:
      return false;
  }
}

function addAlternateCode(
  alternateCodes: ProdutoCodigoAlternativoPayload[],
  principalCode: string | null,
  candidateCode: string,
  tipo: ProdutoCodigoTipo
) {
  const normalizedCandidate = candidateCode.trim();
  if (!normalizedCandidate) {
    return false;
  }

  if (principalCode?.trim() === normalizedCandidate) {
    return false;
  }

  if (alternateCodes.some((item) => item.codigo.trim() === normalizedCandidate)) {
    return false;
  }

  alternateCodes.push({
    codigo: normalizedCandidate,
    tipo
  });
  return true;
}

function upsertCustomField(customFields: ProdutoCampoCustomizadoPayload[], incoming: ProdutoCampoCustomizadoPayload) {
  const key = incoming.chave.trim();
  if (!key) {
    return;
  }

  const existing = customFields.find((item) => item.chave.trim().toLowerCase() === key.toLowerCase());
  if (existing) {
    existing.valor = incoming.valor?.trim() || null;
    return;
  }

  customFields.push({
    chave: key,
    valor: incoming.valor?.trim() || null
  });
}

function findStructuredValue(entries: Map<string, string>, candidateKeys: string[]) {
  for (const [key, value] of entries.entries()) {
    if (candidateKeys.includes(normalizeKey(key))) {
      return value;
    }
  }

  return null;
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function prettifyFieldLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Campo extra';
  }

  return trimmed
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function parsePercent(value: string) {
  const normalized = value.replace('%', '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatGs1Date(value: string) {
  const digits = onlyDigits(value);
  if (!/^\d{6}$/.test(digits)) {
    return value.trim();
  }

  const year = Number(digits.slice(0, 2));
  const month = digits.slice(2, 4);
  const day = digits.slice(4, 6);
  return `${day}/${month}/20${year.toString().padStart(2, '0')}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function hasContent(value: unknown) {
  return typeof value === 'string'
    ? value.trim().length > 0
    : value !== null && value !== undefined;
}
