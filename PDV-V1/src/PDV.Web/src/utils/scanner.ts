import { BarcodeFormat } from '@zxing/library';
import { Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode';
import type { ScannerTipoLeitura } from '../types';

export type ScannerPerformanceMode = 'default' | 'light' | 'precision';

export interface ScannerModeOption {
  value: ScannerTipoLeitura;
  label: string;
  shortLabel: string;
  description: string;
}

export interface ScannerFocusFrame {
  widthPercent: number;
  heightPercent: number;
  borderRadius: number;
}

const barcodeFormatsZxing = new Set([
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'CODE_128',
  'CODE_39',
  'CODE_93',
  'ITF',
  'CODABAR',
  'RSS_14',
  'RSS_EXPANDED',
  'DATA_MATRIX',
  'PDF_417',
  'AZTEC'
]);

const barcodeDetectorBarcodeFormats = [
  'aztec',
  'codabar',
  'code_39',
  'code_93',
  'code_128',
  'data_matrix',
  'ean_8',
  'ean_13',
  'itf',
  'pdf417',
  'upc_a',
  'upc_e'
];

const qrFormatsZxing = new Set(['QR_CODE']);
const barcodeDetectorQrFormats = ['qr_code'];
const zxingBarcodeFormats = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC
];
const zxingQrFormats = [BarcodeFormat.QR_CODE];
const html5BarcodeFormats = [
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.RSS_14,
  Html5QrcodeSupportedFormats.RSS_EXPANDED,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E
];
const html5QrFormats = [Html5QrcodeSupportedFormats.QR_CODE];

export const scannerModeOptions: ScannerModeOption[] = [
  {
    value: 'CodigoBarras',
    label: 'Codigo de barras',
    shortLabel: 'Barras',
    description: 'Faixa horizontal focada em etiquetas lineares, EAN e codigos impressos.'
  },
  {
    value: 'QrCode',
    label: 'QR Code',
    shortLabel: 'QR Code',
    description: 'Quadro central focado em codigos 2D, QR e etiquetagem quadrada.'
  },
  {
    value: 'Auto',
    label: 'Automatico',
    shortLabel: 'Auto',
    description: 'Aceita QR Code e codigo de barras quando voce nao quer limitar o tipo.'
  }
];

export function formatScannerMode(mode: ScannerTipoLeitura) {
  return scannerModeOptions.find((item) => item.value === mode)?.label ?? mode;
}

export function getScannerModeDescription(mode: ScannerTipoLeitura) {
  return scannerModeOptions.find((item) => item.value === mode)?.description ?? '';
}

export function getScannerPrompt(mode: ScannerTipoLeitura) {
  return mode === 'QrCode'
    ? 'Alinhe o QR Code dentro do quadro central.'
    : mode === 'CodigoBarras'
      ? 'Alinhe o codigo dentro da faixa horizontal.'
      : 'Alinhe o codigo dentro da area destacada.';
}

export function getScannerScreenTitle(mode: ScannerTipoLeitura) {
  return mode === 'QrCode'
    ? 'Escaneie o QR Code'
    : mode === 'CodigoBarras'
      ? 'Escaneie o codigo de barras'
      : 'Escaneie o codigo';
}

export function getScannerManualLabel(mode: ScannerTipoLeitura) {
  return mode === 'QrCode'
    ? 'Digitar QR Code'
    : mode === 'CodigoBarras'
      ? 'Digitar codigo de barras'
      : 'Digitar codigo';
}

export function getScannerFocusFrame(mode: ScannerTipoLeitura, performanceMode: ScannerPerformanceMode = 'default'): ScannerFocusFrame {
  if (mode === 'QrCode') {
    if (performanceMode === 'precision') {
      return {
        widthPercent: 46,
        heightPercent: 36,
        borderRadius: 22
      };
    }

    return {
      widthPercent: 62,
      heightPercent: 46,
      borderRadius: 24
    };
  }

  if (mode === 'CodigoBarras') {
    return {
      widthPercent: 84,
      heightPercent: 22,
      borderRadius: 18
    };
  }

  return {
    widthPercent: 74,
    heightPercent: 34,
    borderRadius: 22
  };
}

