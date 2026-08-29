'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function createDeterministicRandom(seed = 1) {
  let state = Math.trunc(seed) % 2147483647;
  if (state <= 0) state += 2147483646;
  return function deterministicRandom() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function createSandbox({ globals = {}, window: windowOverrides = {}, seed = 1 } = {}) {
  const random = createDeterministicRandom(seed);
  const sandboxMath = Object.create(Math);
  sandboxMath.random = random;

  const windowObject = {};
  const sandbox = {
    console,
    Math: sandboxMath,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Date,
    JSON,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    window: windowObject
  };

  Object.assign(windowObject, windowOverrides);
  Object.assign(sandbox, globals);
  sandbox.globalThis = sandbox;
  windowObject.window = windowObject;
  windowObject.globalThis = windowObject;

  return {
    context: vm.createContext(sandbox),
    window: windowObject,
    random
  };
}

function resolveProductionPath(relativePath) {
  const absolutePath = path.resolve(ROOT, relativePath);
  if (absolutePath !== ROOT && !absolutePath.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`Refusing to load path outside repository: ${relativePath}`);
  }
  return absolutePath;
}

function loadProductionScript(context, relativePath) {
  const absolutePath = resolveProductionPath(relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  new vm.Script(source, { filename: relativePath }).runInContext(context);
  return context;
}

function runFixedSteps({ durationSeconds, hz = 60, state, step, sampleEvery = 0, sample, stop }) {
  if (!(durationSeconds >= 0)) throw new Error('durationSeconds must be >= 0');
  if (!(hz > 0)) throw new Error('hz must be > 0');
  if (typeof step !== 'function') throw new Error('step must be a function');

  const dt = 1 / hz;
  const maxSteps = Math.ceil(durationSeconds * hz);
  const samples = [];
  let stepsRun = 0;

  for (let index = 0; index < maxSteps; index++) {
    const time = (index + 1) * dt;
    step(state, dt, index, time);
    stepsRun++;

    if (sampleEvery > 0 && typeof sample === 'function' && stepsRun % sampleEvery === 0) {
      samples.push(sample(state, index, time));
    }
    if (typeof stop === 'function' && stop(state, index, time)) break;
  }

  return {
    state,
    dt,
    hz,
    stepsRun,
    simulatedSeconds: stepsRun * dt,
    samples
  };
}

function sweep(values, runScenario) {
  if (!Array.isArray(values)) throw new Error('values must be an array');
  if (typeof runScenario !== 'function') throw new Error('runScenario must be a function');
  return values.map((value, index) => ({ value, result: runScenario(value, index) }));
}

module.exports = {
  ROOT,
  createDeterministicRandom,
  createSandbox,
  loadProductionScript,
  runFixedSteps,
  sweep
};
