import * as app from 'application';
import { AudioPlayer, MediaTrack, Playlist, PlaybackEvent, PlaybackEventListener } from './types';

export * from './types';

export abstract class CommonAudioPlayer implements AudioPlayer {
  
  public android: any;
  public ios: any;
  public message: string;
  public playlist: Playlist;
  protected _queuedSeekTo: number = null;
  protected _listener: PlaybackEventListener;

  constructor(playlist: Playlist) {
    this.playlist = playlist;
    this._log("CommonAudioPlayer created with playlist.length: "+ playlist.tracks.length);
    this.message = `Your plugin is working on ${app.android ? 'Android' : 'iOS'}.`;
  }

  public abstract addToPlaylist(track: MediaTrack);
  public abstract play();
  public abstract pause();
  public abstract stop();
  public abstract isPlaying(): boolean;
  public abstract skipToNext();
  public abstract skipToPrevious();
  public abstract skipToPlaylistIndex(playlistIndex: number): void;
  public abstract setRate(rate: number);
  public abstract getRate(): number;
  public abstract getDuration(): number;
  public abstract getCurrentTime(): number;
  public abstract getCurrentPlaylistIndex(): number;
  public abstract seekTo(offset: number);
  public abstract release();

  public skipToPlaylistIndexAndOffset(playlistIndex: number, offset: number): void {
    if (this.getCurrentPlaylistIndex() === playlistIndex) {
      this.seekTo(offset);
    } else {
      if (offset > 0) {
        this._log(`Set queuedSeek to ${offset}`);
        this._queuedSeekTo = offset;
      }
      this.skipToPlaylistIndex(playlistIndex);
    }
  }

  public seekRelative(relativeOffset: number): void {
    this.seekTo(Math.max(this.getCurrentTime() + relativeOffset, 0));
  }

  public setPlaybackEventListener(listener: PlaybackEventListener) {
    this._listener = listener;
  }

  public _promiseForPlaybackEvent(evt: PlaybackEvent): Promise<PlaybackEvent> {
    return new Promise<PlaybackEvent>((resolve, reject) => {

    });
  }

  protected _onPlaybackEvent(evt: PlaybackEvent) {
    if (this._listener) this._listener.onPlaybackEvent(evt);
  }
  
  protected _log(...args: any[]) {
    let platform = this.ios ? 'iOS' : 'Android';
    console.log(`tns-audioplayer(${platform}): `, ...args);
  }
}
