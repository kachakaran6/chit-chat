export interface Message {
  type: 'text' | 'code' | 'file';
  content: string;
  filename?: string;
  language?: string;
  sender: string;
  timestamp: number;
  id: string;
  reactions?: Reaction[];
  read?: boolean;
}

export interface FileMessage extends Message {
  type: 'file';
  fileType: string;
  fileSize: number;
}

export interface Reaction {
  emoji: string;
  user: string;
}

export interface PeerStatus {
  id: string;
  online: boolean;
  typing?: boolean;
  lastSeen?: number;
}