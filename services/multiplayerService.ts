
// We use the global script tag for PeerJS to avoid ESM bundling issues
declare const Peer: any;

export type MessageType = 
  | 'JOIN_REQUEST' 
  | 'LOBBY_UPDATE' 
  | 'WELCOME' 
  | 'MOVE' 
  | 'RESTART' 
  | 'QUIT' 
  | 'PLAYER_LEFT' 
  | 'DISCOVERY_PING' 
  | 'DISCOVERY_PONG' 
  | 'ROOM_ADVERTISE'
  | 'SPECTATE_REQUEST'
  | 'GAME_SNAPSHOT'
  | 'HEARTBEAT_PING' // New
  | 'HEARTBEAT_PONG'; // New

export interface NetworkMessage {
  type: MessageType;
  roomId?: string; 
  senderId: string;
  payload: any;
}

export interface DiscoveredRoom {
  id: string;
  theme: string;
  hostName: string;
  region: string;
  status: 'OPEN' | 'PLAYING';
  currentPlayers: number; 
  maxPlayers: number;    
  timestamp: number;
}

class MultiplayerService {
  private peer: any | null = null;
  private connections: Map<string, any> = new Map(); // For Host: GuestID -> Connection
  private hostConnection: any | null = null; // For Guest: -> Host
  private roomId: string | null = null;
  private clientId: string;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;
  
  // Local Discovery
  private localChannel: BroadcastChannel;
  private onRoomFound: ((room: DiscoveredRoom) => void) | null = null;

  // Heartbeat
  private heartbeatInterval: any = null;
  public latency: number = 0; // ms

  constructor() {
    const storedId = sessionStorage.getItem('neo_client_id');
    if (storedId) {
        this.clientId = storedId;
    } else {
        this.clientId = 'user_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('neo_client_id', this.clientId);
    }
    
    this.localChannel = new BroadcastChannel('neomatch_local_discovery');
    this.localChannel.onmessage = (e) => this.handleLocalDiscovery(e.data);
  }

  public getClientId() {
      return this.clientId;
  }

  public getLatency() {
      return this.latency;
  }

