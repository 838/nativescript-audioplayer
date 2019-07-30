/// <reference path="./native-definitions/exoplayer.d.ts" />

import * as nsApp from 'tns-core-modules/application';
import * as imageSource from 'tns-core-modules/image-source';
import * as trace from 'tns-core-modules/trace';
import * as utils from 'tns-core-modules/utils/utils';
import { CommonAudioPlayer, PlaybackEvent, Playlist, traceCategory } from './audioplayer-common';

export class TNSAudioPlayer extends CommonAudioPlayer {
  private _readyPromise: Promise<any>;

  private trackSelector: com.google.android.exoplayer2.trackselection.DefaultTrackSelector;
  private loadControl: com.google.android.exoplayer2.DefaultLoadControl;
  private renderersFactory: com.google.android.exoplayer2.DefaultRenderersFactory;
  private _exoPlayer: com.google.android.exoplayer2.ExoPlayer;

  private _playerNotificationManager: com.google.android.exoplayer2.ui.PlayerNotificationManager;

  private _pmWakeLock: android.os.PowerManager.WakeLock;
  private _wifiLock: android.net.wifi.WifiManager.WifiLock;

  private get exoPlayer() {
    if (!this._exoPlayer) {
      ensureNativeClasses();

      this.trackSelector = new DefaultTrackSelector();
      this.loadControl = new DefaultLoadControl();
      this.renderersFactory = new DefaultRenderersFactory(this.context);

      this.playerListener = new TNSPlayerEvent(this);
      this._playerNotificationManager = new com.google.android.exoplayer2.ui.PlayerNotificationManager(
        this.context,
        'NotaAudio',
        Math.round(Math.random() * 1000),
        new com.google.android.exoplayer2.ui.PlayerNotificationManager.MediaDescriptionAdapter({
          createCurrentContentIntent: (player: com.google.android.exoplayer2.Player) => {
            const intent = new android.content.Intent(this.context, dk.nota.BackgroundService.class);

            return android.app.PendingIntent.getActivity(this.context, 0, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT);
          },
          getCurrentContentText: (player) => {
            const window = player.getCurrentWindowIndex();
            const track = this.getTrackInfo(window);
            if (!track) {
              return null;
            }

            return track.album;
          },
          getCurrentContentTitle: (player) => {
            const window = player.getCurrentWindowIndex();
            const track = this.getTrackInfo(window);
            if (!track) {
              return null;
            }

            return track.title;
          },
          getCurrentLargeIcon: (player, callback) => {
            const window = player.getCurrentWindowIndex();
            const track = this.getTrackInfo(window);
            if (!track || !track.albumArtUrl) {
              return null;
            }

            imageSource.fromUrl(track.albumArtUrl).then((image) => callback.onBitmap(image.android));

            return null;
          },
          getCurrentSubText: (player) => {
            const window = player.getCurrentWindowIndex();
            const track = this.getTrackInfo(window);
            if (!track) {
              return null;
            }

            return track.artist;
          },
        }),
      );

      this._exoPlayer = ExoPlayerFactory.newSimpleInstance(this.context, this.renderersFactory, this.trackSelector, this.loadControl);
      this._exoPlayer.addListener(this.playerListener);
      this._playerNotificationManager.setPlayer(this._exoPlayer);
    }

    return this._exoPlayer;
  }

  public get android() {
    return this._exoPlayer;
  }

  private playerListener: TNSPlayerEvent;

  private get context() {
    return utils.ad.getApplicationContext();
  }

