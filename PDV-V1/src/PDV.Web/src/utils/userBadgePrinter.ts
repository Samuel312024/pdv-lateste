import QRCode from 'qrcode';
import type { Usuario } from '../types';

const code39Patterns: Record<string, string> = {
  '0': 'NNNWWNWNN',
  '1': 'WNNWNNNNW',
  '2': 'NNWWNNNNW',
  '3': 'WNWWNNNNN',
  '4': 'NNNWWNNNW',
  '5': 'WNNWWNNNN',
  '6': 'NNWWWNNNN',
  '7': 'NNNWNNWNW',
  '8': 'WNNWNNWNN',
  '9': 'NNWWNNWNN',
  A: 'WNNNNWNNW',
  B: 'NNWNNWNNW',
  C: 'WNWNNWNNN',
  D: 'NNNNWWNNW',
  E: 'WNNNWWNNN',
  F: 'NNWNWWNNN',
  G: 'NNNNNWWNW',
  H: 'WNNNNWWNN',
  I: 'NNWNNWWNN',
  J: 'NNNNWWWNN',
  K: 'WNNNNNNWW',
  L: 'NNWNNNNWW',
  M: 'WNWNNNNWN',
  N: 'NNNNWNNWW',
  O: 'WNNNWNNWN',
  P: 'NNWNWNNWN',
  Q: 'NNNNNNWWW',
  R: 'WNNNNNWWN',
  S: 'NNWNNNWWN',
  T: 'NNNNWNWWN',
  U: 'WWNNNNNNW',
  V: 'NWWNNNNNW',
  W: 'WWWNNNNNN',
  X: 'NWNNWNNNW',
  Y: 'WWNNWNNNN',
  Z: 'NWWNWNNNN',
  '-': 'NWNNNNWNW',
  '.': 'WWNNNNWNN',
  ' ': 'NWWNNNWNN',
  '$': 'NWNWNWNNN',
  '/': 'NWNWNNNWN',
  '+': 'NWNNNWNWN',
  '%': 'NNNWNWNWN',
  '*': 'NWNNWNWNN'
};

const code39SupportedPattern = /^[0-9A-Z.\- $/+%]+$/;

interface PrintUserBadgeOptions {
  autoPrint?: boolean;
  companyName?: string | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short'
  }).format(new Date(value));
}

function buildInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return letters || 'PDV';
}

function normalizeCode39Value(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.includes('*') || !code39SupportedPattern.test(normalized)) {
    return null;
  }

  return normalized;
}

