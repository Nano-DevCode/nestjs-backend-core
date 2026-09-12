import type { Socket } from 'socket.io';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';

export interface WsHandshakeAuth {
  token?: string;
  authorization?: string;
  [key: string]: unknown;
}

export interface AuthenticatedSocket extends Socket {
  user?: UserAuthContext;
  data: {
    user?: UserAuthContext;
    [key: string]: unknown;
  };
  handshake: Socket['handshake'] & {
    auth: WsHandshakeAuth;
  };
}
