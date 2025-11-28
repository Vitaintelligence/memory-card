

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
  | 'GAME_SNAPSHOT';

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
  private channel: BroadcastChannel;
  private roomId: string | null = null;
  private clientId: string;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;
  
  // Discovery Listeners
  private onRoomFound: ((room: DiscoveredRoom) => void) | null = null;
  private onStatsUpdate: ((count: number) => void) | null = null;

  // State
  private peers: Set<string> = new Set();
  private rooms: Map<string, DiscoveredRoom> = new Map();
  private advertiseInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Generate a persistent ID for this session
    const storedId = sessionStorage.getItem('neo_client_id');
    if (storedId) {
        this.clientId = storedId;
    } else {
        this.clientId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem('neo_client_id', this.clientId);
    }

    this.channel = new BroadcastChannel('neomatch_game_channel');
    
    this.channel.onmessage = (event) => {
      const msg = event.data as NetworkMessage;
      this.handleInternalMessage(msg);
    };

    // Auto-reply to pings
    this.startHeartbeatListener();
  }

  public getClientId() {
      return this.clientId;
  }

  private handleInternalMessage(msg: NetworkMessage) {
    // Ignore my own messages
    if (msg.senderId === this.clientId) return;

    // 1. Discovery Logic
    if (msg.type === 'DISCOVERY_PING') {
        this.peers.add(msg.senderId);
        this.broadcastPong(); 
        this.notifyStats();
    }
    else if (msg.type === 'DISCOVERY_PONG') {
        this.peers.add(msg.senderId);
        this.notifyStats();
    }
    else if (msg.type === 'ROOM_ADVERTISE') {
        if (msg.payload.region === this.getRegion()) {
            const room: DiscoveredRoom = {
                id: msg.payload.roomId,
                theme: msg.payload.theme,
                hostName: msg.payload.hostName,
                region: msg.payload.region,
                status: msg.payload.status || 'OPEN',
                currentPlayers: msg.payload.currentPlayers || 1,
                maxPlayers: msg.payload.maxPlayers || 2,
                timestamp: Date.now()
            };
            this.rooms.set(room.id, room);
            if (this.onRoomFound) this.onRoomFound(room);
        }
    }

    // 2. Game Logic
    if (this.roomId && msg.roomId === this.roomId) {
        if (this.onMessageCallback) {
            this.onMessageCallback(msg);
        }
    }
  }

  private broadcastPong() {
    this.channel.postMessage({
        type: 'DISCOVERY_PONG',
        senderId: this.clientId,
        payload: { region: this.getRegion() }
    } as NetworkMessage);
  }

  private notifyStats() {
      if (this.onStatsUpdate) {
          this.onStatsUpdate(this.peers.size + 1);
      }
  }

  startDiscovery(
      onRoom: (room: DiscoveredRoom) => void, 
      onStats: (count: number) => void
  ) {
      this.onRoomFound = onRoom;
      this.onStatsUpdate = onStats;
      this.rooms.clear();
      this.peers.clear();
      
      this.channel.postMessage({
          type: 'DISCOVERY_PING',
          senderId: this.clientId,
          payload: { region: this.getRegion() }
      } as NetworkMessage);
  }

  startAdvertising(roomId: string, theme: string, hostName: string, status: 'OPEN' | 'PLAYING', currentPlayers: number, maxPlayers: number) {
      this.stopAdvertising(); 
      const advertise = () => {
          this.channel.postMessage({
              type: 'ROOM_ADVERTISE',
              senderId: this.clientId,
              payload: { 
                  roomId, 
                  theme, 
                  hostName, 
                  status,
                  currentPlayers,
                  maxPlayers,
                  region: this.getRegion() 
              }
          } as NetworkMessage);
      };
      advertise(); 
      this.advertiseInterval = setInterval(advertise, 2000);
  }

  stopAdvertising() {
      if (this.advertiseInterval) {
          clearInterval(this.advertiseInterval);
          this.advertiseInterval = null;
      }
  }

  joinRoom(id: string) {
    this.roomId = id;
    this.stopAdvertising(); 
    console.log(`[Multiplayer] Joined room: ${id} as ${this.clientId}`);
  }

  setListener(cb: (msg: NetworkMessage) => void) {
    this.onMessageCallback = cb;
  }

  removeListener() {
    this.onMessageCallback = null;
  }

  send(type: MessageType, payload: any) {
    if (!this.roomId) return;
    const msg: NetworkMessage = {
      type,
      roomId: this.roomId,
      senderId: this.clientId,
      payload
    };
    this.channel.postMessage(msg);
  }

  getRegion(): string {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('America')) return 'NA-EAST';
    if (tz.includes('Europe')) return 'EU-WEST';
    if (tz.includes('Asia')) return 'ASIA-PACIFIC';
    if (tz.includes('Australia')) return 'OCEANIA';
    return 'GLOBAL-RELAY';
  }

  leaveRoom() {
    this.stopAdvertising();
    this.roomId = null;
    this.onMessageCallback = null;
    // We intentionally do not clear discovery listeners/peers here so the lobby remains populated
  }
  
  startHeartbeatListener() {
     // Always listen for pings
  }
}

export const multiplayer = new MultiplayerService();