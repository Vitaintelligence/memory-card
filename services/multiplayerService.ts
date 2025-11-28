
export type MessageType = 'JOIN_REQUEST' | 'WELCOME' | 'MOVE' | 'RESTART' | 'QUIT';

export interface NetworkMessage {
  type: MessageType;
  roomId: string;
  senderId?: string; // 'host' or 'guest'
  payload: any;
}

class MultiplayerService {
  private channel: BroadcastChannel;
  private roomId: string | null = null;
  private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;

  constructor() {
    this.channel = new BroadcastChannel('neomatch_game_channel');
    this.channel.onmessage = (event) => {
      const msg = event.data as NetworkMessage;
      // Filter messages for our room
      // If we are hosting and status is waiting, we accept JOIN_REQUEST for our roomId
      if (this.roomId && msg.roomId === this.roomId) {
        this.onMessageCallback?.(msg);
      }
    };
  }

  setRoomId(id: string) {
    this.roomId = id;
  }

  setCallback(cb: (msg: NetworkMessage) => void) {
    this.onMessageCallback = cb;
  }

  send(type: MessageType, payload: any, senderId: string = 'system') {
    if (!this.roomId) return;
    this.channel.postMessage({
      type,
      roomId: this.roomId,
      senderId,
      payload
    });
  }

  // Detect crude region based on timezone
  getRegion(): string {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('America')) return 'NA-EAST';
    if (tz.includes('Europe')) return 'EU-WEST';
    if (tz.includes('Asia')) return 'ASIA-PACIFIC';
    if (tz.includes('Australia')) return 'OCEANIA';
    return 'GLOBAL-RELAY';
  }

  close() {
    this.roomId = null;
    this.onMessageCallback = null;
  }
}

export const multiplayer = new MultiplayerService();
