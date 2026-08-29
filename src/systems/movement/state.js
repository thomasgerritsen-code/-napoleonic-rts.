'use strict';
// ---------- Architecture v2: movement runtime state ----------
// Owns the v0.7.1 compatibility names while moving active movement state out of
// version-patch files. Values are read from the central immutable config.

const V071_VERSION = '0.7.1';
const V071_TEST_MODE = new URLSearchParams(location.search).get('test');
const V071_ACTIVE = V071_TEST_MODE !== '1' && V071_TEST_MODE !== 'v070';
const V071_FIXED_DT = window.NRTS_CONFIG?.simulation?.fixedDt || (1 / 60);
const V071_STATS = {
  solver:'anchor-damped-slots-fixed60-render-interp',
  followerSteps:0,
  followerSamples:0,
  maxSlotError:0,
  maxFollowerSpeed:0,
  maxFollowerAcceleration:0,
  directionReversals:0,
  internalCollisionSkips:0,
  fixedSteps:0,
  renderFrames:0,
  droppedFixedTime:0
};

let V071_ACCUMULATOR = 0;
let V071_RENDER_ALPHA = 1;

function clampMagnitudeV071(x, y, maxLength) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= maxLength || length < 0.0001) return {x, y, length};
  const scale = maxLength / length;
  return {x:x*scale, y:y*scale, length:maxLength};
}
