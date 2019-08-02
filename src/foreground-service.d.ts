declare namespace dk {
  namespace nota {
    class MediaService extends android.app.Service {
      public exoPlayer: com.google.android._binder.ExoPlayer;

      public acquireLock(): void;
      public releaseLock(): void;
      public preparePlaylist(playlist: any): void;
      public setSeekIntervalSeconds(seconds: number): void;
      public setRate(rate: number): void;
      public getRate(): number;
      public setOwner(owner: any): void;

      public play(): void;
      public pause(): void;
      public stop(): void;
    }

    namespace MediaService {
    class LocalBinder extends android.os.Binder {
      public getService(): MediaService;
    }
  }
  }
}