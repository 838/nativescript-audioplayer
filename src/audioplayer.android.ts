//import {PlaybackEvent} from 'nativescript-audioplayer';
import { CommonAudioPlayer, MediaTrack, Playlist, PlaybackEvent } from './audioplayer.common';
import * as app from 'application';

export { MediaTrack, Playlist, PlaybackEvent } from './audioplayer.common';

let TNSConnectionCallback: new (owner: TNSAudioPlayer, resolve: (value?: any) => void, reject: (reason?: any) => void) => dk.nota.lyt.libvlc.ConnectionCallback;
function ensureTNSConnectionCallback() {
  if (TNSConnectionCallback) {
    return;
  }

  @Interfaces([dk.nota.lyt.libvlc.ConnectionCallback])
  class TNSConnectionCallbackImpl extends java.lang.Object {

    constructor(private owner: TNSAudioPlayer,
                private resolve: (value?: any) => void,
                private reject: (reason?: any) => void) {
      super();
      return global.__native(this);
    }

    public onConnected(service: dk.nota.lyt.libvlc.PlaybackService) {
      this.owner.onConnected(service);
      this.resolve();
    }

    public onDisconnected() {
      this.owner.onDisconnected();
      this.reject();
    }
  }

  TNSConnectionCallback = TNSConnectionCallbackImpl;
}

export class TNSAudioPlayer extends CommonAudioPlayer
{
  public _serviceHelper: dk.nota.lyt.libvlc.PlaybackServiceHelper;
  public _service: dk.nota.lyt.libvlc.PlaybackService;

  private _readyPromise: Promise<any>;

  public get isReady(): Promise<any> {
    return this._readyPromise;
  }

  constructor() {
    super();
    this.android = this;
    this._readyPromise = new Promise<any>((resolve, reject) => {
      ensureTNSConnectionCallback();

      const callback = new TNSConnectionCallback(this, resolve, reject);
      this._serviceHelper = new dk.nota.lyt.libvlc.PlaybackServiceHelper(app.android.context, callback);
      this._serviceHelper.onStart();
    });
  }

  public onConnected(service: dk.nota.lyt.libvlc.PlaybackService) {
    this._log("PlaybackService - Connected");
    this._service = service;
    this.setupServiceCallbacks(service);
    if (service.getMediaListIdentifier()) {
      this._log("- existing playlist ID: "+ service.getMediaListIdentifier());
    }
  }

  public onDisconnected() {
    this._log("PlaybackService - Disconnected");
    this._service = null;
    this._readyPromise = Promise.reject('playbackservice disconnected');
  }

  private setupServiceCallbacks(service: dk.nota.lyt.libvlc.PlaybackService) {
      service.setNotificationActivity(app.android.startActivity, "LAUNCHED_FROM_NOTIFICATION");
      service.removeAllCallbacks();
      service.addCallback(this.lytPlaybackEventHandler);
  }

  private getNewMediaWrapper(track: MediaTrack): dk.nota.lyt.libvlc.media.MediaWrapper {
    let uri: android.net.Uri = dk.nota.lyt.libvlc.Utils.LocationToUri(track.url);
    let media: dk.nota.lyt.libvlc.media.MediaWrapper = new dk.nota.lyt.libvlc.media.MediaWrapper(uri);
    media.setDisplayTitle(track.title);
    media.setArtist(track.artist);
    media.setAlbum(track.album);
    media.setArtworkURL(track.albumArtUrl);
    return media;
  }

  public preparePlaylist(playlist: Playlist): void {
    if (this._service) {
      this._service.stopPlayback();
      // Ensure callbacks are setup properly.
      this.setupServiceCallbacks(this._service);
      this.playlist = playlist;
      let mediaList = new java.util.ArrayList<dk.nota.lyt.libvlc.media.MediaWrapper>();
      for (var track of this.playlist.tracks) {
        // this._log('Creating MediaWrapper for: '+ track.title);
        mediaList.add(this.getNewMediaWrapper(track));
      }
      this._service.load(mediaList);
      this._log('Set playlist identifier = '+ playlist.UID);
      this._service.setMediaListIdentifier(playlist.UID);
    }
  }

  public getCurrentPlaylistIndex(): number {
    return this._service ? this._service.getCurrentMediaPosition() : -1;
  }

  public play() {
    if (this._service) {
      // Ensure callbacks are setup properly,
      // since service could have been reset during a pause.
      this.setupServiceCallbacks(this._service);
      this._service.play();
    }
  }

  public pause() {
    if (this._service) {
      this._service.pause();
    }
  }

  public stop() {
    if (this._service) {
      this._service.stopPlayback();
      // On Android the playback service is stopped on stopPlayback,
      // so we have to manually send the Stopped event to our listener.
      this._listener.onPlaybackEvent(PlaybackEvent.Stopped);
    }
  }

  public isPlaying(): boolean {
    return this._service && this._service.isPlaying();
  }

  public seekTo(offset: number) {
    if (this._service && this._service.hasMedia()) {
      this._service.setTime(offset);
    }
  }

  public skipToNext() {
    if (this._service && this._service.hasNext()) {
      this._service.next();
    }
  }

