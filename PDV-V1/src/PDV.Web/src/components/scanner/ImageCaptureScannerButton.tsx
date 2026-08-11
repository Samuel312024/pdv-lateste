import PhotoCameraBackRoundedIcon from '@mui/icons-material/PhotoCameraBackRounded';
import { Button, type ButtonProps } from '@mui/material';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { Html5Qrcode } from 'html5-qrcode';
import { useSnackbar } from 'notistack';
import type { ChangeEvent } from 'react';
import type { ScannerTipoLeitura } from '../../types';
import { getErrorMessage } from '../../utils/http';
import {
  getBarcodeDetectorClass,
  getBarcodeDetectorFormats,
  getCropBox,
  getHtml5QrcodeFormats,
  getScannerCaptureLabel,
  getZxingPossibleFormats,
  isScannerFormatAccepted
} from '../../utils/scanner';

interface ImageCaptureScannerButtonProps {
  label?: string;
  mode?: ScannerTipoLeitura;
  onDetected: (code: string, format?: string | null) => void;
  variant?: ButtonProps['variant'];
  fullWidth?: boolean;
  size?: ButtonProps['size'];
  sx?: ButtonProps['sx'];
  onStatus?: (type: 'info' | 'warning' | 'error', message: string) => void;
}

export function ImageCaptureScannerButton({
  label,
  mode = 'Auto',
  onDetected,
  variant = 'outlined',
  fullWidth = false,
  size = 'medium',
  sx,
  onStatus
}: ImageCaptureScannerButtonProps) {
  const { enqueueSnackbar } = useSnackbar();

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      onStatus?.('warning', 'Nenhuma imagem foi selecionada para leitura.');
      return;
    }

    try {
      onStatus?.('info', 'Imagem recebida. Preparando a leitura do codigo...');
      const html5Result = await tryDetectWithHtml5QrcodeFile(file, mode);
      if (html5Result) {
        onStatus?.('info', `Leitura concluida com sucesso: ${html5Result.code}`);
        onDetected(html5Result.code, html5Result.format);
        event.target.value = '';
        return;
      }

      const sourceCanvas = await loadCaptureCanvas(file);
      const canvases = buildDetectionCanvases(sourceCanvas, mode);

      const detectorResult = await tryDetectWithBarcodeDetectorFromSources(canvases, mode)
        ?? await tryDetectWithZxingFromCanvases(canvases, mode);

      if (!detectorResult) {
        throw new Error('Nenhum QR Code ou codigo de barras compativel foi encontrado. Tente aproximar mais, melhorar a iluminacao ou enquadrar apenas o codigo.');
      }

      onStatus?.('info', `Leitura concluida com sucesso: ${detectorResult.code}`);
      onDetected(detectorResult.code, detectorResult.format);
      event.target.value = '';
    } catch (error) {
      const message = getErrorMessage(error);
      onStatus?.('error', `Nao foi possivel ler a imagem: ${message}`);
      enqueueSnackbar(`Nao foi possivel ler a imagem: ${message}`, { variant: 'error' });
      event.target.value = '';
    }
  }

  return (
    <Button
      component="label"
      variant={variant}
      fullWidth={fullWidth}
      size={size}
      sx={sx}
      startIcon={<PhotoCameraBackRoundedIcon />}
      onClick={() => onStatus?.('info', 'Abrindo camera ou galeria do dispositivo...')}
    >
      {label ?? getScannerCaptureLabel(mode)}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => void handleFileSelected(event)}
      />
    </Button>
  );
}

async function loadCaptureCanvas(file: File) {
  const normalizedCanvas = await tryLoadBitmapCanvas(file);
  if (normalizedCanvas) {
    return normalizedCanvas;
  }

  const image = await loadImageFallback(file);
  return drawFullCanvas(image.naturalWidth, image.naturalHeight, (context, width, height) => {
    context.drawImage(image, 0, 0, width, height);
  });
}

