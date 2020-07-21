//@flow
import Env from './utils/env';
import EventManager from './event/event-manager';
import PosterManager from './utils/poster-manager';
import FakeEvent from './event/fake-event';
import FakeEventTarget from './event/fake-event-target';
import {CustomEventType, EventType, Html5EventType} from './event/event-type';
import * as Utils from './utils/util';
import Locale from './utils/locale';
import getLogger, {getLogLevel, LogLevel, LogLevelType, setLogHandler, setLogLevel} from './utils/logger';
import PluginManager from './plugin/plugin-manager';
import BasePlugin from './plugin/base-plugin';
import StateManager from './state/state-manager';
import Track from './track/track';
import VideoTrack from './track/video-track';
import AudioTrack from './track/audio-track';
import TextTrack from './track/text-track';
import TextStyle from './track/text-style';
import {Cue} from './track/vtt-cue';
import {processCues} from './track/text-track-display';
import {StateType} from './state/state-type';
import {TrackType} from './track/track-type';
import {StreamType} from './engines/stream-type';
import {EngineType} from './engines/engine-type';
import {MediaType} from './media-type';
import {AbrMode} from './track/abr-mode-type';
import {CorsType} from './engines/html5/cors-types';
import PlaybackMiddleware from './middleware/playback-middleware';
import {DefaultConfig} from './player-config.js';
import './assets/style.css';
import PKError from './error/error';
import {EngineProvider} from './engines/engine-provider';
import {ExternalCaptionsHandler} from './track/external-captions-handler';
import {AdBreakType} from './ads/ad-break-type';
import {AdTagType} from './ads/ad-tag-type';
import {AdsController} from './ads/ads-controller';
import {AdEventType} from './ads/ad-event-type';
import {ControllerProvider} from './controller/controller-provider';
import {ResizeWatcher} from './utils/resize-watcher';
import {FullscreenController} from './fullscreen/fullscreen-controller';
import {EngineDecorator} from './engines/engine-decorator';
import {LabelOptions} from './track/label-options';

/**
 * The black cover class name.
 * @type {string}
 * @const
 */
const BLACK_COVER_CLASS_NAME: string = 'playkit-black-cover';
/**
 * The player container class name.
 * @type {string}
 * @const
 */
const CONTAINER_CLASS_NAME: string = 'playkit-container';

/**
 /**
 * The player poster class name.
 * @type {string}
 * @const
 */
const POSTER_CLASS_NAME: string = 'playkit-poster';

/**
 * The engine class name.
 * @type {string}
 * @const
 */
const ENGINE_CLASS_NAME: string = 'playkit-engine';

/**
 * The text style class name.
 * @type {string}
 * @const
 */
const SUBTITLES_STYLE_CLASS_NAME: string = 'playkit-subtitles-style';

/**
 * The subtitles class name.
 * @type {string}
 * @const
 */
const SUBTITLES_CLASS_NAME: string = 'playkit-subtitles';

/**
 *  The auto string, for captions
 *  @type {string}
 *  @const
 */
const AUTO: string = 'auto';

/**
 *  The off string, for captions
 *  @type {string}
 *  @const
 */
const OFF: string = 'off';

/**
 *  The duration offset, for seeking to duration safety.
 *  @type {number}
 *  @const
 */
const DURATION_OFFSET: number = 0.1;

/**
 * The toggle fullscreen rendering timeout value
 * @type {number}
 * @const
 */
const REPOSITION_CUES_TIMEOUT: number = 1000;

/**
 * The threshold in seconds from duration that we still consider it as live edge
 * @type {number}
 * @const
 */
const LIVE_EDGE_THRESHOLD: number = 1;

/**
 * The HTML5 player class.
 * @classdesc
 */
export default class Player extends FakeEventTarget {
  /**
   * The player class logger.
   * @type {any}
   * @static
   * @private
   */
  static _logger: any = getLogger('Player');

  /**
   * Runs the engines capabilities tests.
   * @returns {void}
   * @public
   * @static
   */
  static runCapabilities(): void {
    Player._logger.debug('Running player capabilities');
    EngineProvider.getEngines().forEach(Engine => Engine.runCapabilities());
  }

  /**
   * Gets the engines capabilities.
   * @param {?string} engineType - The engine type.
   * @return {Promise<Object>} - The engines capabilities object.
   * @public
   * @static
   */
  static getCapabilities(engineType: ?string): Promise<{[name: string]: any}> {
    Player._logger.debug('Get player capabilities', engineType);
    const promises = [];
    EngineProvider.getEngines().forEach(Engine => promises.push(Engine.getCapabilities()));
    return Promise.all(promises).then(arrayOfResults => {
      const playerCapabilities = {};
      arrayOfResults.forEach(res => Object.assign(playerCapabilities, res));
      return engineType ? playerCapabilities[engineType] : playerCapabilities;
    });
  }

  /**
   * Sets an engine capabilities.
   * @param {string} engineType - The engine type.
   * @param {Object} capabilities - The engine capabilities.
   * @returns {void}
   * @public
   * @static
   */
  static setCapabilities(engineType: string, capabilities: {[name: string]: any}): void {
    Player._logger.debug('Set player capabilities', engineType, capabilities);
    const selectedEngine = EngineProvider.getEngines().find(Engine => Engine.id === engineType);
    if (selectedEngine) {
      selectedEngine.setCapabilities(capabilities);
    }
  }

  /**
   * The plugin manager of the player.
   * @type {PluginManager}
   * @private
   */
  _pluginManager: PluginManager;
  /**
   * The controller provider of the player.
   * @type {ControllerProvider}
   * @private
   */
  _controllerProvider: ControllerProvider;
  /**
   * The event manager of the player.
   * @type {EventManager}
   * @private
   */
  _eventManager: EventManager;
  /**
   * The poster manager of the player.
   * @type {PosterManager}
   * @private
   */
  _posterManager: PosterManager;
  /**
   * The runtime configuration of the player.
   * @type {Object}
   * @private
   */
  _config: Object;
  /**
   * The playback engine.
   * @type {IEngine}
   * @private
   */
  _engine: IEngine;
  /**
   * The state manager of the player.
   * @type {StateManager}
   * @private
   */
  _stateManager: StateManager;
  /**
   * The tracks of the player.
   * @type {Array<Track | TextTrack | AudioTrack | VideoTrack>}
   * @private
   */
  _tracks: Array<Track | TextTrack | AudioTrack | VideoTrack>;
  /**
   * The player ready promise
   * @type {Promise<*>}
   * @private
   */
  _readyPromise: ?Promise<*>;
  /**
   * Whether the play is the first or not
   * @type {boolean}
   * @private
   */
  _firstPlay: boolean;
  /**
   * Whether the playing is the first or not
   * @type {boolean}
   * @private
   */
  _firstPlaying: boolean;
  /**
   * Whether the playback already start
   * @type {boolean}
   * @private
   */
  _playbackStart: boolean;
  /**
   * Whether the playback ended
   * @type {boolean}
   * @private
   */

  _playbackEnded: boolean;
  /**
   * If quality has changed after playback ended - pend the change
   * @type {boolean}
   * @private
   */

  _pendingSelectedVideoTrack: ?VideoTrack;
  /**
   * The available playback rates for the player.
   * @type {Array<number>}
   * @private
   */
  _playbackRates: Array<number>;
  /**
   * The player DOM element container.
   * @type {HTMLDivElement}
   * @private
   */
  _el: HTMLDivElement;
  /**
   * The player text DOM element container.
   * @type {HTMLDivElement}
   * @private
   */
  _textDisplayEl: HTMLDivElement;
  /**
   * The player black cover div.
   * @type {HTMLDivElement}
   * @private
   */
  _blackCoverEl: HTMLDivElement;
  /**
   * The player DOM id.
   * @type {string}
   * @private
   */
  _playerId: string;
  /**
   * The player last updated text cues list
   * @type {Array<any>}
   * @private
   */
  _activeTextCues: Array<any> = [];
  /**
   * The player text disaply settings
   * @type {Object}
   * @private
   */
  _textDisplaySettings: Object = {};
  /**
   * The player text style settings
   * @type {TextStyle}
   * @private
   */
  _textStyle: TextStyle;
  /**
   * The playback middleware of the player.
   * @type {PlaybackMiddleware}
   * @private
   */
  _playbackMiddleware: PlaybackMiddleware;
  /**
   * The environment(os,device,browser) object of the player.
   * @type {Object}
   * @private
   */
  _env: Object;
  /**
   * The currently selected engine type
   * @type {string}
   * @private
   */
  _engineType: string;
  /**
   * The currently selected stream type
   * @type {string}
   * @private
   */
  _streamType: string;
  /**
   * The current playback attributes state
   * @type {Object}
   * @private
   */
  _playbackAttributesState: {[attribute: string]: any} = {
    muted: undefined,
    volume: undefined,
    rate: undefined,
    audioLanguage: '',
    textLanguage: ''
  };

