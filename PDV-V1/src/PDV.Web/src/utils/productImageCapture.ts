export const PRODUCT_IMAGE_SCANNER_CONTEXT = 'produto-cadastro-imagem';
export const PRODUCT_IMAGE_SCANNER_FORMAT = 'PRODUTO_IMAGEM';

export interface ProductImageCapturePayload {
  kind: 'product-image-capture';
  imageUrl: string;
  fileName: string;
  sizeBytes: number;
  searchTerm: string | null;
  searchOrigin?: string | null;
  recognitionDiagnostic?: string | null;
  source: 'scanner-remoto' | 'upload-local' | string;
  capturedAtUtc: string;
}

export function isProductImageScannerContext(contexto: string | null | undefined) {
  return (contexto ?? '').startsWith(PRODUCT_IMAGE_SCANNER_CONTEXT);
}

export function parseProductImageCapturePayload(rawValue: string, format?: string | null) {
  if (format !== PRODUCT_IMAGE_SCANNER_FORMAT) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ProductImageCapturePayload> & { kind?: string };
    if (parsed.kind !== 'product-image-capture' || !parsed.imageUrl || !parsed.fileName || !parsed.capturedAtUtc) {
      return null;
    }

    return {
      kind: 'product-image-capture' as const,
      imageUrl: parsed.imageUrl,
      fileName: parsed.fileName,
      sizeBytes: typeof parsed.sizeBytes === 'number' ? parsed.sizeBytes : 0,
      searchTerm: typeof parsed.searchTerm === 'string' && parsed.searchTerm.trim() ? parsed.searchTerm.trim() : null,
      searchOrigin: typeof parsed.searchOrigin === 'string' && parsed.searchOrigin.trim() ? parsed.searchOrigin.trim() : null,
      recognitionDiagnostic:
        typeof parsed.recognitionDiagnostic === 'string' && parsed.recognitionDiagnostic.trim()
          ? parsed.recognitionDiagnostic.trim()
          : null,
      source: parsed.source ?? 'scanner-remoto',
      capturedAtUtc: parsed.capturedAtUtc
    };
  } catch {
    return null;
  }
}

export async function optimizeProductImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione uma imagem valida do produto.');
  }

  const normalizedCanvas = await tryLoadBitmapCanvas(file);
  if (!normalizedCanvas) {
    return file;
  }

  const maxDimension = 1600;
  const longestSide = Math.max(normalizedCanvas.width, normalizedCanvas.height);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(normalizedCanvas.width * scale));
  const targetHeight = Math.max(1, Math.round(normalizedCanvas.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(normalizedCanvas, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.86);
  });

  if (!blob) {
    return file;
  }

  if (blob.size >= file.size && file.size <= 1_600_000) {
    return file;
  }

  const normalizedName = replaceFileExtension(file.name, '.jpg');
  return new File([blob], normalizedName, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
}

async function tryLoadBitmapCanvas(file: File) {
  const source = await loadImageSource(file);
  if (!source) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) {
    if ('close' in source && typeof source.close === 'function') {
      source.close();
    }
    return null;
  }

  context.drawImage(source, 0, 0, source.width, source.height);

  if ('close' in source && typeof source.close === 'function') {
    source.close();
  }

  return canvas;
}

async function loadImageSource(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      // Fallback abaixo.
    }
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Nao foi possivel carregar a imagem selecionada.'));
      image.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return `${baseName || 'produto'}${nextExtension}`;
}