async function tryLoadBitmapCanvas(file: File) {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return drawFullCanvas(bitmap.width, bitmap.height, (context, width, height) => {
      context.drawImage(bitmap as ImageBitmap, 0, 0, width, height);
    });
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

async function loadImageFallback(file: File) {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Nao foi possivel carregar a imagem capturada.'));
      image.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawFullCanvas(
  sourceWidth: number,
  sourceHeight: number,
  painter: (context: CanvasRenderingContext2D, width: number, height: number) => void
) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Nao foi possivel preparar a imagem para leitura.');
  }

  const maxDimension = 2200;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  prepareCanvasContext(context);
  painter(context, canvas.width, canvas.height);
  return canvas;
}

function drawFocusedCanvas(source: HTMLCanvasElement, mode: ScannerTipoLeitura) {
  const crop = getCropBox(source.width, source.height, mode);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Nao foi possivel preparar a imagem para leitura.');
  }

  canvas.width = crop.width;
  canvas.height = crop.height;
  prepareCanvasContext(context);
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas;
}

function cloneCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Nao foi possivel preparar a imagem para leitura.');
  }

  canvas.width = source.width;
  canvas.height = source.height;
  prepareCanvasContext(context);
  context.drawImage(source, 0, 0);
  return canvas;
}

function buildDetectionCanvases(source: HTMLCanvasElement, mode: ScannerTipoLeitura) {
  const canvases: HTMLCanvasElement[] = [];
  const fullCanvas = limitCanvasSize(cloneCanvas(source), 1800);
  const focusedCanvas = limitCanvasSize(drawFocusedCanvas(source, mode), 1600);
  const expandedFocusedCanvas = limitCanvasSize(drawExpandedFocusedCanvas(source, mode), 1800);

  canvases.push(focusedCanvas, expandedFocusedCanvas, fullCanvas);

  const upscaledFocusedCanvas = resizeCanvas(focusedCanvas, mode === 'CodigoBarras' ? 2 : 1.6);
  if (upscaledFocusedCanvas) {
    canvases.push(upscaledFocusedCanvas);
  }

  const upscaledExpandedCanvas = resizeCanvas(expandedFocusedCanvas, mode === 'CodigoBarras' ? 1.9 : 1.45);
  if (upscaledExpandedCanvas) {
    canvases.push(upscaledExpandedCanvas);
  }

  const rotatedFocused90 = rotateCanvas(focusedCanvas, 90);
  const rotatedFocused180 = rotateCanvas(focusedCanvas, 180);
  const rotatedFocused270 = rotateCanvas(focusedCanvas, 270);
  const rotatedFull90 = rotateCanvas(fullCanvas, 90);
  const rotatedFull180 = rotateCanvas(fullCanvas, 180);
  const rotatedFull270 = rotateCanvas(fullCanvas, 270);

  if (rotatedFocused90) {
    canvases.push(rotatedFocused90);
  }

  if (rotatedFocused180) {
    canvases.push(rotatedFocused180);
  }

  if (rotatedFocused270) {
    canvases.push(rotatedFocused270);
  }

  if (rotatedFull90) {
    canvases.push(rotatedFull90);
  }

  if (rotatedFull180) {
    canvases.push(rotatedFull180);
  }

  if (rotatedFull270) {
    canvases.push(rotatedFull270);
  }

  const contrastFocusedCanvas = createHighContrastCanvas(focusedCanvas);
  if (contrastFocusedCanvas) {
    canvases.push(contrastFocusedCanvas);
  }

  const contrastFullCanvas = createHighContrastCanvas(fullCanvas);
  if (contrastFullCanvas) {
    canvases.push(contrastFullCanvas);
  }

  return canvases;
}