  public skipToPrevious() {
    if (this._service && this._service.hasPrevious()) {
      this._service.previous();
    }
  }

  public skipToPlaylistIndex(playlistIndex: number) {
    if (this._service) {
      this._service.playIndex(playlistIndex, 0);
    }
  }

  public setRate(rate: number) {
    if (this._service) {
      this._service.setRate(rate);
    }
  }

  public getRate() {
    return this._service ? this._service.getRate() : 1;
  }

  public getDuration() {
    if (this._service) {
      return this._service.getLength();
    }
  }

  public getCurrentTime(): number {
    if (this._service) {
      return this._service.getTime();
    }
  }

  /* Override */
  public getCurrentPlaylistUID(): string {
    if (this._service) {
      return this._service.getMediaListIdentifier();
    } else {
      return null;
    }
  }

  setSleepTimer(millisecs: number) {
    if (this._service) {
      this._service.setSleepTimer(millisecs);
    }
  }

  getSleepTimerRemaining(): number {
    if (this._service) {
      return this._service.getSleepTimerRemaining();
    }
  }

  cancelSleepTimer() {
    if (this._service) {
      this._service.cancelSleepTimer();
    }
  }

  setSeekIntervalSeconds(seconds: number) {
    if (this._service) {
      this._service.setSeekIntervalSeconds(seconds);
    }
  }

  destroy() {
    this._log('AudioPlayer.destroy');
    // Do not kill the background service if it is still playing.
    if (this._service && !this._service.isPlaying()) {
      this._log('Stopping PlaybackService');
      this._service.stopService();
    }
    this._serviceHelper.onStop();
    delete this._service;
    delete this._serviceHelper;
  }

  private lytPlaybackEventHandler = new dk.nota.lyt.libvlc.PlaybackEventHandler({
      update: () => {
        // this._log('update');
      },
      updateProgress: () => {
        // this._log('progress');
      },
      onMediaEvent: (event: dk.nota.lyt.libvlc.media.MediaEvent) => {
        // this._log('mediaEvent: '+ event.type);
        if (event.type == dk.nota.lyt.libvlc.media.MediaEvent.MetaChanged) {
          // this._log('^ MetaChanged ==');
        } else if (event.type == dk.nota.lyt.libvlc.media.MediaEvent.ParsedChanged) {
          // this._log('^ ParsedChanged ==');
        } else if (event.type == dk.nota.lyt.libvlc.media.MediaEvent.StateChanged) {
          // this._log('^ StateChanged ==');
        }
      },
      onMediaPlayerEvent: (event: dk.nota.lyt.libvlc.media.MediaPlayerEvent) => {
        const PlayerEvent = dk.nota.lyt.libvlc.media.MediaPlayerEvent;
        //TODO: Simplify: VLCToClientEventMap
        if (event.type == PlayerEvent.SeekableChanged) {
          if (event.getSeekable() == true && this._queuedSeekTo !== null) {
            this._log('Executing queued SeekTo: '+ this._queuedSeekTo);
            this.seekTo(this._queuedSeekTo);
            this._queuedSeekTo = null;
          }
        } else if (event.type == PlayerEvent.PausableChanged) {
        } else if (event.type == PlayerEvent.TimeChanged) {
          this._onPlaybackEvent(PlaybackEvent.TimeChanged, event.getTimeChanged());
        } else if (event.type == PlayerEvent.MediaChanged) {
        } else if (event.type == PlayerEvent.Opening) {
          this._onPlaybackEvent(PlaybackEvent.Buffering);
        } else if (event.type == PlayerEvent.Playing) {
          this._onPlaybackEvent(PlaybackEvent.Playing);
        } else if (event.type == PlayerEvent.Paused) {
          this._onPlaybackEvent(PlaybackEvent.Paused);
        } else if (event.type == PlayerEvent.Stopped) {
          this._onPlaybackEvent(PlaybackEvent.Stopped);
        } else if (event.type == PlayerEvent.EndReached) {
          this._onPlaybackEvent(PlaybackEvent.EndOfTrackReached);
          if (this.getCurrentPlaylistIndex() >= this.playlist.length - 1) {
            this._onPlaybackEvent(PlaybackEvent.EndOfPlaylistReached);
          }
        } else if (event.type == PlayerEvent.SleepTimerChanged) {
          this._onPlaybackEvent(PlaybackEvent.SleepTimerChanged);
        } else if (event.type == PlayerEvent.WaitingForNetwork) {
          this._onPlaybackEvent(PlaybackEvent.WaitingForNetwork);
        } else if (event.type == PlayerEvent.Buffering) {
          // This only tells % of the buffer-size required to start playback
          //this._onPlaybackEvent(PlaybackEvent.Buffering, event.getBuffering());
        } else if (event.type == PlayerEvent.EncounteredError) {
          this._log('== Playback ERROR ==');
          this._onPlaybackEvent(PlaybackEvent.EncounteredError);
          //throw new Error("Android PlaybackService encountered an error");
        } else {
          // this._log('^ Unhandled PlayerEvent: '+ event.type);
        }
      }
    });

  
}
