import {Observable} from 'data/observable';
import {AudioPlayer, Playlist, MediaTrack, PlaybackEventListener, PlaybackEvent} from 'nativescript-audioplayer';

export class HelloWorldModel extends Observable implements PlaybackEventListener {
  public message: string;
  private player: AudioPlayer;
  private rateToggled: boolean = false;

  constructor() {
    super();
    
    let playlist = new Playlist();
    playlist.tracks.push(new MediaTrack("http://www.noiseaddicts.com/samples_1w72b820/4357.mp3", "Skyggeforbandelsen", "Helene Tegtmeier", "Del 1 af 3", "http://bookcover.nota.dk/714070_w140_h200.jpg"));
    playlist.tracks.push(new MediaTrack("http://www.noiseaddicts.com/samples_1w72b820/3816.mp3", "title", "artist", "album", null));
    playlist.tracks.push(new MediaTrack("http://www.noiseaddicts.com/samples_1w72b820/202.mp3", "title", "artist", "album", null));
    playlist.tracks.push(new MediaTrack("http://www.noiseaddicts.com/samples_1w72b820/4941.mp3", "title", "artist", "album", null));
    playlist.tracks.push(new MediaTrack("http://mean2u.rfshq.com/downloads/music/giveyouup.mp3", "Rick n' Roll", "Rick Astley", "album", null));
    this.player = new AudioPlayer(playlist);
      // "http://www.noiseaddicts.com/samples_1w72b820/4357.mp3",
      // "http://www.noiseaddicts.com/samples_1w72b820/3816.mp3"]);
    // this.player.addToPlaylist([
    //   "http://www.noiseaddicts.com/samples_1w72b820/202.mp3",
    //   "http://www.noiseaddicts.com/samples_1w72b820/4941.mp3",
    //   "http://mean2u.rfshq.com/downloads/music/giveyouup.mp3"]);
    this.player.setPlaybackEventListener(this);
    this.message = this.player.message;
  }

  public play() {
    console.log("play");
    this.player.play();
  }

  public pause() {
    console.log("pause");
    this.player.pause();
  }
  
  public toggleRate() {
    this.player.setRate(this.rateToggled ? 1 : 2);
    this.rateToggled = !this.rateToggled;
  }
  
  public seekSpecific() {
    this.player.seekTo(15000, 2);
  }
  
  public skipToPrevious() {
    this.player.skipToPrevious();
  }
  
  public skipToNext() {
    this.player.skipToNext();
  }

  public onPlaybackEvent(evt: PlaybackEvent) {
    console.log('Playback event received: '+ PlaybackEvent[evt]);
  }
}