  /**
   * holds false or an id for the timeout the reposition the text cues after togelling full screen
   * @type {any}
   * @private
   */
  _repositionCuesTimeout: any;
  /**
   * Whether a load media request has sent, the player should wait to media.
   * @type {boolean}
   * @private
   */
  _loadingMedia: boolean;
  /**
   * Whether the player is loading a source.
   * @type {boolean}
   * @private
   */
  _loading: boolean;
  /**
   * Reset indicator state.
   * @type {boolean}
   * @private
   */
  _reset: boolean;
  /**
   * Destroyed indicator state.
   * @type {boolean}
   * @private
   */
  _destroyed: boolean;
  /**
   * Fallback to muted auto play mode indicator.
   * @type {boolean}
   * @private
   */
  _fallbackToMutedAutoPlay: boolean;
  /**
   * holds the external tracks handler controller
   * @type {ExternalCaptionsHandler}
   * @private
   */
  _externalCaptionsHandler: ExternalCaptionsHandler;
  /**
   * holds the full screen controller
   * @type {FullscreenController}
   * @private
   */
  _fullscreenController: FullscreenController;
  /**
   * holds the ads controller
   * @type {?AdsController}
   * @private
   */
  _adsController: ?AdsController;
  /**
   * holds the resize observer. Incharge of notifying on resize changes.
   * @type {?AdsController}
   * @private
   */
  _resizeWatcher: ResizeWatcher;
  /**
   * Holds preset component factories
   * @type {?PKUIComponent}
   * @private
   */
  _uiComponents: Array<PKUIComponent>;
  /**
   * Whether the user interacted with the player
   * @type {boolean}
   * @private
   */
  _hasUserInteracted: boolean = false;
  /**
   * Whether the video is seeked to live edge
   * @type {boolean}
   * @private
   */
  _isOnLiveEdge: boolean = false;
  /**
   * Whether should load after attach media used
   * @type {boolean}
   * @private
   */
  _shouldLoadAfterAttach: boolean = false;

  /**
   * @param {Object} config - The configuration for the player instance.
   * @constructor
   */
  constructor(config: Object = {}) {
    super();
    this._setConfigLogLevel(config);
    this._playerId = Utils.Generator.uniqueId(5);
    this._prepareVideoElement();
    Player.runCapabilities();
    this._env = Env;
    this._tracks = [];
    this._uiComponents = [];
    this._firstPlay = true;
    this._repositionCuesTimeout = false;
    this._loadingMedia = false;
    this._loading = false;
    this._playbackStart = false;
    this._playbackEnded = false;
    this._firstPlaying = false;
    this._reset = true;
    this._destroyed = false;
    this._fallbackToMutedAutoPlay = false;
    this._config = Player._defaultConfig;
    this._eventManager = new EventManager();
    this._posterManager = new PosterManager();
    this._stateManager = new StateManager(this);
    this._pluginManager = new PluginManager();
    this._controllerProvider = new ControllerProvider(this._pluginManager);
    this._resizeWatcher = new ResizeWatcher();
    this._playbackMiddleware = new PlaybackMiddleware();
    this._textStyle = new TextStyle();
    this._createReadyPromise();
    this._createPlayerContainer();
    this._appendDomElements();
    this._externalCaptionsHandler = new ExternalCaptionsHandler(this);
    this._fullscreenController = new FullscreenController(this);
    this.configure(config);
  }

  // <editor-fold desc="Public API">

  // <editor-fold desc="Playback API">

  /**
   * Configures the player according to a given configuration.
   * @param {Object} config - The configuration for the player instance.
   * @returns {void}
   */
  configure(config: Object = {}): void {
    this._setConfigLogLevel(config);
    if (this._hasSources(config.sources)) {
      this._configureOrLoadPlugins(config.plugins);
      this._maybeCreateAdsController();
      this.reset();
      this._resizeWatcher.init(Utils.Dom.getElementById(this._playerId));
      Player._logger.debug('Change source started');
      this.dispatchEvent(new FakeEvent(CustomEventType.CHANGE_SOURCE_STARTED));
      this._pluginManager.loadMedia();
      Utils.Object.mergeDeep(this._config, config);
      this._reset = false;
      if (this._selectEngineByPriority()) {
        this.dispatchEvent(new FakeEvent(CustomEventType.SOURCE_SELECTED, {selectedSource: this._config.sources[this._streamType]}));
        this._attachMedia();
        this._handlePlaybackOptions();
        this._posterManager.setSrc(this._config.sources.poster);
        this._handlePreload();
        this._handleAutoPlay();
        Player._logger.debug('Change source ended');
        this.dispatchEvent(new FakeEvent(CustomEventType.CHANGE_SOURCE_ENDED));
      } else {
        Player._logger.warn('No playable engines was found to play the given sources');
        this.dispatchEvent(
          new FakeEvent(
            Html5EventType.ERROR,
            new PKError(
              PKError.Severity.CRITICAL,
              PKError.Category.PLAYER,
              PKError.Code.NO_ENGINE_FOUND_TO_PLAY_THE_SOURCE,
              'No Engine Found To Play The Source'
            )
          )
        );
      }
    } else {
      Utils.Object.mergeDeep(this._config, config);
      this._configureOrLoadPlugins(config.plugins);
      this._maybeCreateAdsController();
    }
  }

  /**
   * The player readiness
   * @public
   * @returns {Promise<*>} - The ready promise
   */
  ready(): Promise<*> {
    return this._readyPromise ? this._readyPromise : Promise.resolve();
  }

  /**
   * Load media
   * @public
   * @returns {void}
   */
  load(): void {
    const loadPlayer = () => {
      if (this._engine) {
        this._load();
      } else {
        this._eventManager.listenOnce(this, CustomEventType.SOURCE_SELECTED, () => this._load());
      }
    };
    if (!this.src) {
      this._playbackMiddleware.load(() => loadPlayer());
    } else {
      Player._logger.debug('The source has already been loaded. load request ignored');
    }
  }

  /**
   * Start/resume playback.
   * @returns {void}
   * @public
   */
  play(): void {
    if (!this._playbackStart) {
      this._playbackStart = true;
      this.dispatchEvent(new FakeEvent(CustomEventType.PLAYBACK_START));
      if (!this.src) {
        this._prepareVideoElement();
      }
      this.load();
    }
    if (this._engine) {
      this._playbackMiddleware.play(() => this._play());
    } else if (this._loadingMedia) {
      // load media requested but the response is delayed
      this._playbackMiddleware.play(() => this._playAfterAsyncMiddleware());
    } else {
      this.dispatchEvent(
        new FakeEvent(
          Html5EventType.ERROR,
          new PKError(PKError.Severity.CRITICAL, PKError.Category.PLAYER, PKError.Code.NO_SOURCE_PROVIDED, 'No Source Provided')
        )
      );
    }
  }

  /**
   * Pause playback.
   * @returns {void}
   * @public
   */
  pause(): void {
    if (this._engine) {
      this._playbackMiddleware.pause(this._pause.bind(this));
    }
  }

  /**
   * Gets the view of the player (i.e the dom container object).
   * @return {HTMLElement} - The dom container.
   * @public
   */
  getView(): HTMLElement {
    return this._el;
  }

  /**
   * @returns {HTMLVideoElement} - The video element.
   * @public
   */
  getVideoElement(): ?HTMLVideoElement {
    if (this._engine) {
      return this._engine.getVideoElement();
    }
  }

  /**
   * Resets the necessary components before change media.
   * @public
   * @returns {void}
   */
  reset(): void {
    if (this._reset) return;
    this.pause();
    //make sure all services are reset before engine and engine attributes are reset
    this._externalCaptionsHandler.reset();
    this._posterManager.reset();
    this._pluginManager.reset();
    this._stateManager.reset();
    this._config.sources = {};
    this._activeTextCues = [];
    this._updateTextDisplay([]);
    this._tracks = [];
    this._resetStateFlags();
    this._engineType = '';
    this._streamType = '';
    this._pendingSelectedVideoTrack = null;
    if (this._engine) {
      this._engine.reset();
    }
    this._showBlackCover();
    this._reset = true;
    this.dispatchEvent(new FakeEvent(CustomEventType.PLAYER_RESET));
    this._eventManager.removeAll();
    this._resizeWatcher.init(Utils.Dom.getElementById(this._playerId));
    this._createReadyPromise();
    this._isOnLiveEdge = false;
    this._shouldLoadAfterAttach = false;
  }

  /**
   * Destroys the player.
   * @returns {void}
   * @public
   */
  destroy(): void {
    if (this._destroyed) return;
    //make sure all services are destroyed before engine and engine attributes are destroyed
    this._externalCaptionsHandler.destroy();
    this._posterManager.destroy();
    this._pluginManager.destroy();
    this._stateManager.destroy();
    this._fullscreenController.destroy();
    this._clearRepositionTimeout();
    this._activeTextCues = [];
    this._textDisplaySettings = {};
    this._config = {};
    this._tracks = [];
    this._engineType = '';
    this._streamType = '';
    this._readyPromise = null;
    this._pendingSelectedVideoTrack = null;
    this._resetStateFlags();
    this._playbackAttributesState = {};
    if (this._engine) {
      this._engine.destroy();
    }
    this._resizeWatcher.destroy();
    if (this._el) {
      Utils.Dom.removeChild(this._el.parentNode, this._el);
    }
    this._destroyed = true;
    this.dispatchEvent(new FakeEvent(CustomEventType.PLAYER_DESTROY));
    this._eventManager.destroy();
  }

  /**
   * Attach the engine's media source
   * @private
   * @returns {void}
   */
  _attachMediaSource(): void {
    if (this._engine) {
      this._shouldLoadAfterAttach = true;
      this._engine.attachMediaSource();
      this._eventManager.listenOnce(this, Html5EventType.CAN_PLAY, () => {
        if (typeof this._playbackAttributesState.rate === 'number') {
          this.playbackRate = this._playbackAttributesState.rate;
        }
      });
    }
  }

