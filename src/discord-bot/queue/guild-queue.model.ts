export interface AudioTrackRequester {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface AudioTrackInfo {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number; // ms
  isStream: boolean;
  position: number;
  title: string;
  uri?: string;
  artworkUrl?: string;
  isrc?: string | null;
  sourceName: string;
}

export interface AudioTrack {
  encoded: string;
  info: AudioTrackInfo;
  requester: AudioTrackRequester;
  fallbackAttempted?: boolean;
}

export type RepeatMode = 'off' | 'track' | 'queue';

export class GuildQueue {
  public readonly guildId: string;
  public textChannelId: string;
  public voiceChannelId: string;
  public currentTrack: AudioTrack | null = null;
  public tracks: AudioTrack[] = [];
  public history: AudioTrack[] = [];
  public volume: number = 100;
  public isPaused: boolean = false;
  public repeatMode: RepeatMode = 'off';
  public lastPlaybackPosition: number = 0;

  constructor(guildId: string, textChannelId: string, voiceChannelId: string) {
    this.guildId = guildId;
    this.textChannelId = textChannelId;
    this.voiceChannelId = voiceChannelId;
  }

  addTrack(track: AudioTrack) {
    this.tracks.push(track);
  }

  addTracks(tracks: AudioTrack[]) {
    this.tracks.push(...tracks);
  }

  getNextTrack(): AudioTrack | null {
    if (this.repeatMode === 'track' && this.currentTrack) {
      return this.currentTrack;
    }

    if (this.repeatMode === 'queue' && this.currentTrack) {
      this.tracks.push(this.currentTrack);
    }

    if (this.currentTrack && this.repeatMode === 'off') {
      this.history.unshift(this.currentTrack);
      if (this.history.length > 50) this.history.pop();
    }

    const next = this.tracks.shift() || null;
    this.currentTrack = next;
    this.lastPlaybackPosition = 0;
    return next;
  }

  getPreviousTrack(): AudioTrack | null {
    if (this.history.length === 0) return null;
    if (this.currentTrack) {
      this.tracks.unshift(this.currentTrack);
    }
    const previous = this.history.shift() || null;
    this.currentTrack = previous;
    this.lastPlaybackPosition = 0;
    return previous;
  }

  removeTrack(index: number): AudioTrack | null {
    if (index < 0 || index >= this.tracks.length) return null;
    const [removed] = this.tracks.splice(index, 1);
    return removed || null;
  }

  clearQueue(): number {
    const count = this.tracks.length;
    this.tracks = [];
    return count;
  }

  toJSON() {
    return {
      guildId: this.guildId,
      textChannelId: this.textChannelId,
      voiceChannelId: this.voiceChannelId,
      currentTrack: this.currentTrack,
      queueLength: this.tracks.length,
      tracks: this.tracks,
      historyLength: this.history.length,
      volume: this.volume,
      isPaused: this.isPaused,
      repeatMode: this.repeatMode,
      position: this.lastPlaybackPosition,
    };
  }
}
