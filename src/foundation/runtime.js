'use strict';
// Napoleonic RTS foundation runtime. Behaviour-neutral infrastructure around the v0.7.1 legacy baseline.
(function installFoundation(global) {
  if (global.NRTS) return;

  const gameVersion = global.RTS_VERSION || '1.0.0';
  const listeners = new Map();
  const subsystems = new Map();
  const machines = new Map();
  const bootStartedAt = performance.now();
  const runtimeErrors = [];
  const runtimeWarnings = [];

  function bucket(eventName) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    return listeners.get(eventName);
  }

  const events = Object.freeze({
    on(eventName, handler) {
      if (typeof handler !== 'function') throw new TypeError('Event handler must be a function.');
      bucket(eventName).add(handler);
      return () => bucket(eventName).delete(handler);
    },
    once(eventName, handler) {
      let dispose = null;
      dispose = this.on(eventName, payload => {
        dispose();
        handler(payload);
      });
      return dispose;
    },
    off(eventName, handler) {
      return bucket(eventName).delete(handler);
    },
    emit(eventName, payload) {
      const handlers = [...bucket(eventName)];
      for (const handler of handlers) {
        try { handler(payload); }
        catch (error) {
          runtimeErrors.push({ source: `event:${eventName}`, message: String(error?.message || error) });
          console.error(`[NRTS:event:${eventName}]`, error);
        }
      }
      return handlers.length;
    }
  });

  const subsystemApi = Object.freeze({
    register(name, api = {}, meta = {}) {
      if (!name || typeof name !== 'string') throw new TypeError('Subsystem name must be a non-empty string.');
      if (subsystems.has(name)) throw new Error(`Subsystem already registered: ${name}`);
      const record = Object.freeze({
        name,
        api,
        meta: Object.freeze({ phase: 'foundation', owner: name, ...meta }),
        registeredAt: performance.now()
      });
      subsystems.set(name, record);
      events.emit('subsystem:registered', record);
      return api;
    },
    has(name) { return subsystems.has(name); },
    get(name) { return subsystems.get(name)?.api || null; },
    require(name) {
      const api = this.get(name);
      if (!api) throw new Error(`Required subsystem not registered: ${name}`);
      return api;
    },
    list() {
      return [...subsystems.values()].map(record => ({
        name: record.name,
        meta: record.meta,
        registeredAt: record.registeredAt
      }));
    }
  });

  const stateApi = Object.freeze({
    define(name, definition) {
      if (!name || typeof name !== 'string') throw new TypeError('State machine name must be a non-empty string.');
      if (machines.has(name)) throw new Error(`State machine already defined: ${name}`);
      const states = new Set(definition?.states || []);
      const transitions = new Map();
      for (const [from, targets] of Object.entries(definition?.transitions || {})) {
        transitions.set(from, new Set(targets));
      }
      const machine = { states, transitions };
      machines.set(name, machine);
      return name;
    },
    canTransition(name, from, to) {
      const machine = machines.get(name);
      if (!machine || !machine.states.has(from) || !machine.states.has(to)) return false;
      return !!machine.transitions.get(from)?.has(to);
    },
    assertTransition(name, from, to) {
      if (!this.canTransition(name, from, to)) {
        throw new Error(`Invalid ${name} transition: ${from} -> ${to}`);
      }
      return true;
    },
    list() { return [...machines.keys()]; }
  });

  const diagnostics = Object.freeze({
    warn(source, message) {
      const item = { source, message: String(message), at: performance.now() };
      runtimeWarnings.push(item);
      console.warn(`[NRTS:${source}] ${item.message}`);
      return item;
    },
    error(source, error) {
      const item = { source, message: String(error?.message || error), at: performance.now() };
      runtimeErrors.push(item);
      console.error(`[NRTS:${source}]`, error);
      return item;
    },
    snapshot() {
      return {
        gameVersion,
        foundationVersion: '1.0.0',
        bootStartedAt,
        uptimeMs: performance.now() - bootStartedAt,
        subsystems: subsystemApi.list(),
        stateMachines: stateApi.list(),
        errors: runtimeErrors.slice(),
        warnings: runtimeWarnings.slice()
      };
    }
  });

  global.addEventListener('error', event => {
    runtimeErrors.push({ source: 'window', message: event.message || 'Unknown window error', at: performance.now() });
  });
  global.addEventListener('unhandledrejection', event => {
    runtimeErrors.push({ source: 'promise', message: String(event.reason?.message || event.reason), at: performance.now() });
  });

  global.NRTS = Object.freeze({
    gameVersion,
    foundationVersion: '1.0.0',
    events,
    subsystems: subsystemApi,
    states: stateApi,
    diagnostics
  });

  events.emit('foundation:ready', { gameVersion, foundationVersion: '1.0.0' });
})(window);
