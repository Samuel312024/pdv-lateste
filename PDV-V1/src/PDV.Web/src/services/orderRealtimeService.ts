import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { PedidoRealtimeEvento } from '../types';

type OrderChannel = 'empresa' | 'cliente' | 'entregador';

type Listener = (event: PedidoRealtimeEvento) => void;

class OrderRealtimeService {
  private connection: HubConnection | null = null;
  private tokenFactory: () => string | null = () => null;
  private listeners = new Set<Listener>();
  private activeChannel: OrderChannel | null = null;

  setTokenFactory(factory: () => string | null) {
    this.tokenFactory = factory;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(channel: OrderChannel) {
    if (this.connection && this.activeChannel === channel &&
      (this.connection.state === HubConnectionState.Connected ||
        this.connection.state === HubConnectionState.Connecting ||
        this.connection.state === HubConnectionState.Reconnecting)) {
      return;
    }

    await this.disconnect();

    const connection = new HubConnectionBuilder()
      .withUrl(buildHubUrl(), {
        accessTokenFactory: () => this.tokenFactory() ?? ''
      })
      .withAutomaticReconnect([0, 1000, 3000, 6000])
      .configureLogging(LogLevel.Warning)
      .build();

    connection.on('PedidoAtualizado', (event: PedidoRealtimeEvento) => {
      for (const listener of this.listeners) {
        listener(event);
      }
    });

    await connection.start();
    await connection.invoke(
      channel === 'empresa'
        ? 'EntrarPainelEmpresa'
        : channel === 'entregador'
          ? 'EntrarMinhasEntregas'
          : 'EntrarMeusPedidos'
    );

    this.connection = connection;
    this.activeChannel = channel;
  }

  async disconnect() {
    if (!this.connection) {
      this.activeChannel = null;
      return;
    }

    const connection = this.connection;
    this.connection = null;
    this.activeChannel = null;
    await connection.stop();
  }
}

function buildHubUrl() {
  const baseUrl = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/api\/?$/, '');
  return `${baseUrl}/hubs/pedidos`;
}

export const orderRealtimeService = new OrderRealtimeService();