  /**
   * detach the engine's media source
   * @private
   * @returns {void}
   */
  _detachMediaSource(): void {
    if (this._engine) {
      this.pause();
      this.hideTextTrack();
      this._shouldLoadAfterAttach = false;
      this._createReadyPromise();
      this._engine.detachMediaSource();
    }
  }

  /**
   * Get the first buffered range of the engine.
   * @returns {TimeRanges} - First buffered range of the engine in seconds.
   * @public
   */
  get buffered(): ?TimeRanges {
    if (this._engine) {
      return this._engine.buffered;
    }
    return null;
  }

  get stats(): PKStatsObject {
    let statsObject: PKStatsObject = {
      targetBuffer: NaN,
      availableBuffer: NaN
    };
    if (this._engine) {
      statsObject.targetBuffer = this._engine.targetBuffer;
      statsObject.availableBuffer = this._engine.availableBuffer;
    }

    return statsObject;
  }

  /**
   * Set the current time in seconds.
   * @param {Number} to - The number to set in seconds.
   * @public
   */
  set currentTime(to: number): void {
    if (this._engine) {
      if (Utils.Number.isNumber(to)) {
        let boundedTo = to;
        if (to < 0) {
          boundedTo = 0;
        }
        const safeDuration = this.isLive() ? this._engine.duration : this._engine.duration - DURATION_OFFSET;

        if (boundedTo > safeDuration) {
          boundedTo = safeDuration;
        }
        this._engine.currentTime = boundedTo;
      }
    }
  }

  /**
   * Get the current time in seconds.
   * @returns {?Number} - The playback current time.
   * @public
   */
  get currentTime(): ?number {
    if (this._engine) {
      return this._engine.currentTime;
    }
    return null;
  }

  /**
   * Get the duration in seconds.
   * @returns {?Number} - The playback duration.
   * @public
   */
  get duration(): ?number {
    if (this._engine) {
      return this._engine.duration;
    }
    return null;
  }

  /**
   * Set playback volume.
   * @param {Number} vol - The volume to set.
   * @returns {void}
   * @public
   */
  set volume(vol: number): void {
    if (this._engine) {
      if (Utils.Number.isFloat(vol) || vol === 0 || vol === 1) {
        let boundedVol = vol;
        if (boundedVol < 0) {
          boundedVol = 0;
        }
        if (boundedVol > 1) {
          boundedVol = 1;
        }
        this._engine.volume = boundedVol;
      }
    }
  }

  /**
   * Get playback volume.
   * @returns {?Number} - The playback volume.
   * @public
   */
  get volume(): ?number {
    if (this._engine) {
      return this._engine.volume;
    }
    return null;
  }

  /**
   * Get paused state.
   * @returns {?boolean} - Whether the video is paused or not.
   * @public
   */
  get paused(): ?boolean {
    if (this._engine) {
      return this._engine.paused;
    }
    return null;
  }

  /**
   * Get seeking state.
   * @returns {?boolean} - Whether the video is seeking or not.
   * @public
   */
  get seeking(): ?boolean {
    if (this._engine) {
      return this._engine.seeking;
    }
    return null;
  }

  /**
   * Set playsinline attribute.
   * Relevant for iOS 10 and up:
   * Elements will now be allowed to play inline, and will not automatically enter fullscreen mode when playback begins.
   * @param {boolean} playsinline - Whether the video should plays in line.
   */
  set playsinline(playsinline: boolean): void {
    if (this._engine) {
      this._engine.playsinline = playsinline;
    }
  }

  /**
   * Get playsinline attribute.
   * Relevant for iOS 10 and up:
   * Elements will now be allowed to play inline, and will not automatically enter fullscreen mode when playback begins.
   * @returns {boolean} - Whether the video plays in line.
   */
  get playsinline(): ?boolean {
    if (this._engine) {
      return this._engine.playsinline;
    }
    return null;
  }

  /**
   * Set player muted state.
   * @param {boolean} mute - The mute value.
   * @returns {void}
   * @public
   */
  set muted(mute: boolean): void {
    if (this._engine) {
      this._engine.muted = mute;
      this.dispatchEvent(new FakeEvent(CustomEventType.MUTE_CHANGE, {mute: mute}));
      if (mute === false) {
        this._fallbackToMutedAutoPlay = mute;
      }
    }
  }

  /**
   * Get player muted state.
   * @returns {?boolean} - Whether the video is muted or not.
   * @public
   */
  get muted(): ?boolean {
    if (this._engine) {
      return this._engine.muted;
    }
    return null;
  }

  /**
   * Get the player source.
   * @returns {?string} - The current source of the player.
   * @public
   */
  get src(): ?string {
    if (this._engine) {
      return this._engine.src;
    }
    return null;
  }

  /**
   * Get the dimensions of the player.
   * @returns {{width: number, height: number}} - The dimensions of the player.
   * @public
   */
  get dimensions(): Object {
    return {
      width: this._el.clientWidth,
      height: this._el.clientHeight
    };
  }

  /**
   * Get the poster source URL
   * @returns {string} - the poster image URL
   */
  get poster(): string {
    return this._posterManager.src;
  }

  /**
   * Sets the playbackRate property.
   * @param {number} rate - The playback speed of the video.
   */
  set playbackRate(rate: number): void {
    if (this._engine) {
      this._engine.playbackRate = rate;
    }
  }

  /**
   * Gets the current playback speed of the video.
   * @returns {number} - The current playback speed of the video.
   */
  get playbackRate(): ?number {
    if (this._engine) {
      return this._engine.playbackRate;
    }
    return null;
  }

  /**
   * Gets the possible playback speeds of the video.
   * @returns {Array<number>} - The possible playback speeds speed of the video.
   */
  get playbackRates(): Array<number> {
    if (this._playbackRates) {
      return this._playbackRates;
    } else if (this._engine) {
      return this._engine.playbackRates;
    }
    return [];
  }

  /**
   * Gets the default playback speed of the video.
   * @returns {number} - The default playback speed of the video.
   */
  get defaultPlaybackRate(): number {
    if (this._engine) {
      return this._engine.defaultPlaybackRate;
    }
    return 1;
  }

  /**
   * get the engine type
   * @returns {string} - html5
   */
  get engineType(): ?string {
    return this._engineType;
  }

  /**
   * get the stream type
   * @returns {string} - hls|dash|progressive
   */
  get streamType(): ?string {
    return this._streamType;
  }

  /**
   * Getter for the environment of the player instance.
   * @return {Object} - The current environment object.
   * @public
   */
  get env(): Object {
    return this._env;
  }

  /**
   * Get the player config.
   * @returns {Object} - A copy of the player configuration.
   * @public
   */
  get config(): Object {
    return Utils.Object.mergeDeep({}, this._config);
  }

  get uiComponents(): PKUIComponent[] {
    return [...this._uiComponents];
  }

  /**
   * Get whether the user already interacted with the player
   * @returns {boolean} - Whether the user interacted with the player
   * @public
   */
  get hasUserInteracted(): boolean {
    return this._hasUserInteracted;
  }

  /**
   * Set the _loadingMedia flag to inform the player that a load media request has sent.
   * @param {boolean} loading - Whether a load media request has sent.
   * @returns {void}
   * @public
   */
  set loadingMedia(loading: boolean): void {
    this._loadingMedia = loading;
  }

  /**
   * Set crossOrigin attribute.
   * @param {?string} crossOrigin - 'anonymous' or 'use-credentials'
   * anonymous: CORS requests for this element will not have the credentials flag set.
   * use-credentials: CORS requests for this element will have the credentials flag set; this means the request will provide credentials.
   */
  set crossOrigin(crossOrigin: ?string): void {
    if (this._engine) {
      this._engine.crossOrigin = crossOrigin;
    }
  }

  /**
   * Get crossOrigin attribute.
   * @returns {?string} - 'anonymous' or 'use-credentials'
   */
  get crossOrigin(): ?string {
    if (this._engine) {
      return this._engine.crossOrigin;
    }
    return null;
  }

  /**
   * Get ended attribute state.
   * @returns {?boolean} - Whether the media has been ended.
   */
  get ended(): ?boolean {
    if (this._engine) {
      return this._engine.ended;
    }
    return null;
  }

  // </editor-fold>

  // <editor-fold desc="Live API">

  /**
   * Checking if the current playback is live.
   * @function isLive
   * @returns {boolean} - Whether playback is live.
   * @public
   */
  isLive(): boolean {
    return !!(
      this._config.sources.type !== MediaType.VOD &&
      (this._config.sources.type === MediaType.LIVE || (this._engine && this._engine.isLive()))
    );
  }

  /**
   * Get whether the video is seeked to live edge in dvr
   * @returns {boolean} - Whether the video is seeked to live edge in dvr
   * @public
   */
  isOnLiveEdge(): boolean {
    return this._isOnLiveEdge;
  }

  /**
   * Checking if the current live playback has DVR window.
   * @function isDvr
   * @returns {boolean} - Whether live playback has DVR window.
   * @public
   */
  isDvr(): boolean {
    return this.isLive() && this._config.sources.dvr;
  }

  /**
   * Seeking to live edge.
   * @function seekToLiveEdge
   * @returns {void}
   * @public
   */
  seekToLiveEdge(): void {
    if (this._engine && this.isLive()) {
      this._engine.seekToLiveEdge();
      this._isOnLiveEdge = true;
    }
  }