export function isScannerFormatAccepted(format: string | null | undefined, mode: ScannerTipoLeitura) {
  if (!format || mode === 'Auto') {
    return true;
  }

  const normalized = format.toUpperCase();
  if (mode === 'QrCode') {
    return qrFormatsZxing.has(normalized) || normalized === 'QR_CODE';
  }

  return barcodeFormatsZxing.has(normalized) && !qrFormatsZxing.has(normalized);
}

export async function getBarcodeDetectorFormats(mode: ScannerTipoLeitura) {
  const detectorClass = getBarcodeDetectorClass();
  if (!detectorClass) {
    return [];
  }

  const requested = mode === 'QrCode'
    ? barcodeDetectorQrFormats
    : mode === 'CodigoBarras'
      ? barcodeDetectorBarcodeFormats
      : [...barcodeDetectorQrFormats, ...barcodeDetectorBarcodeFormats];

  const supported = typeof detectorClass.getSupportedFormats === 'function'
    ? await detectorClass.getSupportedFormats()
    : requested;

  return requested.filter((item) => supported.includes(item));
}

export function getCropBox(sourceWidth: number, sourceHeight: number, mode: ScannerTipoLeitura) {
  const focus = getScannerFocusFrame(mode);
  const cropWidth = Math.max(160, Math.floor(sourceWidth * (focus.widthPercent / 100)));
  const cropHeight = Math.max(120, Math.floor(sourceHeight * (focus.heightPercent / 100)));

  return {
    x: Math.max(0, Math.floor((sourceWidth - cropWidth) / 2)),
    y: Math.max(0, Math.floor((sourceHeight - cropHeight) / 2)),
    width: Math.min(sourceWidth, cropWidth),
    height: Math.min(sourceHeight, cropHeight)
  };
}

export function getScannerCaptureLabel(mode: ScannerTipoLeitura) {
  return mode === 'QrCode'
    ? 'Abrir camera ou foto do QR Code'
    : mode === 'CodigoBarras'
      ? 'Abrir camera ou foto do codigo'
      : 'Abrir camera ou foto';
}

export function getBarcodeDetectorClass() {
  if (typeof window === 'undefined' || typeof window.BarcodeDetector === 'undefined') {
    return null;
  }

  return window.BarcodeDetector;
}

export function getHtml5QrcodeFormats(mode: ScannerTipoLeitura) {
  return mode === 'QrCode'
    ? html5QrFormats
    : mode === 'CodigoBarras'
      ? html5BarcodeFormats
      : [...html5QrFormats, ...html5BarcodeFormats];
}

export function getHtml5QrcodeQrbox(mode: ScannerTipoLeitura, performanceMode: ScannerPerformanceMode = 'default') {
  return (viewfinderWidth: number, viewfinderHeight: number) => {
    const focus = getScannerFocusFrame(mode, performanceMode);
    const minimumWidth = mode === 'QrCode' && performanceMode === 'precision' ? 120 : 180;
    const minimumHeight = mode === 'QrCode' && performanceMode === 'precision' ? 120 : 140;
    const width = Math.max(minimumWidth, Math.floor(viewfinderWidth * (focus.widthPercent / 100)));
    const height = Math.max(minimumHeight, Math.floor(viewfinderHeight * (focus.heightPercent / 100)));

    return {
      width: Math.min(viewfinderWidth, width),
      height: Math.min(viewfinderHeight, height)
    };
  };
}

export function getHtml5CameraScanConfig(mode: ScannerTipoLeitura, performanceMode: ScannerPerformanceMode = 'default') {
  return {
    fps: performanceMode === 'light' ? 8 : performanceMode === 'precision' ? 14 : 12,
    qrbox: getHtml5QrcodeQrbox(mode, performanceMode),
    disableFlip: false
  };
}

export function buildPreferredCameraConstraints(cameraId?: string | null): MediaTrackConstraints {
  return cameraId
    ? {
        deviceId: { exact: cameraId }
      }
    : {
        facingMode: 'environment'
      };
}

export function getZxingPossibleFormats(mode: ScannerTipoLeitura) {
  return mode === 'QrCode'
    ? zxingQrFormats
    : mode === 'CodigoBarras'
      ? zxingBarcodeFormats
      : [...zxingQrFormats, ...zxingBarcodeFormats];
}