export function buildCode39BarcodeSvg(value: string) {
  const normalized = normalizeCode39Value(value);
  if (!normalized) {
    return null;
  }

  const encodedValue = `*${normalized}*`;
  const narrowWidth = 3;
  const wideWidth = 8;
  const gapWidth = 3;
  const quietZone = 14;
  const barHeight = 86;
  let cursorX = quietZone;
  const rects: string[] = [];

  for (let charIndex = 0; charIndex < encodedValue.length; charIndex += 1) {
    const pattern = code39Patterns[encodedValue[charIndex]];
    if (!pattern) {
      return null;
    }

    for (let elementIndex = 0; elementIndex < pattern.length; elementIndex += 1) {
      const width = pattern[elementIndex] === 'W' ? wideWidth : narrowWidth;
      const isBar = elementIndex % 2 === 0;

      if (isBar) {
        rects.push(`<rect x="${cursorX}" y="0" width="${width}" height="${barHeight}" rx="0.4" ry="0.4" />`);
      }

      cursorX += width;
    }

    if (charIndex < encodedValue.length - 1) {
      cursorX += gapWidth;
    }
  }

  const totalWidth = cursorX + quietZone;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${barHeight}" preserveAspectRatio="none" aria-label="Codigo de barras do cracha">
      <rect width="${totalWidth}" height="${barHeight}" fill="#ffffff" />
      <g fill="#0f172a">
        ${rects.join('')}
      </g>
    </svg>
  `.trim();
}

export function buildBadgeQrCodeDataUrl(value: string, width = 360): Promise<string> {
  return QRCode.toDataURL(value, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });
}

function openPrintFrame(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentWindow?.document;
  if (!frameDocument) {
    document.body.removeChild(iframe);
    throw new Error('Nao foi possivel abrir a impressao do cracha.');
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  const cleanup = () => {
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1500);
  };

  iframe.onload = cleanup;
}

export async function printUserBadge(user: Usuario, options: PrintUserBadgeOptions = {}) {
  const badgeCode = user.codigoBarrasCracha?.trim();
  if (!badgeCode) {
    throw new Error('O usuario precisa ter um codigo de cracha para imprimir.');
  }

  const companyName = options.companyName?.trim() || user.empresaNomeExibicao || 'PDV Control Hub';
  const qrCodeDataUrl = await buildBadgeQrCodeDataUrl(badgeCode);
  const barcodeSvg = buildCode39BarcodeSvg(badgeCode);
  const requiresQrFallback = !barcodeSvg;
  const issueDate = formatDate(user.dataCadastro);
  const initials = buildInitials(user.nome);
  const autoPrint = options.autoPrint ?? true;

  const badgeHtml = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Cracha ${escapeHtml(user.nome)}</title>
        <style>
          :root {
            color-scheme: light;
            --navy: #0f172a;
            --blue: #1d4ed8;
            --sky: #dbeafe;
            --ink: #111827;
            --muted: #475569;
            --line: rgba(15, 23, 42, 0.12);
            --paper: #ffffff;
            --soft: #eff6ff;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: Inter, Arial, Helvetica, sans-serif;
            background: #e2e8f0;
            color: var(--ink);
            padding: 12mm;
          }
          .sheet {
            width: fit-content;
            margin: 0 auto;
          }
          .sheet-header {
            margin-bottom: 8mm;
            text-align: center;
          }
          .sheet-header h1 {
            margin: 0;
            font-size: 20px;
          }
          .sheet-header p {
            margin: 6px 0 0;
            color: var(--muted);
            font-size: 12px;
          }
          .badge-grid {
            display: grid;
            grid-template-columns: repeat(2, 85.6mm);
            gap: 10mm;
            align-items: start;
          }
          .badge {
            width: 85.6mm;
            height: 54mm;
            border-radius: 18px;
            overflow: hidden;
            background: var(--paper);
            border: 1px solid rgba(15, 23, 42, 0.08);
            box-shadow: 0 24px 50px rgba(15, 23, 42, 0.16);
            position: relative;
          }
          .badge::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: 18px;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.24);
          }
          .front {
            background:
              radial-gradient(circle at top right, rgba(59, 130, 246, 0.3), transparent 34%),
              linear-gradient(145deg, #0f172a 0%, #172554 52%, #1d4ed8 100%);
            color: #fff;
            padding: 6mm;
            display: grid;
            grid-template-rows: auto 1fr auto;
            row-gap: 3.4mm;
          }
          .front-top {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            align-items: flex-start;
          }
          .company-label {
            font-size: 11px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            opacity: 0.82;
          }
          .company-name {
            margin-top: 1.2mm;
            font-size: 16px;
            font-weight: 800;
            line-height: 1.05;
            max-width: 43mm;
          }
          .subtitle {
            margin-top: 1.4mm;
            font-size: 10px;
            opacity: 0.9;
            max-width: 41mm;
          }
          .avatar {
            width: 15mm;
            height: 15mm;
            border-radius: 50%;
            display: grid;
            place-items: center;
            font-weight: 800;
            font-size: 16px;
            background: rgba(255, 255, 255, 0.16);
            border: 1px solid rgba(255, 255, 255, 0.25);
            flex: 0 0 auto;
          }
          .front-main {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 18mm;
            gap: 3mm;
            align-items: start;
            min-height: 0;
          }
          .front-main > div:first-child {
            min-width: 0;
          }
          .person-name {
            font-size: 15px;
            font-weight: 900;
            line-height: 1.04;
          }
          .person-role {
            margin-top: 1.4mm;
            display: inline-flex;
            max-width: 100%;
            padding: 1.1mm 2.4mm;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.16);
            font-size: 8.8px;
            font-weight: 700;
            letter-spacing: 0.03em;
          }
          .meta {
            margin-top: 2.6mm;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.4mm 2.2mm;
            font-size: 8.5px;
          }
          .meta > div {
            min-width: 0;
          }
          .meta-label {
            opacity: 0.72;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 7.4px;
          }
          .meta-value {
            display: block;
            margin-top: 0.5mm;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .qr-wrap {
            width: 18mm;
            background: #fff;
            border-radius: 9px;
            padding: 1.2mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.6mm;
            justify-self: end;
            align-self: end;
          }
          .qr-wrap img {
            display: block;
            width: 100%;
            aspect-ratio: 1 / 1;
            height: auto;
            object-fit: contain;
          }
          .qr-caption {
            color: var(--navy);
            font-size: 6px;
            font-weight: 800;
            letter-spacing: 0.09em;
            text-transform: uppercase;
          }
          .front-footer {
            display: flex;
            justify-content: space-between;
            gap: 3mm;
            align-items: end;
            padding-top: 2.2mm;
            border-top: 1px solid rgba(255, 255, 255, 0.18);
          }
          .badge-code-label {
            font-size: 8px;
            opacity: 0.72;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .badge-code-value {
            margin-top: 0.8mm;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.06em;
          }
          .back {
            padding: 6.5mm;
            background:
              radial-gradient(circle at top left, rgba(191, 219, 254, 0.6), transparent 30%),
              linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          }
          .back-header {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            align-items: center;
          }
          .back-title {
            font-size: 15px;
            font-weight: 900;
            color: var(--navy);
          }
          .back-subtitle {
            margin-top: 1mm;
            font-size: 9px;
            color: var(--muted);
          }
          .status-pill {
            padding: 1.2mm 3mm;
            border-radius: 999px;
            background: #dbeafe;
            color: #1d4ed8;
            font-size: 8px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .barcode-block {
            margin-top: 5mm;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #fff;
            padding: 4mm 4mm 3mm;
          }
          .barcode-block svg {
            width: 100%;
            height: 18mm;
            display: block;
          }
          .barcode-text {
            margin-top: 2mm;
            text-align: center;
            font-size: 12px;
            letter-spacing: 0.18em;
            font-weight: 900;
            color: var(--navy);
          }
          .warning {
            margin-top: 5mm;
            border-radius: 12px;
            padding: 3.5mm 4mm;
            background: #fff7ed;
            color: #9a3412;
            border: 1px solid rgba(249, 115, 22, 0.18);
            font-size: 9px;
            line-height: 1.35;
          }
          .back-info {
            margin-top: 4mm;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2.4mm 4mm;
          }
          .back-card {
            border-radius: 10px;
            background: rgba(255,255,255,0.88);
            border: 1px solid var(--line);
            padding: 2.6mm 3mm;
          }
          .back-card strong {
            display: block;
            font-size: 8px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 1mm;
          }
          .back-card span {
            display: block;
            font-size: 10px;
            font-weight: 700;
            color: var(--ink);
            line-height: 1.25;
          }
          .back-footer {
            margin-top: 4mm;
            font-size: 8px;
            color: var(--muted);
            line-height: 1.35;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          @media print {
            body {
              background: #fff;
              padding: 0;
            }
            .sheet-header {
              display: none;
            }
            .badge {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="sheet-header">
            <h1>Cracha operacional</h1>
            <p>Frente e verso prontos para impressao e identificacao do colaborador.</p>
          </div>

          <div class="badge-grid">
            <section class="badge front" aria-label="Frente do cracha">
              <div class="front-top">
                <div>
                  <div class="company-label">Cracha profissional</div>
                  <div class="company-name">${escapeHtml(companyName)}</div>
                  <div class="subtitle">Identificacao operacional para acesso ao PDV</div>
                </div>
                <div class="avatar">${escapeHtml(initials)}</div>
              </div>

              <div class="front-main">
                <div>
                  <div class="person-name">${escapeHtml(user.nome)}</div>
                  <div class="person-role">${escapeHtml(user.perfilNome)}</div>

                  <div class="meta">
                    <div>
                      <div class="meta-label">Status</div>
                      <div class="meta-value">${user.ativo ? 'Ativo' : 'Inativo'}</div>
                    </div>
                    <div>
                      <div class="meta-label">Emissao</div>
                      <div class="meta-value">${escapeHtml(issueDate)}</div>
                    </div>
                  </div>
                </div>

                <div class="qr-wrap">
                  <img src="${qrCodeDataUrl}" alt="QR Code do cracha ${escapeHtml(user.nome)}" />
                  <div class="qr-caption">QR operacional</div>
                </div>
              </div>

              <div class="front-footer">
                <div>
                  <div class="badge-code-label">Codigo do cracha</div>
                  <div class="badge-code-value">${escapeHtml(badgeCode)}</div>
                </div>
                <div class="badge-code-label">Frente</div>
              </div>
            </section>

            <section class="badge back" aria-label="Verso do cracha">
              <div class="back-header">
                <div>
                  <div class="back-title">Acesso por cracha e senha</div>
                  <div class="back-subtitle">Use este codigo no leitor do caixa ou no scanner USB/Bluetooth.</div>
                </div>
                <div class="status-pill">Verso</div>
              </div>

              ${
                barcodeSvg
                  ? `
                    <div class="barcode-block">
                      ${barcodeSvg}
                      <div class="barcode-text">${escapeHtml(badgeCode)}</div>
                    </div>
                  `
                  : ''
              }

              ${
                requiresQrFallback
                  ? `
                    <div class="warning">
                      O codigo informado nao usa apenas o conjunto padrao do Code 39. O cracha segue com QR Code funcional na frente e com o codigo textual abaixo para digitacao ou leitura por equipamento 2D.
                    </div>
                  `
                  : ''
              }

              <div class="back-info">
                <div class="back-card">
                  <strong>Colaborador</strong>
                  <span>${escapeHtml(user.nome)}</span>
                </div>
                <div class="back-card">
                  <strong>Perfil</strong>
                  <span>${escapeHtml(user.perfilNome)}</span>
                </div>
                <div class="back-card">
                  <strong>Codigo</strong>
                  <span>${escapeHtml(badgeCode)}</span>
                </div>
                <div class="back-card">
                  <strong>Empresa</strong>
                  <span>${escapeHtml(companyName)}</span>
                </div>
              </div>

              <div class="back-footer">
                Apresente este cracha no acesso operacional do PDV. A autenticacao continua protegida por senha individual do usuario.
              </div>
            </section>
          </div>
        </div>

        ${
          autoPrint
            ? `
              <script>
                window.addEventListener('load', function () {
                  setTimeout(function () {
                    window.print();
                  }, 180);
                });
              </script>
            `
            : ''
        }
      </body>
    </html>
  `;

  openPrintFrame(badgeHtml);
}