  /**
   * Get the start time of DVR window in live playback in seconds.
   * @returns {Number} - start time of DVR window.
   * @public
   */
  getStartTimeOfDvrWindow(): number {
    return this._engine ? this._engine.getStartTimeOfDvrWindow() : 0;
  }

  // </editor-fold>

  // <editor-fold desc="Tracks API">

  /**
   * Returns the tracks according to the filter. if no filter given returns the all tracks.
   * @function getTracks
   * @template {Track | AudioTrack | TextTrack | VideoTrack} T
   * @param {string} [type] - a tracks filter, should be 'video', 'audio' or 'text'.
   * @returns {Array<T>} - The parsed tracks.
   * @public
   */
  getTracks<T: Track | AudioTrack | TextTrack | VideoTrack>(type?: $Values<typeof TrackType>): Array<T> {
    switch (type) {
      case TrackType.VIDEO:
        return Utils.Object.copyDeep(this._getVideoTracks());
      case TrackType.AUDIO:
        return Utils.Object.copyDeep(this._getAudioTracks());
      case TrackType.TEXT:
        return Utils.Object.copyDeep(this._getTextTracks());
      default:
        return Utils.Object.copyDeep(this._tracks);
    }
  }

  /**
   * Get an object includes the active video/audio/text tracks
   * @return {{video: VideoTrack, audio: AudioTrack, text: TextTrack}} - The active tracks object
   */
  getActiveTracks(): Object {
    return Utils.Object.copyDeep({
      video: this._getVideoTracks().find(track => track.active),
      audio: this._getAudioTracks().find(track => track.active),
      text: this._getTextTracks().find(track => track.active)
    });
  }

  /**
   * Select a track
   * @function selectTrack
   * @param {?Track} track - the track to select
   * @returns {void}
   * @public
   */
  selectTrack(track: ?Track): void {
    if (this._engine) {
      if (track instanceof VideoTrack) {
        if (this._playbackEnded) {
          this._pendingSelectedVideoTrack = track;
        } else {
          this._engine.selectVideoTrack(track);
        }
      } else if (track instanceof AudioTrack) {
        this._engine.selectAudioTrack(track);
      } else if (track instanceof TextTrack) {
        this._resetTextDisplay();
        if (track.language === OFF) {
          this.hideTextTrack();
          this._externalCaptionsHandler.hideTextTrack();
          this._playbackAttributesState.textLanguage = OFF;
        } else if (track.external && !this._config.playback.useNativeTextTrack) {
          this._engine.hideTextTrack();
          this._externalCaptionsHandler.selectTextTrack(track);
        } else {
          this._externalCaptionsHandler.hideTextTrack();
          this._engine.selectTextTrack(track);
        }
      }
    }
  }

  /**
   * Hide the text track
   * @function hideTextTrack
   * @returns {void}
   * @public
   */
  hideTextTrack(): void {
    if (this._engine) {
      this._engine.hideTextTrack();
      this._resetTextDisplay();
      const textTracks = this._getTextTracks();
      textTracks.map(track => (track.active = false));
      const textTrack = textTracks.find(track => track.language === OFF);
      if (textTrack) {
        textTrack.active = true;
        this.dispatchEvent(new FakeEvent(CustomEventType.TEXT_TRACK_CHANGED, {selectedTextTrack: textTrack}));
      }
    }
  }

  /**
   * Enables adaptive bitrate switching.
   * @function enableAdaptiveBitrate
   * @returns {void}
   * @public
   */
  enableAdaptiveBitrate(): void {
    if (this._engine) {
      this._engine.enableAdaptiveBitrate();
    }
  }

  /**
   * Checking if adaptive bitrate switching is enabled.
   * @function isAdaptiveBitrateEnabled
   * @returns {boolean} - Whether adaptive bitrate is enabled.
   * @public
   */
  isAdaptiveBitrateEnabled(): boolean {
    if (this._engine) {
      return this._engine.isAdaptiveBitrateEnabled();
    }
    return false;
  }

  /**
   * update the text display settings
   * @param {Object} settings - text cue display settings
   * @public
   * @returns {void}
   */
  setTextDisplaySettings(settings: Object): void {
    this._textDisplaySettings = settings;
    this._updateCueDisplaySettings();
    for (let i = 0; i < this._activeTextCues.length; i++) {
      this._activeTextCues[i].hasBeenReset = true;
    }
    this._updateTextDisplay(this._activeTextCues);
  }

  /**
   * Sets style attributes for text tracks.
   * @param {TextStyle} style - text styling settings
   * @returns {void}
   */
  set textStyle(style: TextStyle): void {
    if (!(style instanceof TextStyle)) {
      throw new Error('Style must be instance of TextStyle');
    }
    let element = Utils.Dom.getElementBySelector(`.${this._playerId}.${SUBTITLES_STYLE_CLASS_NAME}`);
    if (!element) {
      element = Utils.Dom.createElement('style');
      Utils.Dom.addClassName(element, this._playerId);
      Utils.Dom.addClassName(element, SUBTITLES_STYLE_CLASS_NAME);
      Utils.Dom.appendChild(document.head, element);
    }
    let sheet = element.sheet;

    while (sheet.cssRules.length) {
      sheet.deleteRule(0);
    }

    try {
      this._textStyle = style;
      if (this._config.playback.useNativeTextTrack) {
        sheet.insertRule(`#${this._playerId} video.${ENGINE_CLASS_NAME}::cue { ${style.toCSS()} }`, 0);
      } else if (this._engine) {
        this._engine.resetAllCues();
        this._externalCaptionsHandler.resetAllCues();
        this._updateTextDisplay(this._activeTextCues);
      }
      this.dispatchEvent(new FakeEvent(CustomEventType.TEXT_STYLE_CHANGED));
    } catch (e) {
      Player._logger.error(e.message);
    }
  }

  /**
   * Gets style attributes for text tracks.
   * @returns {?TextStyle} - the current style attribute
   */
  get textStyle(): ?TextStyle {
    return this._textStyle.clone();
  }

  // </editor-fold>

  // <editor-fold desc="Ads API">

  /**
   * Gets the ads controller.
   * @returns {?AdsController} - the ads controller
   */
  get ads(): ?AdsController {
    return this._adsController;
  }

  // </editor-fold>

  // <editor-fold desc="Fullscreen API">
  /**
   * @returns {boolean} - Whether the player is in fullscreen mode.
   * @public
   */
  isFullscreen(): boolean {
    return this._fullscreenController.isFullscreen();
  }

  /**
   * Notify the player that the ui application entered to fullscreen.
   * @public
   * @returns {void}
   */
  notifyEnterFullscreen(): void {
    if (this.isFullscreen()) {
      this.dispatchEvent(new FakeEvent(CustomEventType.ENTER_FULLSCREEN));
    }
  }

  /**
   * Notify the player that the ui application exited from fullscreen.
   * @public
   * @returns {void}
   */
  notifyExitFullscreen(): void {
    if (!this.isFullscreen()) {
      this.dispatchEvent(new FakeEvent(CustomEventType.EXIT_FULLSCREEN));
    }
  }

  /**
   * Request the player to enter fullscreen.
   * @public
   * @param {string} elementId - element id to full screen
   * @returns {void}
   */
  enterFullscreen(elementId: ?string): void {
    this._fullscreenController.enterFullscreen(elementId);
  }

  /**
   * Request the player to exit fullscreen.
   * @public
   * @returns {void}
   */
  exitFullscreen(): void {
    this._fullscreenController.exitFullscreen();
  }

  // </editor-fold>

  // <editor-fold desc="Picture In Picture API">

  /**
   * Request the player to enter picture in picture mode
   * @public
   * @returns {void}
   */
  enterPictureInPicture(): void {
    if (this.isFullscreen()) {
      this.exitFullscreen();
    }
    if (!this._engine.isInPictureInPicture) {
      this._engine.enterPictureInPicture();
    }
  }

  /**
   * Request the player to exit picture in picture mode
   * @public
   * @returns {void}
   */
  exitPictureInPicture(): void {
    if (this._engine.isInPictureInPicture) {
      this._engine.exitPictureInPicture();
    }
  }

  /**
   * Check if the player is in picture in picture mode
   * @public
   * @return {boolean} if the player is in picture in picture mode or not
   */
  isInPictureInPicture(): boolean {
    return this._engine.isInPictureInPicture;
  }

  /**
   * Check if picture in picture supported in this environment
   * @public
   * @return {boolean} if the picture in picture feature is supported in this environment
   */
  isPictureInPictureSupported(): boolean {
    return !!this._config.playback.pictureInPicture && this._engine.isPictureInPictureSupported();
  }

  // </editor-fold>

  // <editor-fold desc="VR API">

  /**
   * Checking if the selected source is VR.
   * @returns {boolean} - Whether is VR.
   * @public
   */
  isVr(): boolean {
    return !!this._config.sources.vr;
  }

  /**
   * Toggling the VR mode
   * @returns {void}
   * @public
   */
  toggleVrStereoMode(): void {
    const vrPlugin: ?BasePlugin = this._pluginManager.get('vr');
    // $FlowFixMe - remove once we move plugins to kaltura player
    if (vrPlugin && typeof vrPlugin.toggleVrStereoMode === 'function') {
      //$FlowFixMe
      vrPlugin.toggleVrStereoMode();
    }
  }