export function canUseLiveCamera() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const hasGetUserMedia = typeof navigator.mediaDevices?.getUserMedia === 'function';
  if (!hasGetUserMedia) {
    return false;
  }

  if (window.isSecureContext) {
    return true;
  }

  const hostname = window.location.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function getLiveCameraUnavailableMessage() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Este celular bloqueou a camera ao vivo porque a pagina esta em HTTP. Use a captura por camera/foto ou abra o sistema em HTTPS para leitura ao vivo.';
  }

  return 'A camera ao vivo nao esta disponivel neste navegador. Use a captura por camera/foto para continuar a leitura.';
}

export function getVideoConstraints(performanceMode: ScannerPerformanceMode = 'default') {
  if (performanceMode === 'light') {
    return {
      width: { ideal: 640, max: 960 },
      height: { ideal: 480, max: 540 },
      frameRate: { ideal: 8, max: 10 }
    };
  }

  if (performanceMode === 'precision') {
    return {
      width: { ideal: 1920, max: 2560 },
      height: { ideal: 1080, max: 1440 },
      frameRate: { ideal: 14, max: 18 }
    };
  }

  return {
    width: { ideal: 960, max: 1280 },
    height: { ideal: 540, max: 720 },
    frameRate: { ideal: 12, max: 15 }
  };
}

export function getScanInterval(performanceMode: ScannerPerformanceMode = 'default') {
  if (performanceMode === 'light') {
    return 420;
  }

  return performanceMode === 'precision' ? 140 : 180;
}

export function getZxingAttemptDelay(performanceMode: ScannerPerformanceMode = 'default') {
  if (performanceMode === 'light') {
    return 420;
  }

  return performanceMode === 'precision' ? 220 : 260;
}

export function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function isBackCameraLabel(label: string | null | undefined) {
  return /back|rear|environment|traseira|traseiro|world/i.test((label ?? '').toLowerCase());
}

export function isBackCameraTrack(track: MediaStreamTrack | null | undefined) {
  if (!track) {
    return false;
  }

  const label = track.label.toLowerCase();
  const facingMode = String(track.getSettings().facingMode ?? '').toLowerCase();
  return isBackCameraLabel(label) || facingMode === 'environment';
}

export function pickPreferredCamera(cameras: CameraDevice[]) {
  if (cameras.length === 0) {
    return null;
  }

  const savedCameraId = getSavedPreferredCameraId();
  if (savedCameraId) {
    const savedCamera = cameras.find((item) => item.id === savedCameraId);
    if (savedCamera) {
      return savedCamera;
    }
  }

  return cameras.find((item) => isBackCameraLabel(item.label)) ?? cameras[0];
}

export function savePreferredCameraId(cameraId: string | null | undefined) {
  if (typeof window === 'undefined' || !cameraId) {
    return;
  }

  window.localStorage.setItem('pdv:scanner:preferred-camera', cameraId);
}

export function getSavedPreferredCameraId() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem('pdv:scanner:preferred-camera');
}

export async function openPreferredCameraStream(performanceMode: ScannerPerformanceMode = 'default') {
  if (!canUseLiveCamera()) {
    throw new Error(getLiveCameraUnavailableMessage());
  }

  const video = getVideoConstraints(performanceMode);

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        ...video,
        facingMode: { exact: 'environment' }
      },
      audio: false
    },
    {
      video: {
        ...video,
        facingMode: { ideal: 'environment' }
      },
      audio: false
    },
    {
      video,
      audio: false
    }
  ];

  let lastError: unknown = null;

  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];

      if (isBackCameraTrack(track) || !isLikelyMobileDevice()) {
        return stream;
      }

      const backCameraStream = await tryOpenNamedBackCamera(track, video);
      if (backCameraStream) {
        stream.getTracks().forEach((item) => item.stop());
        return backCameraStream;
      }

      return stream;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Nao foi possivel acessar a camera do dispositivo.');
}

async function tryOpenNamedBackCamera(currentTrack: MediaStreamTrack, baseVideoConstraints: ReturnType<typeof getVideoConstraints>) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const currentDeviceId = currentTrack.getSettings().deviceId;
  const backDevice = devices.find(
    (item) =>
      item.kind === 'videoinput' &&
      item.deviceId !== currentDeviceId &&
      /back|rear|environment|traseira|traseiro|world/i.test(item.label.toLowerCase())
  );

  if (!backDevice) {
    return null;
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      ...baseVideoConstraints,
      deviceId: { exact: backDevice.deviceId }
    },
    audio: false
  });
}