function limitCanvasSize(source: HTMLCanvasElement, maxDimension: number) {
  const currentMax = Math.max(source.width, source.height);
  if (currentMax <= maxDimension) {
    return source;
  }

  const scale = maxDimension / currentMax;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return source;
  }

  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  prepareCanvasContext(context);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawExpandedFocusedCanvas(source: HTMLCanvasElement, mode: ScannerTipoLeitura) {
  const crop = getCropBox(source.width, source.height, mode);
  const paddingX = Math.round(crop.width * 0.16);
  const paddingY = Math.round(crop.height * 0.18);
  const x = Math.max(0, crop.x - paddingX);
  const y = Math.max(0, crop.y - paddingY);
  const width = Math.min(source.width - x, crop.width + paddingX * 2);
  const height = Math.min(source.height - y, crop.height + paddingY * 2);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Nao foi possivel preparar a imagem para leitura.');
  }

  canvas.width = width;
  canvas.height = height;
  prepareCanvasContext(context);
  context.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function resizeCanvas(source: HTMLCanvasElement, factor: number) {
  if (!Number.isFinite(factor) || factor <= 1) {
    return null;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  canvas.width = Math.max(1, Math.round(source.width * factor));
  canvas.height = Math.max(1, Math.round(source.height * factor));
  prepareCanvasContext(context);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rotateCanvas(source: HTMLCanvasElement, degrees: 90 | 180 | 270) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }

  if (degrees === 180) {
    canvas.width = source.width;
    canvas.height = source.height;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
  }

  canvas.width = source.height;
  canvas.height = source.width;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function createHighContrastCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  canvas.width = source.width;
  canvas.height = source.height;
  context.drawImage(source, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const boosted = Math.max(0, Math.min(255, (luminance - 128) * 1.8 + 128));
    data[index] = boosted;
    data[index + 1] = boosted;
    data[index + 2] = boosted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function prepareCanvasContext(context: CanvasRenderingContext2D) {
  context.imageSmoothingEnabled = false;
  context.imageSmoothingQuality = 'low';
}

async function tryDetectWithHtml5QrcodeFile(file: File, mode: ScannerTipoLeitura) {
  if (typeof document === 'undefined') {
    return null;
  }

  const container = document.createElement('div');
  container.id = `pdv-html5-file-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const scanner = new Html5Qrcode(container.id, {
    verbose: false,
    formatsToSupport: getHtml5QrcodeFormats(mode),
    useBarCodeDetectorIfSupported: true
  });

  try {
    const result = await scanner.scanFileV2(file, false);
    const code = result.decodedText.trim();
    const format = result.result.format?.formatName?.toUpperCase()
      ?? result.result.format?.toString?.().toUpperCase()
      ?? null;

    if (!code || !isScannerFormatAccepted(format, mode)) {
      return null;
    }

    return {
      code,
      format
    };
  } catch {
    return null;
  } finally {
    try {
      scanner.clear();
    } catch {
      // O scanner temporario pode ja ter descartado a arvore.
    }

    container.remove();
  }
}

async function tryDetectWithBarcodeDetector(source: CanvasImageSource, mode: ScannerTipoLeitura) {
  const detectorClass = getBarcodeDetectorClass();
  if (!detectorClass) {
    return null;
  }

  try {
    const formats = await getBarcodeDetectorFormats(mode);
    if (formats.length === 0) {
      return null;
    }

    const detector = new detectorClass({ formats });
    const results = await detector.detect(source);
    const first = results.find((item) => item.rawValue?.trim());

    return first
      ? {
          code: first.rawValue.trim(),
          format: first.format?.toUpperCase() ?? null
        }
      : null;
  } catch {
    return null;
  }
}

async function tryDetectWithBarcodeDetectorFromSources(sources: CanvasImageSource[], mode: ScannerTipoLeitura) {
  for (const source of sources) {
    const result = await tryDetectWithBarcodeDetector(source, mode);
    if (result) {
      return result;
    }
  }

  return null;
}

async function tryDetectWithZxingFromCanvases(canvases: HTMLCanvasElement[], mode: ScannerTipoLeitura) {
  for (const canvas of canvases) {
    try {
      const reader = createZxingReader(mode);
      const result = reader.decodeFromCanvas(canvas);
      const format = result.getBarcodeFormat().toString();

      if (!isScannerFormatAccepted(format, mode)) {
        continue;
      }

      const code = result.getText().trim();
      if (!code) {
        continue;
      }

      return {
        code,
        format
      };
    } catch {
      // Continua tentando a proxima variacao da imagem.
    }
  }

  return null;
}

function createZxingReader(mode: ScannerTipoLeitura) {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, getZxingPossibleFormats(mode));
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}