  /**
   * Checking if the VR stereo mode is active.
   * @returns {boolean} - Whether is active.
   * @public
   */
  isInVrStereoMode(): boolean {
    const vrPlugin: ?BasePlugin = this._pluginManager.get('vr');
    // $FlowFixMe - remove once we move plugins to kaltura player
    if (vrPlugin && typeof vrPlugin.isInStereoMode === 'function') {
      //$FlowFixMe
      return vrPlugin.isInStereoMode();
    }
    return false;
  }

  // </editor-fold>

  // <editor-fold desc="Logger API">

  /**
   * get the log level
   * @param {?string} name - the logger name
   * @returns {Object} - the log level
   */
  getLogLevel(name?: string): Object {
    return getLogLevel(name);
  }

  /**
   * sets the logger level
   * @param {Object} level - the log level
   * @param {?string} name - the logger name
   * @returns {void}
   */
  setLogLevel(level: Object, name?: string) {
    setLogLevel(level, name);
  }

  // </editor-fold>

  // <editor-fold desc="Plugins API">

  /**
   * Gets the plugins instances.
   * @returns {Object} - Plugin name to plugin instance object map.
   */
  get plugins(): {[name: string]: BasePlugin} {
    return this._pluginManager.getAll();
  }

  // </editor-fold>

  // </editor-fold>

  // <editor-fold desc="Private Methods">

  // <editor-fold desc="Playback">

  /**
   * Remove the current text track from the player view.
   * @returns {void}
   * @private
   */
  _resetTextDisplay(): void {
    this._activeTextCues = [];
    this._updateTextDisplay([]);
  }

  /**
   * For browsers which block auto play, use the user gesture to open the video element and enable playing via API.
   * @returns {void}
   * @private
   */
  _prepareVideoElement(): void {
    EngineProvider.getEngines().forEach((Engine: IEngineStatic) => {
      Engine.prepareVideoElement(this._playerId);
    });
  }

  /**
   * Set the config level of the player
   * @returns {void}
   * @param {Object} config - object containing the log level.
   * @private
   */
  _setConfigLogLevel(config: Object): void {
    if (config.log && config.log.level && LogLevel[config.log.level]) {
      setLogLevel(LogLevel[config.log.level]);
    }
    if (config.log && typeof config.log.handler === 'function') {
      setLogHandler(config.log.handler);
    }
  }

  /**
   * Check if sources has been received.
   * @param {Object} sources - sources config object.
   * @returns {boolean} - Whether sources has been received to the player.
   * @private
   */
  _hasSources(sources: Object): boolean {
    if (sources) {
      return !!Object.values(StreamType).find(type => sources[type] && sources[type].length > 0);
    }
    return false;
  }

  /**
   * Creates the player container.
   * @private
   * @returns {void}
   */
  _createPlayerContainer(): void {
    const el = (this._el = Utils.Dom.createElement('div'));
    Utils.Dom.addClassName(el, CONTAINER_CLASS_NAME);
    Utils.Dom.setAttribute(el, 'id', this._playerId);
    Utils.Dom.setAttribute(el, 'tabindex', '-1');
  }

  /**
   * Appends the engine's video element to the player's div container.
   * @private
   * @returns {void}
   */
  _appendEngineEl(): void {
    if (this._el) {
      const engineEl = this._engine.getVideoElement();
      const className = `${ENGINE_CLASS_NAME}`;
      Utils.Dom.addClassName(engineEl, className);
      const classNameWithId = `${ENGINE_CLASS_NAME}-${this._engine.id}`;
      Utils.Dom.addClassName(engineEl, classNameWithId);
      Utils.Dom.prependTo(engineEl, this._el);
    }
  }

  /**
   * Appends DOM elements by the following priority:
   * 1. poster (strongest)
   * 2. black screen
   * 3. subtitles (weakest)
   * @private
   * @returns {void}
   */
  _appendDomElements(): void {
    // Append playkit-subtitles
    this._textDisplayEl = Utils.Dom.createElement('div');
    Utils.Dom.setAttribute(this._textDisplayEl, 'aria-live', 'polite');
    Utils.Dom.addClassName(this._textDisplayEl, SUBTITLES_CLASS_NAME);
    Utils.Dom.appendChild(this._el, this._textDisplayEl);
    // Append playkit-black-cover
    this._blackCoverEl = Utils.Dom.createElement('div');
    Utils.Dom.addClassName(this._blackCoverEl, BLACK_COVER_CLASS_NAME);
    Utils.Dom.appendChild(this._el, this._blackCoverEl);
    // Append playkit-poster
    const el = this._posterManager.getElement();
    Utils.Dom.addClassName(el, POSTER_CLASS_NAME);
    Utils.Dom.appendChild(this._el, el);
  }

  /**
   * Configures or load the plugins defined in the configuration.
   * @param {Object} plugins - The new received plugins configuration.
   * @private
   * @returns {void}
   */
  _configureOrLoadPlugins(plugins: Object = {}): void {
    if (plugins) {
      const middlewares = [];
      const uiComponents = [];
      Object.keys(plugins).forEach(name => {
        // If the plugin is already exists in the registry we are updating his config
        const plugin = this._pluginManager.get(name);
        if (plugin) {
          plugin.updateConfig(plugins[name]);
          this._config.plugins[name] = plugin.getConfig();
        } else {
          // We allow to load plugins as long as the player has no engine
          if (!this._engine) {
            try {
              this._pluginManager.load(name, this, plugins[name]);
            } catch (error) {
              //bounce the plugin load error up
              this.dispatchEvent(new FakeEvent(Html5EventType.ERROR, error));
            }
            let plugin = this._pluginManager.get(name);
            if (plugin) {
              this._config.plugins[name] = plugin.getConfig();
              if (typeof plugin.getMiddlewareImpl === 'function') {
                // push the bumper middleware to the end, to play the bumper right before the content
                let middleware = plugin.getMiddlewareImpl();
                if (middleware) {
                  plugin.name === 'bumper' ? middlewares.push(middleware) : middlewares.unshift(middleware);
                }
              }

              if (typeof plugin.getUIComponents === 'function') {
                uiComponents.push(...(plugin.getUIComponents() || []));
              }
            }
          } else {
            delete this._config.plugins[name];
          }
        }
      });
      this._uiComponents = uiComponents;
      middlewares.forEach(middleware => this._playbackMiddleware.use(middleware));
    }
  }

  /**
   * Creates the ready promise.
   * @private
   * @returns {void}
   */
  _createReadyPromise(): void {
    this._readyPromise = new Promise((resolve, reject) => {
      this._eventManager.listenOnce(this, CustomEventType.TRACKS_CHANGED, () => {
        this.dispatchEvent(new FakeEvent(CustomEventType.MEDIA_LOADED));
        resolve();
      });
      this._eventManager.listen(this, Html5EventType.ERROR, (event: FakeEvent) => {
        if (event.payload.severity === PKError.Severity.CRITICAL) {
          reject();
        }
      });
    }).catch(() => {
      // silence the promise rejection, error is handled by the error event
    });
  }

