import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class InvoiceGateway implements OnGatewayInit {
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(InvoiceGateway.name);

  afterInit() {
    this.logger.log('InvoiceGateway initialized');
  }

  emitAuthorized(invoiceId: string, payload: {
    invoiceId: string;
    secuencial: string;
    numeroAutorizacion: string;
    fechaAutorizacion: string;
    importeTotal: number;
    status: string;
  }) {
    this.server.emit(`invoice:${invoiceId}`, { event: 'authorized', ...payload });
  }

  emitRejected(invoiceId: string, payload: {
    invoiceId: string;
    secuencial: string;
    status: string;
    errors: string;
  }) {
    this.server.emit(`invoice:${invoiceId}`, { event: 'rejected', ...payload });
  }
}
