import type { LoginResponse, Venda } from '../types';
import { formatPaymentMethod } from './paymentMethods';

interface ReceiptPrintOptions {
  paperWidth?: '58mm' | '80mm';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function printSaleReceipt(sale: Venda, session: LoginResponse | null, options?: ReceiptPrintOptions) {
  const totalInformado = sale.pagamentos.reduce((sum, payment) => sum + payment.valorPago, 0);
  const trocoTotal = sale.pagamentos.reduce((sum, payment) => sum + payment.troco, 0);
  const totalLiquido = totalInformado - trocoTotal;
  const paperWidth = options?.paperWidth === '58mm' ? '58mm' : '80mm';
  const compactMode = paperWidth === '58mm';

  const receiptHtml = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Comprovante ${escapeHtml(sale.numeroVenda)}</title>
        <style>
          body {
            font-family: Consolas, 'Courier New', monospace;
            margin: 0;
            padding: ${compactMode ? 8 : 16}px;
            color: #111;
          }
          .receipt {
            width: ${paperWidth};
            margin: 0 auto;
          }
          h1, h2, p {
            margin: 0;
          }
          .header, .footer {
            text-align: center;
          }
          .section {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px dashed #000;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            font-size: ${compactMode ? 11 : 12}px;
            margin-top: 4px;
          }
          .item-name {
            font-weight: 700;
          }
          .muted {
            color: #555;
            font-size: ${compactMode ? 10 : 11}px;
          }
          .strong {
            font-weight: 700;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>PDV Control Hub</h1>
            <p class="muted">Comprovante simples</p>
            <p class="muted">${escapeHtml(sale.numeroVenda)} · ${escapeHtml(formatDateTime(sale.dataVenda))}</p>
          </div>

          <div class="section">
            <div class="row"><span>Operador</span><span>${escapeHtml(session?.usuario.nome ?? 'Sistema')}</span></div>
            <div class="row"><span>Cliente</span><span>${escapeHtml(sale.clienteNome ?? (sale.clienteId ? 'Cliente vinculado' : 'Consumidor final'))}</span></div>
            <div class="row"><span>Status</span><span>${escapeHtml(sale.status)}</span></div>
          </div>

          <div class="section">
            ${sale.itens
              .map(
                (item) => `
                  <div class="row item-name"><span>${escapeHtml(item.produtoNome)}</span><span>${formatCurrency(item.total)}</span></div>
                  <div class="row muted"><span>${item.quantidade.toFixed(3)} x ${formatCurrency(item.valorUnitario)}</span><span>Desc. ${formatCurrency(item.desconto)}</span></div>
                `
              )
              .join('')}
          </div>

          <div class="section">
            <div class="row"><span>Subtotal</span><span>${formatCurrency(sale.subtotal)}</span></div>
            <div class="row"><span>Descontos</span><span>${formatCurrency(sale.descontoTotal)}</span></div>
            <div class="row strong"><span>Total</span><span>${formatCurrency(sale.total)}</span></div>
          </div>

          <div class="section">
            ${sale.pagamentos
              .map(
                (payment) => `
                  <div class="row"><span>${escapeHtml(formatPaymentMethod(payment.formaPagamento))}</span><span>${formatCurrency(payment.valorPago)}</span></div>
                  ${
                    payment.statusTransacao === 'Simulada' || payment.capturaModo !== 'ManualAssistido'
                      ? `<div class="row muted"><span>Processamento</span><span>${escapeHtml(formatPaymentCapture(payment))}</span></div>`
                      : ''
                  }
                  ${
                    payment.referenciaTransacao
                      ? `<div class="row muted"><span>Referencia</span><span>${escapeHtml(payment.referenciaTransacao)}</span></div>`
                      : ''
                  }
                  ${
                    payment.codigoAutorizacao
                      ? `<div class="row muted"><span>Autorizacao</span><span>${escapeHtml(payment.codigoAutorizacao)}</span></div>`
                      : ''
                  }
                  ${
                    payment.bandeiraCartao || payment.ultimosDigitosCartao || payment.parcelas
                      ? `<div class="row muted"><span>Detalhes</span><span>${escapeHtml(buildPaymentDetailLine(payment))}</span></div>`
                      : ''
                  }
                  ${payment.troco > 0 ? `<div class="row muted"><span>Troco</span><span>${formatCurrency(payment.troco)}</span></div>` : ''}
                `
              )
              .join('')}
          </div>

          <div class="section">
            <div class="row"><span>Total informado</span><span>${formatCurrency(totalInformado)}</span></div>
            <div class="row"><span>Troco total</span><span>${formatCurrency(trocoTotal)}</span></div>
            <div class="row strong"><span>Total liquido</span><span>${formatCurrency(totalLiquido)}</span></div>
          </div>

          <div class="section footer">
            <p>Obrigado pela preferencia.</p>
          </div>
        </div>
        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.print();
            }, 150);
          });
        </script>
      </body>
    </html>
  `;

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
    throw new Error('Nao foi possivel abrir a impressao do comprovante.');
  }

  frameDocument.open();
  frameDocument.write(receiptHtml);
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

function formatPaymentCapture(payment: Venda['pagamentos'][number]) {
  if (payment.statusTransacao === 'Simulada') {
    return 'Simulado';
  }

  return payment.capturaModo === 'ManualAssistido'
    ? 'Manual assistido'
    : payment.capturaModo;
}

function buildPaymentDetailLine(payment: Venda['pagamentos'][number]) {
  const parts = [
    payment.bandeiraCartao,
    payment.ultimosDigitosCartao ? `final ${payment.ultimosDigitosCartao}` : null,
    payment.parcelas && payment.parcelas > 1 ? `${payment.parcelas}x` : null
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : 'Sem complemento';
}