  public async initializePeer(requestedId?: string): Promise<string> {
      return new Promise((resolve, reject) => {
          if (typeof Peer === 'undefined') {
              reject("PeerJS library not loaded. Check internet connection.");
              return;
          }

          if (this.peer) {
              if (this.peer.id === requestedId) {
                  resolve(this.peer.id);
                  return;
              }
              this.peer.destroy();
          }

          const options: any = {
              debug: 1,
              config: {
                iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:global.stun.twilio.com:3478' }
                ]
              }
          };

          this.peer = new Peer(requestedId || undefined, options);

          this.peer.on('open', (id: string) => {
              console.log('[P2P] Peer Opened:', id);
              this.roomId = id;
              resolve(id);
          });

          this.peer.on('connection', (conn: any) => {
              this.handleIncomingConnection(conn);
          });

          this.peer.on('error', (err: any) => {
              console.error('[P2P] Peer Error:', err);
              if (err.type === 'unavailable-id') {
                  reject('ID_TAKEN');
              } else {
                  reject(err);
              }
          });
      });
  }

  private handleIncomingConnection(conn: any) {
      console.log('[P2P] Incoming connection from:', conn.peer);
      
      conn.on('open', () => {
          this.connections.set(conn.peer, conn);
          console.log('[P2P] Connection established with', conn.peer);
      });

      conn.on('data', (data: any) => {
          if (data.type === 'HEARTBEAT_PING') {
              conn.send({ type: 'HEARTBEAT_PONG', senderId: this.clientId, payload: { ts: data.payload.ts } });
              return;
          }
          if (data.type === 'HEARTBEAT_PONG') {
              const now = Date.now();
              this.latency = Math.floor((now - data.payload.ts) / 2); // One-way approximation
              return;
          }

          if (this.onMessageCallback) {
              this.onMessageCallback(data as NetworkMessage);
          }
      });

      conn.on('close', () => {
          this.connections.delete(conn.peer);
          if (this.onMessageCallback) {
              this.onMessageCallback({
                  type: 'PLAYER_LEFT',
                  senderId: conn.peer,
                  payload: { playerId: conn.peer }
              });
          }
      });
  }

  // === HOST FUNCTIONS ===

  public async createRoom(shortCode: string): Promise<boolean> {
      try {
          const fullId = `NEO-${shortCode}`;
          await this.initializePeer(fullId);
          this.startHeartbeat();
          return true;
      } catch (e) {
          if (e === 'ID_TAKEN') return false;
          throw e;
      }
  }

  // === GUEST FUNCTIONS ===

  public async connectToRoom(hostId: string): Promise<void> {
      if (!hostId.startsWith('NEO-')) hostId = `NEO-${hostId}`;
      
      if (!this.peer || this.peer.id.startsWith('NEO-')) {
          await this.initializePeer(); 
      }

      console.log('[P2P] Connecting to host:', hostId);
      const conn = this.peer!.connect(hostId, { reliable: true });

      return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
              conn.close();
              reject('TIMEOUT');
          }, 8000); // 8s timeout

          conn.on('open', () => {
              clearTimeout(timeout);
              this.hostConnection = conn;
              this.startHeartbeat();
              console.log('[P2P] Connected to Host');
              
              conn.on('data', (data: any) => {
                  if (data.type === 'HEARTBEAT_PING') {
                      conn.send({ type: 'HEARTBEAT_PONG', senderId: this.clientId, payload: { ts: data.payload.ts } });
                      return;
                  }
                  if (data.type === 'HEARTBEAT_PONG') {
                      const now = Date.now();
                      this.latency = Math.floor((now - data.payload.ts) / 2);
                      return;
                  }

                  if (this.onMessageCallback) {
                      this.onMessageCallback(data as NetworkMessage);
                  }
              });

              conn.on('close', () => {
                  console.warn('[P2P] Host disconnected');
                  this.hostConnection = null;
                  this.stopHeartbeat();
                  if (this.onMessageCallback) {
                      this.onMessageCallback({
                          type: 'QUIT',
                          senderId: 'HOST',
                          payload: {}
                      });
                  }
              });

              resolve();
          });

          conn.on('error', (err: any) => {
              clearTimeout(timeout);
              reject(err);
          });
      });
  }

  // === MESSAGING ===

  public send(type: MessageType, payload: any) {
      const msg: NetworkMessage = {
          type,
          senderId: this.peer?.id || this.clientId,
          roomId: this.roomId || '',
          payload
      };

      if (this.connections.size > 0) {
          this.connections.forEach(conn => {
              if (conn.open) conn.send(msg);
          });
      }

      if (this.hostConnection && this.hostConnection.open) {
          this.hostConnection.send(msg);
      }
  }

  public setListener(cb: (msg: NetworkMessage) => void) {
      this.onMessageCallback = cb;
  }

  public leaveRoom() {
      this.stopHeartbeat();
      this.connections.forEach(c => c.close());
      this.connections.clear();
      if (this.hostConnection) {
          this.hostConnection.close();
          this.hostConnection = null;
      }
      if (this.peer) {
          this.peer.destroy();
          this.peer = null;
      }
      this.roomId = null;
      this.stopAdvertising();
  }

  // === HEARTBEAT ===

  private startHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      
      this.heartbeatInterval = setInterval(() => {
          const pingMsg = { type: 'HEARTBEAT_PING', senderId: this.clientId, payload: { ts: Date.now() } };
          
          if (this.hostConnection && this.hostConnection.open) {
              this.hostConnection.send(pingMsg);
          }
          
          this.connections.forEach(conn => {
              if (conn.open) conn.send(pingMsg);
          });
      }, 2000); // Ping every 2 seconds
  }

  private stopHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
  }

  // === DISCOVERY ===

  public startAdvertising(roomId: string, theme: string, hostName: string, status: 'OPEN' | 'PLAYING', currentPlayers: number, maxPlayers: number) {
      const displayId = roomId.replace('NEO-', '');
      const msg = {
          type: 'ROOM_ADVERTISE',
          payload: { 
              roomId: displayId, 
              theme, 
              hostName, 
              status, 
              currentPlayers, 
              maxPlayers,
              region: this.getRegion()
          }
      };
      this.localChannel.postMessage(msg);
  }

  public stopAdvertising() {}

  public startDiscovery(onRoom: (room: DiscoveredRoom) => void, onStats: (c: number) => void) {
      this.onRoomFound = onRoom;
      const query = () => {
          this.localChannel.postMessage({ type: 'DISCOVERY_PING' });
      };
      query();
      setTimeout(query, 1000); // Retry once
  }

  private handleLocalDiscovery(data: any) {
      if (data.type === 'ROOM_ADVERTISE') {
          if (this.onRoomFound) {
              this.onRoomFound({
                  id: data.payload.roomId,
                  theme: data.payload.theme,
                  hostName: data.payload.hostName,
                  region: data.payload.region,
                  status: data.payload.status,
                  currentPlayers: data.payload.currentPlayers,
                  maxPlayers: data.payload.maxPlayers,
                  timestamp: Date.now()
              });
          }
      }
  }

  public getRegion(): string {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.includes('America')) return 'NA-EAST';
      if (tz.includes('Europe')) return 'EU-WEST';
      if (tz.includes('Asia')) return 'ASIA-PACIFIC';
      return 'GLOBAL';
  }
}

export const multiplayer = new MultiplayerService();
