declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats?: () => Promise<string[]>;
}

interface DetectedBarcode {
  boundingBox: DOMRectReadOnly;
  cornerPoints?: ReadonlyArray<{ x: number; y: number }>;
  format: string;
  rawValue: string;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
