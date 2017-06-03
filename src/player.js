//@flow
import EventManager from './event/event-manager'
import FakeEventTarget from './event/fake-event-target'
import FakeEvent from './event/fake-event'
import PlayerEvents from './event/events'
import PlayerStates from './state/state-types'
import {isNumber, isFloat, merge} from './utils/util'
import {capitlize} from './utils/string-util'
import LoggerFactory from './utils/logger'
import Html5 from './engines/html5/html5'
import PluginManager from './plugin/plugin-manager'
import StateManager from './state/state-manager'

type ListenerType = (event: FakeEvent) => any;

/**
 * The HTML5 player class.
 * @classdesc
 */
class Player extends FakeEventTarget {
  /**
   * The player class logger.
   * @type {any}
   * @private
   */
  _logger: any;
  /**
   * The plugin manager of the player.
   * @type {PluginManager}
   * @private
   */
  _pluginManager: PluginManager;
  /**
   * The event manager of the player.
   * @type {EventManager}
   * @private
   */
  _eventManager: EventManager;
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
   * The event handlers of the playback engine.
   * @type {Map<string, ListenerType>}
   * @private
   */
  _engineEventHandlers: Map<string, ListenerType>;
  /**
   * The state manager of the player.
   * @type {StateManager}
   * @private
   */
  _stateManager: StateManager;

  /**
   * @param {Object} config - The configuration for the player instance.
   * @constructor
   */
  constructor(config: Object) {
    super();
    this._logger = LoggerFactory.getLogger('Player');
    this._stateManager = new StateManager(this);
    this._pluginManager = new PluginManager();
    this._eventManager = new EventManager();
    this._engineEventHandlers = new Map();
    for (let playerEvent in PlayerEvents) {
      if (PlayerEvents.hasOwnProperty(playerEvent)) {
        this._engineEventHandlers.set(`onEngine${capitlize(PlayerEvents[playerEvent])}_`, (event) => {
          return this.dispatchEvent(event);
        });
      }
    }
    this.configure(config);
  }

  /**
   * Configures the player according to given configuration.
   * @param {Object} config - The configuration for the player instance.
   * @returns {void}
   */
  configure(config: Object): void {
    if (this._config) {
      this._config = merge(this._config, config);
    } else {
      this._config = config || Player._defaultConfig();
    }
    this._loadPlugins(this._config);
    this._selectEngine(this._config);
    this._attachMedia();
  }

  /**
   * Destroys the player.
   * @returns {void}
   * @public
   */
  destroy(): void {
    this._engine.destroy();
    this._eventManager.destroy();
    this._pluginManager.destroy();
    this._stateManager.destroy();
    this._eventManager.destroy();
    this._config = {};
  }

  /**
   * @returns {Object} - The default configuration of the player.
   * @private
   * @static
   */
  static _defaultConfig(): Object {
    return {};
  }

  /**
   *
   * @param {Object} config - The configuration of the player instance.
   * @private
   * @returns {void}
   */
  _loadPlugins(config: Object): void {
    let plugins = config.plugins;
    for (let name in plugins) {
      if (plugins.hasOwnProperty(name)) {
        this._pluginManager.load(name, this, plugins[name]);
      }
    }
  }

  /**
   * Select the engine to create based on the given configured sources.
   * @param {Object} config - The configuration of the player instance.
   * @private
   * @returns {void}
   */
  _selectEngine(config: Object): void {
    if (config && config.sources) {
      let sources = config.sources;
      for (let i = 0; i < sources.length; i++) {
        if (Html5.canPlayType(sources[i].mimetype)) {
          this._loadEngine(sources[i], config);
          break;
        }
      }
    }
  }

  /**
   * Loads the selected engine.
   * @param {Source} source - The selected source object.
   * @param {Object} config - The configuration of the player instance.
   * @private
   * @returns {void}
   */
  _loadEngine(source: Source, config: Object): void {
    this._engine = new Html5(source, config);
    if (config.preload === "auto") {
      this.load();
    }
  }

  /**
   * Listen to all HTML5 defined events and trigger them on the player
   * @private
   * @returns {void}
   */
  _attachMedia(): void {
    if (this._engine) {
      for (let playerEvent in PlayerEvents) {
        if (PlayerEvents.hasOwnProperty(playerEvent)) {
          const handler = this._engineEventHandlers.get(`onEngine${capitlize(PlayerEvents[playerEvent])}_`);
          if (handler) {
            this._eventManager.listen(this._engine, PlayerEvents[playerEvent], handler);
          }
        }
      }
    }
  }

  /**
   * Get the player config.
   * @returns {Object} - The player configuration.
   * @public
   */
  get config(): Object {
    return this._config;
  }

  //  <editor-fold desc="Playback Interface">
  /**
   * Start/resume playback.
   * @returns {void}
   * @public
   */
  play(): void {
    if (this._engine) {
      return this._engine.play();
    }
  }

  /**
   * Pause playback.
   * @returns {void}
   * @public
   */
  pause(): void {
    if (this._engine) {
      return this._engine.pause();
    }
  }

  /**
   * Load media.
   * @returns {void}
   * @public
   */
  load(): void {
    if (this._engine) {
      this._engine.load();
    }
  }

  /**
   * Set the current time in seconds.
   * @param {Number} to - The number to set in seconds.
   * @public
   */
  set currentTime(to: number): void {
    if (this._engine) {
      if (isNumber(to)) {
        let boundedTo = to;
        if (to < 0) {
          boundedTo = 0;
        }
        if (boundedTo > this._engine.duration) {
          boundedTo = this._engine.duration;
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
  }

  /**
   * Set playback volume.
   * @param {Number} vol - The volume to set.
   * @returns {void}
   * @public
   */
  set volume(vol: number): void {
    if (this._engine) {
      if (isFloat(vol)) {
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
  }

  // </editor-fold>

  // <editor-fold desc="State">
  ready() {
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
  }

  buffered() {
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
  }

  /**
   * Get the player events.
   * @returns {Object} - The events of the player.
   * @public
   */
  get Event(): { [event: string]: string } {
    return PlayerEvents;
  }

  /**
   * Get the player states.
   * @returns {Object} - The states of the player.
   * @public
   */
  get State(): { [state: string]: string } {
    return PlayerStates;
  }

// </editor-fold>
}

export default Player;
