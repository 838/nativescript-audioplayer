//import {PlaybackEvent} from 'nativescript-audioplayer';
import {CommonAudioPlayer, MediaTrack, Playlist, PlaybackEvent} from './audioplayer.common';
import * as app from 'application';

export {MediaTrack, Playlist, PlaybackEvent} from './audioplayer.common';

import lyt = dk.nota.lyt.libvlc;
import PlayerEvent = dk.nota.lyt.libvlc.media.MediaPlayerEvent;

export class AudioPlayer extends CommonAudioPlayer
{
  public _serviceHelper: lyt.PlaybackServiceHelper;
  public _service: lyt.PlaybackService;
  private _libVLC: any;
  private _queuedSeekTo: number = null;

  constructor(playlist: Playlist) {
    super(playlist);
    this.android = this;
    this._serviceHelper = new lyt.PlaybackServiceHelper(app.android.context, new lyt.ConnectionCallback({
      onConnected: (service: lyt.PlaybackService) => {
        this._log("===== SERVICE CONNECTED =====");
        this.onServiceConnected(service);
      },
      onDisconnected: () => {
        this._log("===== SERVICE DISCONNECTED =====");
      }
    }));
    this._serviceHelper.onStart();
  }

  private onServiceConnected(service: lyt.PlaybackService): void {
    this._service = service;
    service.setNotificationActivity(app.android.startActivity, "LAUNCHED_FROM_NOTIFICATION");
    service.addCallback(new lyt.PlaybackEventHandler({
      update: () => {
        // this._log('update');
      },
      updateProgress: () => {
        // this._log('progress');
      },
      onMediaEvent: (event: lyt.media.MediaEvent) => {
        this._log('mediaEvent: '+ event.type);
        if (event.type == lyt.media.MediaEvent.MetaChanged) {
          this._log('^ MetaChanged ==');
        } else if (event.type == lyt.media.MediaEvent.ParsedChanged) {
          this._log('^ ParsedChanged ==');
        } else if (event.type == lyt.media.MediaEvent.StateChanged) {
          this._log('^ StateChanged ==');
        }
      },
      onMediaPlayerEvent: (event: PlayerEvent) => {
        //TODO: Simplify: VLCToClientEventMap
        if (event.type == PlayerEvent.SeekableChanged) {
          //this._log('^ SeekableChanged ==');
          if (event.getSeekable() == true && this._queuedSeekTo != null) {
            this._log('Queued SeekTo discovered. Seeking to '+ this._queuedSeekTo);
            this.seekTo(this._queuedSeekTo);
            this._queuedSeekTo = null;
          }
        } else if (event.type == PlayerEvent.PausableChanged) {
        } else if (event.type == PlayerEvent.TimeChanged) {
          //this._log('^ TimeChanged: '+ this._service.getTime());
        } else if (event.type == PlayerEvent.MediaChanged) {
        } else if (event.type == PlayerEvent.Opening) {
          this._onPlaybackEvent(PlaybackEvent.Opening);
        } else if (event.type == PlayerEvent.Playing) {
          this._onPlaybackEvent(PlaybackEvent.Playing);
        } else if (event.type == PlayerEvent.Paused) {
          this._onPlaybackEvent(PlaybackEvent.Paused);
        } else if (event.type == PlayerEvent.Stopped) {
          this._onPlaybackEvent(PlaybackEvent.Stopped);
        } else if (event.type == PlayerEvent.EndReached) {
          this._onPlaybackEvent(PlaybackEvent.EndOfTrackReached);
          if (this.getCurrentPlaylistIndex() == this.playlist.length - 1) {
            this._onPlaybackEvent(PlaybackEvent.EndOfPlaylistReached);
          }
        } else if (event.type == PlayerEvent.EncounteredError) {
          this._log('== Encountered ERROR ==');
          throw new Error("Android PlaybackService encountered an error");
        } else {
          // this._log('^ Unhandled PlayerEvent: '+ event.type);
        }
      }
    }));
    this.loadPlaylist(this.playlist);
  }

  private loadPlaylist(playlist: Playlist): void {
    let mediaList = new java.util.ArrayList<lyt.media.MediaWrapper>();
    for (var track of this.playlist.tracks) {
      this._log('Android - Created MediaWrapper for: '+ track.title);
      mediaList.add(this.getNewMediaWrapper(track));
    }
    this._service.load(mediaList, 0);
  }

  private getNewMediaWrapper(track: MediaTrack): lyt.media.MediaWrapper {
    let uri: android.net.Uri = lyt.Utils.LocationToUri(track.url);
    let media: lyt.media.MediaWrapper = new lyt.media.MediaWrapper(uri);
    media.setDisplayTitle(track.title);
    media.setArtist(track.artist);
    media.setAlbum(track.album);
    media.setArtworkURL(track.albumArtUrl);
    return media;
  }

  public addToPlaylist(track: MediaTrack) {
    this._service.append(this.getNewMediaWrapper(track));
  }

  public getCurrentPlaylistIndex() {
    return this._service.getCurrentMediaPosition();
  }

  public play() {
    this._service.play();
  }

  public pause() {
    this._service.pause();
  }

  public stop(fullStop: boolean) {
    this._service.stopPlayback();
  }

  public seekTo(milisecs: number, playlistIndex?: number) {
    if (playlistIndex != null) {
      this.skipToIndex(playlistIndex);
      this._queuedSeekTo = milisecs;
    } else {
      this._service.setTime(milisecs);
    }
  }

  public skipToNext() {
    if (this._service.hasNext()) {
      this._service.next();
    }
  }

  public skipToPrevious() {
    if (this._service.hasPrevious()) {
      this._service.previous();
    }
  }

  private skipToIndex(newPlaylistIndex: number) {
    this._log ("playlist size "+ this.playlist.length);
    this._log ("skipping to index "+ newPlaylistIndex +" (zero-based)");
    this._service.playIndex(newPlaylistIndex, 0);
  }

  public setRate(rate: number) {
    this._service.setRate(rate);
  }

  public getRate() {
    return this._service.getRate();
  }

  public getDuration() {
    return this._service.getTime();
  }

  public getCurrentTime() {
    return this._service.getTime();
  }

  public release() {
    this._service.stopService();
    this._serviceHelper.onStop();
  }
}
