import { EventEmitter } from 'events';

class SessionEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

export const eventBus = new SessionEventBus();