  /**
   * Selects an engine to play a source according to a given stream priority.
   * @return {boolean} - Whether a proper engine was found to play the given sources
   * according to the priority.
   * @private
   */
  _selectEngineByPriority(): boolean {
    const streamPriority = this._config.playback.streamPriority;
    const preferNative = this._config.playback.preferNative;
    const sources = this._config.sources;
    for (let priority of streamPriority) {
      const engineId = typeof priority.engine === 'string' ? priority.engine.toLowerCase() : '';
      const format = typeof priority.format === 'string' ? priority.format.toLowerCase() : '';
      const Engine = EngineProvider.getEngines().find(Engine => Engine.id === engineId);
      if (Engine) {
        const formatSources = sources[format];
        if (formatSources && formatSources.length > 0) {
          const source = formatSources[0];
          if (Engine.canPlaySource(source, preferNative[format], this._config.drm)) {
            Player._logger.debug('Source selected: ', formatSources);
            this._loadEngine(Engine, source);
            this._engineType = engineId;
            this._streamType = format;
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Loads the selected engine.
   * @param {IEngineStatic} Engine - The selected engine.
   * @param {PKMediaSourceObject} source - The selected source object.
   * @private
   * @returns {void}
   */
  _loadEngine(Engine: IEngineStatic, source: PKMediaSourceObject) {
    if (!this._engine) {
      this._createEngine(Engine, source);
      this._appendEngineEl();
    } else {
      if (this._engine.id === Engine.id) {
        // The restoring must be done by the engine itself not by the proxy (engine decorator is exists) to make sure the engine events fired by the engine itself.
        this._engine.restore.call(this._engine._engine || this._engine, source, this._config);
      } else {
        this._engine.destroy();
        this._createEngine(Engine, source);
        this._appendEngineEl();
      }
    }
  }

  /**
   * Creates an engine or an engine decorator.
   * @param {IEngine} Engine - The selected engine.
   * @param {PKMediaSourceObject} source - The selected source object.
   * @returns {void}
   * @private
   */
  _createEngine(Engine: IEngineStatic, source: PKMediaSourceObject): void {
    const engine = Engine.createEngine(source, this._config, this._playerId);
    const plugins = (Object.values(this._pluginManager.getAll()): any);
    this._engine = EngineDecorator.getDecorator(engine, plugins) || engine;
  }

  /**
   * Listen to all HTML5 defined events and trigger them on the player
   * @private
   * @returns {void}
   */
  _attachMedia(): void {
    if (this._engine) {
      Object.keys(Html5EventType).forEach(html5Event => {
        this._eventManager.listen(this._engine, Html5EventType[html5Event], (event: FakeEvent) => {
          return this.dispatchEvent(event);
        });
      });
      this._eventManager.listen(this._engine, Html5EventType.SEEKING, () => {
        if (this.isLive()) {
          this._isOnLiveEdge = this.duration && this.currentTime ? this.currentTime >= this.duration - LIVE_EDGE_THRESHOLD && !this.paused : false;
        }
      });
      this._eventManager.listen(this._engine, Html5EventType.SEEKED, () => {
        const browser = this._env.browser.name;
        if (browser === 'Edge' || browser === 'IE') {
          this._removeTextCuePatch();
        }
      });
      this._eventManager.listen(this._engine, CustomEventType.VIDEO_TRACK_CHANGED, (event: FakeEvent) => {
        this._markActiveTrack(event.payload.selectedVideoTrack);
        return this.dispatchEvent(event);
      });
      this._eventManager.listen(this._engine, CustomEventType.AUDIO_TRACK_CHANGED, (event: FakeEvent) => {
        this.ready().then(() => (this._playbackAttributesState.audioLanguage = event.payload.selectedAudioTrack.language));
        this._markActiveTrack(event.payload.selectedAudioTrack);
        this.dispatchEvent(event);
      });
      this._eventManager.listen(this._engine, CustomEventType.TEXT_TRACK_CHANGED, (event: FakeEvent) => this._onTextTrackChanged(event));
      this._eventManager.listen(this._engine, CustomEventType.TRACKS_CHANGED, (event: FakeEvent) => this._onTracksChanged(event));
      this._eventManager.listen(this._engine, CustomEventType.TEXT_CUE_CHANGED, (event: FakeEvent) => this._onCueChange(event));
      this._eventManager.listen(this._engine, CustomEventType.ABR_MODE_CHANGED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._engine, CustomEventType.TIMED_METADATA, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._engine, CustomEventType.PLAY_FAILED, (event: FakeEvent) => {
        this.pause();
        this._onPlayFailed(event);
        this.dispatchEvent(event);
      });
      this._eventManager.listen(this, AdEventType.AD_AUTOPLAY_FAILED, (event: FakeEvent) => this._onPlayFailed(event));
      this._eventManager.listen(this._engine, CustomEventType.FPS_DROP, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._engine, CustomEventType.FRAG_LOADED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._engine, CustomEventType.DRM_LICENSE_LOADED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this._engine, CustomEventType.MANIFEST_LOADED, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this, Html5EventType.PLAY, this._onPlay.bind(this));
      this._eventManager.listen(this, Html5EventType.PAUSE, this._onPause.bind(this));
      this._eventManager.listen(this, Html5EventType.PLAYING, this._onPlaying.bind(this));
      this._eventManager.listen(this, Html5EventType.ENDED, this._onEnded.bind(this));
      this._eventManager.listen(this, CustomEventType.PLAYBACK_ENDED, this._onPlaybackEnded.bind(this));
      this._eventManager.listen(this, CustomEventType.MUTE_CHANGE, () => {
        this._playbackAttributesState.muted = this.muted;
      });
      this._eventManager.listen(this, Html5EventType.VOLUME_CHANGE, () => {
        this._playbackAttributesState.volume = this.volume;
      });
      this._eventManager.listen(this, Html5EventType.RATE_CHANGE, () => {
        this._playbackAttributesState.rate = this.playbackRate;
      });
      this._eventManager.listen(this, CustomEventType.ENTER_FULLSCREEN, () => this._resetTextCuesAndReposition());
      this._eventManager.listen(this, CustomEventType.EXIT_FULLSCREEN, () => this._resetTextCuesAndReposition());
      this._eventManager.listen(this._resizeWatcher, CustomEventType.RESIZE, (event: FakeEvent) => {
        this._resetTextCuesAndReposition();
        this.dispatchEvent(event);
      });
      this._eventManager.listen(this._engine, CustomEventType.MEDIA_RECOVERED, () => this._handleRecovered());
      this._eventManager.listen(this._externalCaptionsHandler, CustomEventType.TEXT_CUE_CHANGED, (event: FakeEvent) => this._onCueChange(event));
      this._eventManager.listen(this._externalCaptionsHandler, CustomEventType.TEXT_TRACK_CHANGED, (event: FakeEvent) =>
        this._onTextTrackChanged(event)
      );
      this._eventManager.listen(this._externalCaptionsHandler, Html5EventType.ERROR, (event: FakeEvent) => this.dispatchEvent(event));
      this._eventManager.listen(this, AdEventType.AD_STARTED, () => {
        if (this._firstPlay) {
          this._posterManager.hide();
          this._hideBlackCover();
        }
      });
      if (this.config.playback.playAdsWithMSE) {
        this._eventManager.listen(this, AdEventType.AD_LOADED, (event: FakeEvent) => {
          if (event.payload.ad.linear) {
            this._detachMediaSource();
          }
        });
        this._eventManager.listen(this, AdEventType.AD_BREAK_END, this._attachMediaSource);
        this._eventManager.listen(this, AdEventType.AD_ERROR, this._attachMediaSource);
      }
      const rootElement = Utils.Dom.getElementBySelector(`#${this.config.targetId}`);
      if (rootElement) {
        this._eventManager.listen(
          rootElement,
          'click',
          () => {
            this._hasUserInteracted = true;
            this.dispatchEvent(new FakeEvent(CustomEventType.USER_GESTURE));
          },
          {capture: true}
        );
      }
    }
  }

  /**
   * if the media was recovered (after a media failure) then initiate play again (if that was the state before)
   * @returns {void}
   * @private
   */
  _handleRecovered(): void {
    if (this._stateManager.currentState.type === StateType.PLAYING) {
      this.play();
    }
  }

  /**
   * The text track changed event object
   * @param {FakeEvent} event - payload with text track
   * @returns {void}
   * @private
   */
  _onTextTrackChanged(event: FakeEvent): void {
    this.ready().then(() => (this._playbackAttributesState.textLanguage = event.payload.selectedTextTrack.language));
    this._markActiveTrack(event.payload.selectedTextTrack);
    if (this._config.playback.useNativeTextTrack) {
      this._externalCaptionsHandler.selectTextTrack(event.payload.selectedTextTrack);
    }
    this.dispatchEvent(event);
  }

  /**
   * Reset the active cues hasBeenReset = true and then reposition it, timeout here is for the screen to
   * finish render the fullscreen
   * @returns {void}
   * @private
   */
  _resetTextCuesAndReposition(): void {
    this._engine.resetAllCues();
    this._updateTextDisplay([]);
    for (let i = 0; i < this._activeTextCues.length; i++) {
      this._activeTextCues[i].hasBeenReset = true;
    }
    // handling only the last reposition
    this._clearRepositionTimeout();
    this._repositionCuesTimeout = setTimeout(() => {
      this._updateTextDisplay(this._activeTextCues);
      this._repositionCuesTimeout = false;
    }, REPOSITION_CUES_TIMEOUT);
  }

  _clearRepositionTimeout() {
    if (this._repositionCuesTimeout) {
      clearTimeout(this._repositionCuesTimeout);
    }
  }

  /**
   * Handles the cue text removal issue, when seeking to a time without captions in IE \ edge the previous captions
   * are not removed
   * @returns {void}
   * @private
   */
  _removeTextCuePatch(): void {
    let filteredActiveTextCues = this._activeTextCues.filter(textCue => {
      const cueEndTime = textCue._endTime;
      const cueStartTime = textCue._startTime;
      const currTime = this.currentTime;
      if (currTime < cueEndTime && currTime > cueStartTime) {
        return textCue;
      }
    });
    this._updateTextDisplay(filteredActiveTextCues);
  }

  /**
   * Handles the playback options, from current state or config.
   * @returns {void}
   * @private
   */
  _handlePlaybackOptions(): void {
    this._config.playback = this._config.playback || {};
    if (typeof this._playbackAttributesState.muted === 'boolean') {
      this.muted = this._playbackAttributesState.muted;
    } else if (typeof this._config.playback.muted === 'boolean') {
      this.muted = this._config.playback.muted;
    }
    if (typeof this._playbackAttributesState.volume === 'number') {
      this.volume = this._playbackAttributesState.volume;
    } else if (typeof this._config.playback.volume === 'number') {
      this.volume = this._config.playback.volume;
    }
    if (typeof this._config.playback.playsinline === 'boolean') {
      this.playsinline = this._config.playback.playsinline;
    }
    if (typeof this._config.playback.crossOrigin === 'string') {
      this.crossOrigin = this._config.playback.crossOrigin;
    }
    if (Array.isArray(this._config.playback.playbackRates)) {
      const validPlaybackRates = this._config.playback.playbackRates
        .filter((number, index, self) => number > 0 && number <= 16 && self.indexOf(number) === index)
        .sort((a, b) => a - b);
      if (validPlaybackRates) {
        this._playbackRates = validPlaybackRates;
      }
    }
  }

  /**
   * Handles preload.
   * @returns {void}
   * @private
   */
  _handlePreload(): void {
    if (this._config.playback.preload === 'auto' && !this._config.playback.autoplay) {
      this.load();
    }
  }

  /**
   * Handles auto play.
   * @returns {void}
   * @private
   */
  _handleAutoPlay(): void {
    if (this._config.playback.autoplay === true) {
      const allowMutedAutoPlay = this._config.playback.allowMutedAutoPlay;
      Player.getCapabilities(this.engineType).then(capabilities => {
        if (capabilities.autoplay) {
          onAutoPlay();
        } else {
          if (capabilities.mutedAutoPlay) {
            if (this.muted && !this._fallbackToMutedAutoPlay) {
              onMutedAutoPlay();
            } else if (allowMutedAutoPlay) {
              onFallbackToMutedAutoPlay();
            } else {
              onAutoPlayFailed();
            }
          } else {
            onAutoPlayFailed();
          }
        }
      });
    } else {
      this._posterManager.show();
    }

    const onAutoPlay = () => {
      Player._logger.debug('Start autoplay');
      // If the previous state was fallback to muted autoplay:
      // unmute the player and clear the fallback state
      if (this._fallbackToMutedAutoPlay) {
        this._fallbackToMutedAutoPlay = false;
        this.muted = false;
      }
      this.play();
    };

    const onMutedAutoPlay = () => {
      Player._logger.debug('Start muted autoplay');
      this.play();
    };

    const onFallbackToMutedAutoPlay = () => {
      Player._logger.debug('Fallback to muted autoplay');
      this._fallbackToMutedAutoPlay = true;
      this.muted = true;
      this.dispatchEvent(new FakeEvent(CustomEventType.FALLBACK_TO_MUTED_AUTOPLAY));
      this.play();
    };

    const onAutoPlayFailed = () => {
      Player._logger.warn('Autoplay failed, pause player');
      this._posterManager.show();
      this.load();
      this.ready().then(() => this.pause());
      this.dispatchEvent(new FakeEvent(CustomEventType.AUTOPLAY_FAILED));
    };
  }

  _maybeCreateAdsController(): void {
    if (!this._adsController) {
      const adsPluginControllers = this._controllerProvider.getAdsControllers();
      if (adsPluginControllers.length) {
        this._adsController = new AdsController(this, adsPluginControllers);
        this._eventManager.listen(this._adsController, AdEventType.ALL_ADS_COMPLETED, (event: FakeEvent) => {
          this.dispatchEvent(event);
        });
      }
    }
  }

  /**
   * Play after async ads
   * @private
   * @returns {void}
   */
  _playAfterAsyncMiddleware(): void {
    if (this._engine) {
      this._play();
    } else {
      this._eventManager.listenOnce(this, CustomEventType.SOURCE_SELECTED, () => this._play());
    }
  }

  _load(): void {
    const resetFlags = () => {
      this._loading = false;
      this._reset = false;
    };
    if (this._engine && !this.src && !this._loading) {
      this._loading = true;
      let startTime = this._config.playback.startTime;
      this._engine
        .load(startTime)
        .then(data => {
          if (this.isLive() && (startTime === -1 || startTime >= this.duration)) {
            this._isOnLiveEdge = true;
          }
          this._updateTracks(data.tracks);
          this.dispatchEvent(new FakeEvent(CustomEventType.TRACKS_CHANGED, {tracks: this._tracks}));
          resetFlags();
        })
        .catch(error => {
          this.dispatchEvent(new FakeEvent(Html5EventType.ERROR, error));
          resetFlags();
        });
    }
  }

  /**
   * Start/resume the engine playback.
   * @private
   * @returns {void}
   */
  _play(): void {
    if (this._shouldLoadAfterAttach) {
      this._load();
      this._shouldLoadAfterAttach = false;
    }
    this.ready()
      .then(() => {
        const liveOrDvrOutOfDvrWindow = (this.isLive() && (!this.isDvr() || (typeof this.currentTime === 'number' && this.currentTime < 0)));
        if (!this._adsController.isAdBreak() && liveOrDvrOutOfDvrWindow) {
          this.seekToLiveEdge();
        }
        this._engine.play();
      })
      .catch(error => {
        this.dispatchEvent(new FakeEvent(Html5EventType.ERROR, error));
      });
  }

  /**
   * Starts the engine pause.
   * @private
   * @returns {void}
   */
  _pause(): void {
    this._engine.pause();
  }

  /**
   * @function _onPause
   * @return {void}
   * @private
   */
  _onPause(): void {
    this._isOnLiveEdge = false;
  }

  /**
   * @function _onPlay
   * @return {void}
   * @private
   */
  _onPlay(): void {
    if (this._firstPlay) {
      this._firstPlay = false;
      this.dispatchEvent(new FakeEvent(CustomEventType.FIRST_PLAY));
      this._posterManager.hide();
      this._hideBlackCover();
      if (typeof this._playbackAttributesState.rate === 'number') {
        this.playbackRate = this._playbackAttributesState.rate;
      }
    }
  }

  /**
   * @function _onPlaying
   * @return {void}
   * @private
   */
  _onPlaying(): void {
    if (!this._firstPlaying) {
      this._firstPlaying = true;
      this.dispatchEvent(new FakeEvent(CustomEventType.FIRST_PLAYING));
    }
    if (this._engine && this._pendingSelectedVideoTrack) {
      this._engine.selectVideoTrack(this._pendingSelectedVideoTrack);
      this._pendingSelectedVideoTrack = null;
    }
  }

  /**
   * @function _onPlayFailed
   * @param {FakeEvent} event - the play failed event
   * @return {void}
   * @private
   */
  _onPlayFailed(event: FakeEvent): void {
    if (this._firstPlay && this._config.playback.autoplay) {
      this._posterManager.show();
      this.dispatchEvent(new FakeEvent(CustomEventType.AUTOPLAY_FAILED, event.payload));
    }
  }

  /**
   * Hides the black cover div.
   * @private
   * @returns {void}
   */
  _hideBlackCover(): void {
    if (this._blackCoverEl) {
      this._blackCoverEl.style.visibility = 'hidden';
    }
  }

  /**
   * Shows the black cover div.
   * @private
   * @returns {void}
   */
  _showBlackCover(): void {
    if (this._blackCoverEl) {
      this._blackCoverEl.style.visibility = 'visible';
    }
  }

  /**
   * @function _onEnded
   * @return {void}
   * @private
   */
  _onEnded(): void {
    if (this._adsController && !this._adsController.allAdsCompleted) {
      this._eventManager.listenOnce(this._adsController, AdEventType.ALL_ADS_COMPLETED, () => {
        this.dispatchEvent(new FakeEvent(CustomEventType.PLAYBACK_ENDED));
      });
    } else {
      // Make sure the all ENDED listeners have been invoked
      setTimeout(() => this.dispatchEvent(new FakeEvent(CustomEventType.PLAYBACK_ENDED)), 0);
    }
    if (!this.paused) {
      this._pause();
    }
  }

  /**
   * @function _onPlaybackEnded
   * @return {void}
   * @private
   */
  _onPlaybackEnded(): void {
    if (this.config.playback.loop) {
      this.currentTime = 0;
      this.play();
    } else {
      this._playbackEnded = true;
    }
  }

  /**
   * Resets the state flags of the player.
   * @returns {void}
   * @private
   */
  _resetStateFlags(): void {
    this._loading = false;
    this._firstPlay = true;
    this._loadingMedia = false;
    this._playbackStart = false;
    this._playbackEnded = false;
    this._firstPlaying = false;
  }

  /**
   * @returns {Object} - The default configuration of the player.
   * @private
   * @static
   */
  static get _defaultConfig(): Object {
    return Utils.Object.copyDeep(DefaultConfig);
  }

  // </editor-fold>

  // <editor-fold desc="Tracks">

  /**
   * handle tracks change
   * @param {FakeEvent} event - the tracks change event payload
   * @private
   * @returns {void}
   */
  _onTracksChanged(event: FakeEvent): void {
    this._updateTracks(event.payload.tracks);
    this.dispatchEvent(event);
  }

  /**
   * update the player tracks
   * @param {Array<Track>} tracks - the player tracks
   * @private
   * @returns {void}
   */
  _updateTracks(tracks: Array<Track>): void {
    Player._logger.debug('Tracks changed', tracks);
    this._tracks = tracks.concat(this._externalCaptionsHandler.getExternalTracks(tracks));
    this._addTextTrackOffOption();
    this._maybeSetTracksLabels();
    this._maybeAdjustTextTracksIndexes();
    this._setDefaultTracks();
  }

  /**
   * If we added external tracks to the video element, we might need to adjust the text tracks indexes between the video
   * element and the players tracks list
   * @returns {void}
   * @private
   */
  _maybeAdjustTextTracksIndexes(): void {
    if (this._config.playback.useNativeTextTrack) {
      const getNativeLanguageTrackIndex = (textTrack: Track): number => {
        const videoElement = this.getVideoElement();
        return videoElement ? Array.from(videoElement.textTracks).findIndex(track => (track ? track.language === textTrack.language : false)) : -1;
      };
      this._getTextTracks().forEach(track => (track.index = getNativeLanguageTrackIndex(track)));
    }
  }

  /**
   * Returns the tracks according to a type.
   * @function _getTextTracks
   * @template {TextTrack | AudioTrack | VideoTrack} T
   * @param {T} [type] - a tracks type filter.
   * @returns {Array<T>} - The parsed tracks.
   * @private
   */
  _getTracksByType<T: TextTrack | AudioTrack | VideoTrack>(type: T): Array<T> {
    return this._tracks.reduce((arr, track) => {
      if (track instanceof type) {
        arr.push(track);
      }
      return arr;
    }, ([]: Array<T>));
  }

  /**
   * Returns the text tracks.
   * @function _getTextTracks
   * @returns {Array<TextTrack>} - The text tracks.
   * @private
   */
  _getTextTracks(): Array<TextTrack> {
    return this._getTracksByType<TextTrack>(TextTrack);
  }

  /**
   * Returns the video tracks.
   * @function _getVideoTracks
   * @returns {Array<VideoTrack>} - The video tracks.
   * @private
   */
  _getVideoTracks(): Array<VideoTrack> {
    return this._getTracksByType<VideoTrack>(VideoTrack);
  }

  /**
   * Returns the audio tracks.
   * @function _getAudioTracks
   * @returns {Array<AudioTrack>} - The audio tracks.
   * @private
   */
  _getAudioTracks(): Array<AudioTrack> {
    return this._getTracksByType<AudioTrack>(AudioTrack);
  }

  /**
   * Mark the selected track as active
   * @function _markActiveTrack
   * @param {Track} track - the track to mark
   * @returns {void}
   * @private
   */
  _markActiveTrack(track: Track): void {
    let tracks;
    if (track instanceof VideoTrack) {
      tracks = this._getVideoTracks();
    } else if (track instanceof AudioTrack) {
      tracks = this._getAudioTracks();
    } else if (track instanceof TextTrack) {
      tracks = this._getTextTracks();
    }
    if (tracks) {
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].active = track.index === tracks[i].index;
      }
    }
  }

  /**
   * handle text cue change
   * @param {FakeEvent} event - the cue change event payload
   * @private
   * @returns {void}
   */
  _onCueChange(event: FakeEvent): void {
    Player._logger.debug('Text cue changed', event.payload.cues);
    this._activeTextCues = event.payload.cues;
    this._updateCueDisplaySettings();
    this._updateTextDisplay(this._activeTextCues);
  }

  /**
   * update the text cue display settings
   * @private
   * @returns {void}
   */
  _updateCueDisplaySettings(): void {
    const activeCues = this._activeTextCues;
    const settings = this._textDisplaySettings;
    for (let i = 0; i < activeCues.length; i++) {
      let cue = activeCues[i];
      for (let name in settings) {
        cue[name] = settings[name];
      }
    }
  }

  /**
   * update the text display
   * @param {Array<Cue>} cues - list of cues
   * @private
   * @returns {void}
   */
  _updateTextDisplay(cues: Array<Cue>): void {
    if (!this._config.playback.useNativeTextTrack) {
      processCues(window, cues, this._textDisplayEl, this._textStyle);
    }
  }

  /**
   * Add off text track if there are actual text tracks associated with media
   * setting this track is the same as calling Player's hideTextTrack
   * @private
   * @returns {void}
   */
  _addTextTrackOffOption(): void {
    const textTracks = this._getTextTracks();
    if (textTracks && textTracks.length) {
      this._tracks.push(
        new TextTrack({
          active: false,
          index: textTracks.length,
          kind: 'subtitles',
          label: 'Off',
          language: OFF
        })
      );
    }
  }

  /**
   * Sets the default tracks defined in the player config.
   * @returns {void}
   * @private
   */
  _setDefaultTracks(): void {
    const activeTracks = this.getActiveTracks();
    const playbackConfig = this.config.playback;
    const offTextTrack: ?Track = this._getTextTracks().find(track => TextTrack.langComparer(OFF, track.language));
    let currentOrConfiguredTextLang = this._playbackAttributesState.textLanguage || this._getLanguage(playbackConfig.textLanguage, activeTracks.text);
    let currentOrConfiguredAudioLang = this._playbackAttributesState.audioLanguage || playbackConfig.audioLanguage;
    this._setDefaultTrack<TextTrack>(this._getTextTracks(), currentOrConfiguredTextLang, offTextTrack);
    this._setDefaultTrack<AudioTrack>(this._getAudioTracks(), currentOrConfiguredAudioLang, activeTracks.audio);
  }

  /**
   * Gets the track language that should be set by default.
   * @param {string} configuredLanguage - The configured language (can be also "auto").
   * @param {?TextTrack} defaultTrack - The default track.
   * @private
   * @returns {string} - The track language to set by default.
   */
  _getLanguage(configuredLanguage: string, defaultTrack: ?TextTrack): string {
    let language = configuredLanguage;
    if (language === AUTO) {
      const tracks = this._getTextTracks();
      const localeTrack: ?TextTrack = tracks.find(track => Track.langComparer(Locale.language, track.language));
      if (localeTrack) {
        language = localeTrack.language;
      } else if (defaultTrack && defaultTrack.language !== OFF) {
        language = defaultTrack.language;
      } else if (tracks && tracks.length > 0) {
        language = tracks[0].language;
      }
    }
    return language;
  }

  /**
   * Sets a specific default track.
   * @template {TextTrack | AudioTrack} T
   * @param {Array<T>} tracks - the audio or text tracks.
   * @param {string} language - The track language.
   * @param {Track} defaultTrack - The default track to set in case there is no language configured.
   * @returns {void}
   * @private
   */
  _setDefaultTrack<T: TextTrack | AudioTrack>(tracks: Array<T>, language: string, defaultTrack: ?Track): void {
    const track: ?T = tracks.find(track => Track.langComparer(language, track.language));
    if (track) {
      this.selectTrack(track);
      this._markActiveTrack(track);
    } else if (defaultTrack && !defaultTrack.active) {
      this.selectTrack(defaultTrack);
    }
  }

  /**
   * Checks for callbacks that should change the tracks, and call them on the
   * respective track group (audio/text/video)
   * @private
   * @returns {void}
   */
  _maybeSetTracksLabels() {
    const customLabels = this._config.customLabels;
    if (customLabels) {
      for (let callbackType in customLabels) {
        if (!Object.prototype.hasOwnProperty.call(customLabels, callbackType)) {
          return;
        }
        switch (callbackType) {
          case LabelOptions.QUALITIES:
            this._setTracksCustomLabels(this._getVideoTracks(), customLabels[callbackType]);
            break;
          case LabelOptions.AUDIO:
            this._setTracksCustomLabels(this._getAudioTracks(), customLabels[callbackType]);
            break;
          case LabelOptions.CAPTIONS:
            this._setTracksCustomLabels(this._getTextTracks(), customLabels[callbackType]);
            break;
        }
      }
    }
  }

  /**
   *
   * @template {AudioTrack | TextTrack | VideoTrack} T
   * @param {Array<T>} tracks - tracks
   * @param {Function} callback - application label callback, returns a string
   * @private
   * @returns {void}
   */
  _setTracksCustomLabels<T: AudioTrack | TextTrack | VideoTrack>(tracks: Array<T>, callback: Function) {
    tracks.forEach(track => {
      const result = callback(Utils.Object.copyDeep(track));
      if (result) {
        track.label = result;
      }
    });
  }

  // </editor-fold>

  // </editor-fold>

  // <editor-fold desc="Enums">

  /**
   * Gets the player event types.
   * @returns {PKEventTypes} - The event types of the player.
   * @public
   */
  get Event(): PKEventTypes {
    return EventType;
  }

  /**
   * Gets the player TextStyle.
   * @returns {TextStyle} - The TextStyle class
   * @public
   */
  get TextStyle(): typeof TextStyle {
    return TextStyle;
  }

  /**
   * Gets the player state types.
   * @returns {PKStateTypes} - The state types of the player.
   * @public
   */
  get State(): PKStateTypes {
    return StateType;
  }

  /**
   * Gets the player tracks types.
   * @returns {TrackType} - The tracks types of the player.
   * @public
   */
  get Track(): typeof TrackType {
    return TrackType;
  }

  /**
   * Gets the player log level types.
   * @returns {PKLogLevelTypes} - The log level types of the player.
   * @public
   */
  get LogLevelType(): PKLogLevelTypes {
    return LogLevelType;
  }

  /**
   * Gets the player log level objects.
   * @returns {PKLogLevels} - The log levels objects of the player.
   * @public
   */
  get LogLevel(): PKLogLevels {
    return LogLevel;
  }

  /**
   * Gets the player abr modes.
   * @returns {PKAbrModes} - The abr modes of the player.
   * @public
   */
  get AbrMode(): PKAbrModes {
    return AbrMode;
  }

  /**
   * Gets the player media types.
   * @returns {PKMediaTypes} - The media types of the player.
   * @public
   */
  get MediaType(): PKMediaTypes {
    return MediaType;
  }

  /**
   * Gets the player stream types.
   * @returns {PKStreamTypes} - The stream types of the player.
   * @public
   */
  get StreamType(): PKStreamTypes {
    return StreamType;
  }

  /**
   * Gets the player engine types.
   * @returns {PKEngineTypes} - The engine types of the player.
   * @public
   */
  get EngineType(): PKEngineTypes {
    return EngineType;
  }

  /**
   * Gets the player cors types.
   * @returns {PKCorsTypes} - The player cors types.
   * @public
   */
  get CorsType(): PKCorsTypes {
    return CorsType;
  }

  /**
   * Gets the ad break types.
   * @returns {PKAdBreakTypes} - The ad break types of the player.
   * @public
   */
  get AdBreakType(): PKAdBreakTypes {
    return AdBreakType;
  }

  /**
   * Gets the ad break tag types.
   * @returns {PKAdTagTypes} - The ad tag types of the player.
   * @public
   */
  get AdTagType(): PKAdTagTypes {
    return AdTagType;
  }

  /**
   * Gets the player static error class.
   * @returns {PKError} - The player static error class.
   * @public
   */
  get Error(): typeof PKError {
    return PKError;
  }

  // </editor-fold>
}