  public get isReady(): Promise<any> {
    if (!this._readyPromise) {
      this._readyPromise = new Promise<any>((resolve, reject) => {
        try {
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }

    return this._readyPromise;
  }

  private _exitHandler: (args: nsApp.ApplicationEventData) => void;

  constructor() {
    super();

    global['nota_app'] = nsApp;
    global['nota_app_context'] = this.context;

    const powerManager = this.context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager;
    this._pmWakeLock = powerManager.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, 'NotaAudio');

    const wifiManager = this.context.getSystemService(android.content.Context.WIFI_SERVICE) as android.net.wifi.WifiManager;
    this._wifiLock = wifiManager.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL, 'NotaAudio');

    nsApp.on(
      nsApp.exitEvent,
      (this._exitHandler = (args: nsApp.ApplicationEventData) => {
        if (args.android && args.android.isFinishing()) {
          // Handle temporary destruction.
          this.destroy();
          return;
        }
      }),
    );
  }

  public preparePlaylist(playlist: Playlist): void {
    const concatenatedSource = new com.google.android.exoplayer2.source.ConcatenatingMediaSource(
      Array.create(com.google.android.exoplayer2.source.ExtractorMediaSource, 0),
    );

    const userAgent = com.google.android.exoplayer2.util.Util.getUserAgent(this.context, 'tns-audioplayer');

    const context = this.context;
    for (let i = 0; i < playlist.tracks.length; i += 1) {
      const track = playlist.tracks[i];
      const mediaSource = new com.google.android.exoplayer2.source.ProgressiveMediaSource.Factory(
        new com.google.android.exoplayer2.upstream.DefaultDataSourceFactory(context, userAgent),
      )
        .setTag(`${i}`)
        .createMediaSource(android.net.Uri.parse(track.url));

      concatenatedSource.addMediaSource(mediaSource);
    }

    this.exoPlayer.stop();
    this.exoPlayer.prepare(concatenatedSource);

    this.playlist = playlist;
  }

  public getCurrentPlaylistIndex(): number {
    const tag = this.exoPlayer.getCurrentTag();
    return Number(tag);
  }

  public play() {
    this.exoPlayer.setPlayWhenReady(true);
    this.launchBackgroundService();

    this.acquireLock();
  }

  public pause() {
    this.exoPlayer.setPlayWhenReady(false);
    this.stopBackgroundService();

    this.releaseLock();
  }

  public stop() {
    this.exoPlayer.stop();

    // On Android the playback service is stopped on stopPlayback,
    // so we have to manually send the Stopped event to our listener.
    this._listener.onPlaybackEvent(PlaybackEvent.Stopped);
    this.playlist = null;
    this.stopBackgroundService();
  }

  public isPlaying(): boolean {
    return this.exoPlayer.getPlayWhenReady();
  }

  public seekTo(offset: number) {
    this.exoPlayer.seekTo(offset);
  }

  public skipToPlaylistIndexAndOffset(playlistIndex: number, offset: number): void {
    this.exoPlayer.seekTo(playlistIndex, offset);
  }

  public skipToNext() {
    if (this.exoPlayer.hasNext()) {
      this.exoPlayer.next();
    }
  }

  public skipToPrevious() {
    if (this.exoPlayer.hasPrevious()) {
      this.exoPlayer.previous();
    }
  }

  public skipToPlaylistIndex(playlistIndex: number) {
    this.exoPlayer.seekTo(playlistIndex, 0);
  }

  public setRate(rate: number) {
    const params = new com.google.android.exoplayer2.PlaybackParameters(rate, rate, rate > 1);
    this.exoPlayer.setPlaybackParameters(params);
  }

  public getRate() {
    const params = this.exoPlayer.getPlaybackParameters();
    if (!params) {
      return 1;
    }

    return params.speed;
  }

  public getDuration() {
    return this.exoPlayer.getDuration();
  }

  public getCurrentTime(): number {
    return this.exoPlayer.getCurrentPosition();
  }

  public setSleepTimer(milliseconds: number) {
    if (trace.isEnabled()) {
      trace.write(`${this.cls}.setSleepTimer(${milliseconds})`, traceCategory);
    }

    this.cancelSleepTimer();

    const countdownTick = 1000;
    this._sleepTimerMillisecondsLeft = milliseconds;
    this._sleepTimer = setInterval(() => {
      if (!this._sleepTimerPaused && this.isPlaying()) {
        this._sleepTimerMillisecondsLeft = Math.max(this._sleepTimerMillisecondsLeft - countdownTick, 0);
        this._onPlaybackEvent(PlaybackEvent.SleepTimerChanged);
      }
      if (this._sleepTimerMillisecondsLeft === 0) {
        // Fade out volume and pause if not already paused.
        if (this.isPlaying()) {
          this.pause();
        }

        clearInterval(this._sleepTimer);
        this._sleepTimer = undefined;
      }
    }, countdownTick);
    this._onPlaybackEvent(PlaybackEvent.SleepTimerChanged);
  }

  public getSleepTimerRemaining(): number {
    return this._sleepTimerMillisecondsLeft;
  }

  public setSeekIntervalSeconds(seconds: number) {
    if (trace.isEnabled()) {
      trace.write(`${this.cls}.setSeekIntervalSeconds(${seconds})`, traceCategory);
    }

    /*
    if (this.service) {
      this.service.setSeekIntervalSeconds(seconds);
    } */
  }

  public destroy() {
    if (trace.isEnabled()) {
      trace.write(`${this.cls}.destroy()`, traceCategory);
    }

    this.exoPlayer.stop();
    this._exoPlayer = null;
    delete this._readyPromise;
    this.stopBackgroundService();

    nsApp.off(nsApp.exitEvent, this._exitHandler);
    global['nota_app'] = null;
    global['nota_app_context'] = null;
  }

  public _exoPlayerOnPlayerEvent(evt: PlaybackEvent, arg?: any) {
    this._onPlaybackEvent(evt, arg);
  }

  private getTrackInfo(index: number) {
    if (!this.playlist || !this.playlist.tracks) {
      return null;
    }

    return this.playlist.tracks[index] || null;
  }

  private _backgroundServiceRunning = false;
  private launchBackgroundService() {
    if (this._backgroundServiceRunning) {
      return;
    }

    const context = this.context;
    const intent = new android.content.Intent(context, dk.nota.BackgroundService.class);
    context.startService(intent);

    this._backgroundServiceRunning = true;
  }

  private stopBackgroundService() {
    if (!this._backgroundServiceRunning) {
      return;
    }

    const context = this.context;
    const intent = new android.content.Intent(context, dk.nota.BackgroundService.class);
    context.stopService(intent);

    this._backgroundServiceRunning = false;

    this.releaseLock();
  }

  private acquireLock() {
    if (!this._pmWakeLock.isHeld()) {
      this._pmWakeLock.acquire();
    }

    if (!this._wifiLock.isHeld()) {
      this._wifiLock.acquire();
    }
  }

  private releaseLock() {
    if (this._pmWakeLock.isHeld()) {
      this._pmWakeLock.release();
    }

    if (this._wifiLock.isHeld()) {
      this._wifiLock.release();
    }
  }
}

export { MediaTrack, PlaybackEvent, Playlist } from './audioplayer-common';

let TNSPlayerEvent: new (owner: TNSAudioPlayer) => com.google.android.exoplayer2.Player.EventListener;
type TNSPlayerEvent = com.google.android.exoplayer2.Player.EventListener;
let DefaultTrackSelector: typeof com.google.android.exoplayer2.trackselection.DefaultTrackSelector;
let DefaultLoadControl: typeof com.google.android.exoplayer2.DefaultLoadControl;
let DefaultRenderersFactory: typeof com.google.android.exoplayer2.DefaultRenderersFactory;
type DefaultRenderersFactory = com.google.android.exoplayer2.DefaultRenderersFactory;
let ExoPlayerFactory: typeof com.google.android.exoplayer2.ExoPlayerFactory;

declare namespace dk {
  namespace nota {
    class BackgroundService extends android.app.Service {}
  }
}

function ensureNativeClasses() {
  if (TNSPlayerEvent) {
    return;
  }

  @Interfaces([com.google.android.exoplayer2.Player.EventListener])
  class TNSPlayerEventImpl extends java.lang.Object implements com.google.android.exoplayer2.Player.EventListener {
    private readonly cls = 'TNSPlayerEventImpl';
    private owner: WeakRef<TNSAudioPlayer>;

    constructor(_owner: TNSAudioPlayer) {
      super();

      this.owner = new WeakRef(_owner);

      return global.__native(this);
    }

    /**
     * Called when the timeline and/or manifest has been refreshed.
     *
     * Note that if the timeline has changed then a position discontinuity may also have occurred.
     * For example, the current period index may have changed as a result of periods being added or removed from the timeline.
     * This will not be reported via a separate call to onPositionDiscontinuity(int).
     *
     * @param timeline The latest timeline. Never null, but may be empty
     * @param manifest The latest manifest. May be null
     * @param reason The Player.TimelineChangeReason responsible for this timeline change
     */
    public onTimelineChanged(timeline: com.google.android.exoplayer2.Timeline, manifest: any, reason: number) {
      switch (reason) {
        case com.google.android.exoplayer2.Player.TIMELINE_CHANGE_REASON_PREPARED: {
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onTimelineChanged() - reason = "prepared" manifest:${manifest}`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.TIMELINE_CHANGE_REASON_RESET: {
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onTimelineChanged() - reason = "reset" manifest:${manifest}`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.TIMELINE_CHANGE_REASON_DYNAMIC: {
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onTimelineChanged() - reason = "dynamic" manifest:${manifest}`, traceCategory);
          }
          break;
        }
        default: {
          trace.write(`${this.cls}.onTimelineChanged() - reason = "dynamic" reason:"${reason}" manifest:${manifest}`, traceCategory, trace.messageType.error);
          break;
        }
      }
    }

    /**
     * Called when the available or selected tracks change.
     *
     * @param trackGroups The available tracks. Never null, but may be of length zero.
     * @param trackSelections The track selections for each renderer. Never null and always of length Player.getRendererCount(), but may contain null elements.
     */
    public onTracksChanged(
      trackGroups: com.google.android.exoplayer2.source.TrackGroupArray,
      trackSelections: com.google.android.exoplayer2.trackselection.TrackSelectionArray,
    ) {
      if (trace.isEnabled()) {
        trace.write(`onTracksChanged(${trackGroups}, ${trackSelections})`, traceCategory);
      }

      /*
      for (let i = 0; i < trackGroups.length; i += 1) {
        const trackGroup = trackGroups.get(i);

        for (let j = 0; j < trackGroup.length; j += 1) {
          const format = trackGroup.getFormat(j);
          console.log('onTracksChanged - group', i, 'format', j, format);
        }
      }

      for (let i = 0; i < trackSelections.length; i += 1) {
        const trackSelection = trackSelections.get(i);
        if (!trackSelection) {
          continue;
        }

        const format = trackSelection.getFormat(0);
        const indexInTrackGroup = trackSelection.getIndexInTrackGroup(0);
        const selectedFormat = trackSelection.getSelectedFormat();
        const selectedIndex = trackSelection.getSelectedIndex();
        const selectedIndexInTrackGroup = trackSelection.getSelectedIndexInTrackGroup();
        const selectionData = trackSelection.getSelectionData();
        const selectionReason = trackSelection.getSelectionReason();

        console.log('onTracksChanged - selection', i, {
          format,
          indexInTrackGroup,
          selectedFormat,
          selectedIndex,
          selectedIndexInTrackGroup,
          selectionData,
          selectionReason,
        });
      } */
    }

    /**
     * Called when the player starts or stops loading the source.
     * @param isLoading Whether the source is currently being loaded
     */
    public onLoadingChanged(isLoading: boolean) {
      if (trace.isEnabled()) {
        trace.write(`onTracksChanged(${isLoading})`, traceCategory);
      }
    }

    /**
     * Called when the value returned from either Player.getPlayWhenReady() or Player.getPlaybackState() changes.
     *
     * @param playWhenReady Whether playback will proceed when ready
     * @param playbackState One of the STATE constants
     */
    public onPlayerStateChanged(playWhenReady: boolean, playbackState: number) {
      const owner = this.owner.get();
      if (!owner) {
        return;
      }

      if (playWhenReady) {
        owner._exoPlayerOnPlayerEvent(PlaybackEvent.Playing);
      }

      switch (playbackState) {
        case com.google.android.exoplayer2.Player.STATE_BUFFERING: {
          if (trace.isEnabled()) {
            trace.write(`onPlayerStateChanged(${playWhenReady}, ${playbackState}). State = 'buffering'`, traceCategory);
          }

          if (!playWhenReady) {
            owner._exoPlayerOnPlayerEvent(PlaybackEvent.Buffering);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.STATE_IDLE: {
          if (trace.isEnabled()) {
            trace.write(`onPlayerStateChanged(${playWhenReady}, ${playbackState}). State = 'idle'`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.STATE_ENDED: {
          if (trace.isEnabled()) {
            trace.write(`onPlayerStateChanged(${playWhenReady}, ${playbackState}). State = 'ended'`, traceCategory);
          }

          if (!playWhenReady) {
            owner._exoPlayerOnPlayerEvent(PlaybackEvent.EndOfTrackReached);
          }

          break;
        }
        case com.google.android.exoplayer2.Player.STATE_READY: {
          if (trace.isEnabled()) {
            trace.write(`onPlayerStateChanged(${playWhenReady}, ${playbackState}). State = 'ready'`, traceCategory);
          }
          break;
        }
        default: {
          trace.write(`onPlayerStateChanged(${playWhenReady}, ${playbackState}). State is unknown`, traceCategory);
          break;
        }
      }
    }

    /**
     * Called when the value of Player.getRepeatMode() changes.
     * @param repeatMode The Player.RepeatMode used for playback.
     */
    public onRepeatModeChanged(repeatMode: number) {
      switch (repeatMode) {
        case com.google.android.exoplayer2.Player.REPEAT_MODE_ALL: {
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onRepeatModeChanged() - ${repeatMode} === 'ALL'`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.REPEAT_MODE_OFF: {
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onRepeatModeChanged() - ${repeatMode} === 'OFF'`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.REPEAT_MODE_ONE: {
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onRepeatModeChanged() - ${repeatMode} === 'ONE'`, traceCategory);
          }
          break;
        }
        default: {
          trace.write(`${this.cls}.onRepeatModeChanged() - ${repeatMode} is unknown`, traceCategory, trace.messageType.error);
          break;
        }
      }
    }

    /**
     * Called when the value of Player.getShuffleModeEnabled() changes.
     * @param shuffleModeEnabled Whether shuffling of windows is enabled
     */
    public onShuffleModeEnabledChanged(shuffleModeEnabled: boolean) {
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onShuffleModeEnabledChanged() - ${shuffleModeEnabled}`, traceCategory);
      }
    }

    /**
     * Called when an error occurs. The playback state will transition to Player.STATE_IDLE immediately after this method is called.
     * The player instance can still be used, and Player.release() must still be called on the player should it no longer be required.
     *
     * @param error
     */
    public onPlayerError(error: com.google.android.exoplayer2.ExoPlaybackException) {
      const owner = this.owner.get();
      if (!owner) {
        return;
      }

      owner._exoPlayerOnPlayerEvent(PlaybackEvent.EncounteredError, error);
    }

    /**
     * Called when a position discontinuity occurs without a change to the timeline.
     * A position discontinuity occurs when the current window or period index changes (as a result of playback
     * transitioning from one period in the timeline to the next), or when the playback position jumps within the
     * period currently being played (as a result of a seek being performed, or when the source introduces a discontinuity internally).
     *
     * When a position discontinuity occurs as a result of a change to the timeline this method is not called.
     * onTimelineChanged(Timeline, Object, int) is called in this case.
     *
     * @param reason
     */
    public onPositionDiscontinuity(reason: number) {
      const owner = this.owner.get();
      if (!owner) {
        return;
      }

      switch (reason) {
        case com.google.android.exoplayer2.Player.DISCONTINUITY_REASON_AD_INSERTION: {
          // Discontinuity to or from an ad within one period in the timeline.
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onPositionDiscontinuity() - reason = "DISCONTINUITY_REASON_AD_INSERTION"`, traceCategory);
          }

          break;
        }
        case com.google.android.exoplayer2.Player.DISCONTINUITY_REASON_INTERNAL: {
          // Discontinuity introduced internally by the source.
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onPositionDiscontinuity() - reason = "DISCONTINUITY_REASON_INTERNAL"`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.DISCONTINUITY_REASON_PERIOD_TRANSITION: {
          // Automatic playback transition from one period in the timeline to the next.
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onPositionDiscontinuity() - reason = "DISCONTINUITY_REASON_PERIOD_TRANSITION"`, traceCategory);
          }
          owner._exoPlayerOnPlayerEvent(PlaybackEvent.EndOfTrackReached);
          break;
        }
        case com.google.android.exoplayer2.Player.DISCONTINUITY_REASON_SEEK: {
          // Seek within the current period or to another period.
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onPositionDiscontinuity() - reason = "DISCONTINUITY_REASON_SEEK"`, traceCategory);
          }
          break;
        }
        case com.google.android.exoplayer2.Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT: {
          // Seek adjustment due to being unable to seek to the requested position or because the seek was permitted to be inexact.
          if (trace.isEnabled()) {
            trace.write(`${this.cls}.onPositionDiscontinuity() - reason = "DISCONTINUITY_REASON_SEEK_ADJUSTMENT"`, traceCategory);
          }
          break;
        }
        default: {
          trace.write(`${this.cls}.onPositionDiscontinuity() - reason = "${reason}" is unknown`, traceCategory, trace.messageType.error);
          break;
        }
      }
    }

    /**
     * Called when the current playback parameters change.
     * The playback parameters may change due to a call to Player.setPlaybackParameters(PlaybackParameters),
     * or the player itself may change them (for example, if audio playback switches to pass-through mode, where speed adjustment is no longer possible).
     * @param playbackParameters
     */
    public onPlaybackParametersChanged(playbackParameters: com.google.android.exoplayer2.PlaybackParameters) {
      const { pitch, speed, skipSilence } = playbackParameters;
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onPlaybackParametersChanged() - ${JSON.stringify({ pitch, speed, skipSilence })}`, traceCategory);
      }
    }

    /**
     * Called when all pending seek requests have been processed by the player.
     * This is guaranteed to happen after any necessary changes to the player state were reported to onPlayerStateChanged(boolean, int).
     */
    public onSeekProcessed() {
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onSeekProcessed()`, traceCategory);
      }
    }
  }

  @JavaProxy('dk.nota.BackgroundService')
  class BackgroundService extends android.app.Service {
    private cls = `dk.nota.BackgroundService`;
    public onStartCommand(intent, flags, startId) {
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onStartCommand(${intent}, ${flags}, ${startId})`, traceCategory);
      }
      super.onStartCommand(intent, flags, startId);
      return android.app.Service.START_STICKY;
    }
    public onCreate() {
      // Do something
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onCreate()`, traceCategory);
      }
    }
    public onBind(param) {
      // haven't had to deal with this, so i can't recall what it does
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onBind(${param})`, traceCategory);
      }

      return super.onBind(param);
    }
    public onUnbind(param) {
      // haven't had to deal with this, so i can't recall what it does
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onUnbind(${param})`, traceCategory);
      }

      return super.onUnbind(param);
    }
    public onDestroy() {
      // end service, reset any variables... etc...
      if (trace.isEnabled()) {
        trace.write(`${this.cls}.onDestroy()`, traceCategory);
      }
    }
  }

  TNSPlayerEvent = TNSPlayerEventImpl;
  DefaultTrackSelector = com.google.android.exoplayer2.trackselection.DefaultTrackSelector;
  DefaultLoadControl = com.google.android.exoplayer2.DefaultLoadControl;
  DefaultRenderersFactory = com.google.android.exoplayer2.DefaultRenderersFactory;
  ExoPlayerFactory = com.google.android.exoplayer2.ExoPlayerFactory;
}
