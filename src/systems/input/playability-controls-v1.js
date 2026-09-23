'use strict';
(function installPlayabilityControlsV1(root) {
  const CONTRACT = Object.freeze({
    version: 'playability-controls-v1.1',
    shiftBoxAdditiveSelection: true,
    formationHotkeys: true,
    focusSelectionHotkey: true,
    regimentCycleHotkey: true,
    interactiveUiHotkeyGuard: true,
    mobileTouchVerticalSlice: true,
    mobileLandscapePrimary: true,
    mobileTwoFingerCamera: true,
    mobileFacingDrag: true
  });

  const baseSelectBox = selectBox;
  selectBox = function selectBoxWithAdditiveSelection(x1, y1, x2, y2) {
    const additive = keys.has('shift');
    if (!additive) return baseSelectBox(x1, y1, x2, y2);

    const previous = [...selectedUnits].filter(u => u && !u.dead);
    baseSelectBox(x1, y1, x2, y2);
    previous.forEach(u => selectedUnits.add(u));
    actionSignature = '';
    updateHud(true);
  };

  function focusCurrentSelection() {
    let x = null;
    let y = null;
    const selected = [...selectedUnits].filter(u => u && !u.dead);
    if (selected.length) {
      const c = centroid(selected);
      x = c.x;
      y = c.y;
    } else if (selectedBuilding && !selectedBuilding.dead) {
      x = selectedBuilding.x;
      y = selectedBuilding.y;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      statusEl.textContent = 'Selecteer eerst een regiment, eenheid of gebouw om erop te focussen.';
      return false;
    }
    camera.x = x;
    camera.y = y;
    clampCamera();
    statusEl.textContent = 'Camera gecentreerd op selectie.';
    return true;
  }

  function cyclePlayerRegiment(reverse = false) {
    const regs = activeRegiments('france');
    if (!regs.length) {
      statusEl.textContent = 'Geen actieve regimenten om doorheen te bladeren.';
      return false;
    }
    const currentIds = new Set(selectedRegiments().map(r => r.id));
    let index = regs.findIndex(r => currentIds.has(r.id));
    if (index < 0) index = reverse ? 0 : -1;
    index = (index + (reverse ? -1 : 1) + regs.length) % regs.length;
    const reg = regs[index];
    selectWholeRegiment(reg);
    currentFormation = reg.formation;
    actionSignature = '';
    updateHud(true);
    const c = centroid(regimentMembers(reg));
    camera.x = c.x;
    camera.y = c.y;
    clampCamera();
    statusEl.textContent = `${reg.name} geselecteerd · ${formationLabel(reg.formation)}.`;
    return true;
  }

  function isInteractiveUiTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('button, input, select, textarea, a[href], [contenteditable="true"], [role="button"]'));
  }

  addEventListener('keydown', e => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isInteractiveUiTarget(e.target)) return;
    const k = e.key.toLowerCase();
    const formationByKey = { '1': 'line', '2': 'column', '3': 'square' };
    if (formationByKey[k]) {
      e.preventDefault();
      applyFormationNow(formationByKey[k]);
      return;
    }
    if (k === 'f') {
      e.preventDefault();
      focusCurrentSelection();
      return;
    }
    if (k === 'tab') {
      e.preventDefault();
      cyclePlayerRegiment(e.shiftKey);
    }
  });

  const mobile = {
    pointers: new Map(),
    pinch: null,
    suppressSingleUntilClear: false,
    taps: 0,
    boxSelections: 0,
    moveOrders: 0,
    facingOrders: 0,
    cameraGestures: 0,
    ghostOrdersSuppressed: 0
  };
  const MOBILE_DRAG_PX = 12;
  const MIN_ZOOM = 0.42;
  const MAX_ZOOM = 1.55;

  function injectMobilePresentation() {
    if (document.getElementById('mobile-playability-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-playability-v1-style';
    style.textContent = `
      .mobile-chrome-button{display:none}
      #mobileGestureHint{display:none;position:fixed;z-index:19;left:50%;transform:translateX(-50%);padding:6px 10px;border-radius:999px;background:rgba(16,20,17,.88);border:1px solid rgba(245,241,232,.2);color:#f5f1e8;font:650 12px/1.2 system-ui,sans-serif;pointer-events:none;white-space:nowrap}
      #mobileRotateHint{display:none;position:fixed;z-index:18;top:50%;left:50%;transform:translate(-50%,-50%);max-width:260px;padding:10px 14px;border-radius:10px;background:rgba(16,20,17,.92);border:1px solid rgba(244,216,109,.45);color:#f5f1e8;font:650 13px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none}
      @media (pointer:coarse),(max-width:860px){
        button,.actions button{min-height:44px;min-width:44px}
        .topbar{top:max(6px,env(safe-area-inset-top));left:max(6px,env(safe-area-inset-left));right:max(6px,env(safe-area-inset-right));padding:6px 8px;min-height:48px}
        .bottombar{bottom:max(6px,env(safe-area-inset-bottom));width:calc(100% - max(12px,env(safe-area-inset-left) + env(safe-area-inset-right)));min-height:82px;grid-template-columns:minmax(105px,1fr) minmax(150px,2.2fr) auto;gap:6px}
        .actions{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;padding-bottom:2px}
        .actions button{flex:0 0 auto;min-width:64px;font-size:.68rem}
        .army-counts{min-width:48px}
        #mobileGestureHint{display:block;bottom:calc(max(6px,env(safe-area-inset-bottom)) + 96px)}
      }
      @media (max-width:700px) and (orientation:landscape){
        .brand strong{font-size:.78rem}.version{font-size:.65rem}.resources{font-size:.75rem}.resources span{padding:5px 7px}
        .topbar{grid-template-columns:1fr auto}.brand{min-width:0}.resources{grid-column:1/-1}.topbar #resetBtn{padding:5px 8px;min-height:40px}
        .selection-panel strong{font-size:.7rem}.selection-panel .label{font-size:.56rem}#selectionDetails{font-size:.57rem}
      }
      @media (pointer:coarse) and (orientation:portrait) and (max-width:700px){#mobileRotateHint{display:block}.bottombar{grid-template-columns:1fr}.army-counts{display:none}.actions{justify-content:flex-start}.selection-panel{max-height:48px}}
      @media (pointer:coarse),(max-width:860px){
        .topbar{top:max(4px,env(safe-area-inset-top));left:max(4px,env(safe-area-inset-left));right:max(4px,env(safe-area-inset-right));min-height:44px;height:44px;padding:3px 5px;display:flex;gap:4px}
        .topbar .brand,.topbar #status{display:none}
        .topbar .resources{display:flex;flex:1 1 auto;min-width:0;grid-column:auto;grid-row:auto;gap:2px;overflow:hidden;justify-content:flex-start;font-size:clamp(.59rem,2.7vw,.76rem)}
        .topbar .resources span{padding:4px 3px;white-space:nowrap}
        .topbar #resetBtn,.topbar #renderModeBtn{display:none}
        .topbar button.mobile-chrome-button{display:block;flex:0 0 auto;min-width:44px;min-height:44px;padding:3px 6px;font-size:.7rem}
        body.mobile-menu-open .topbar #resetBtn,body.mobile-menu-open .topbar #renderModeBtn{display:block;position:fixed;top:calc(max(4px,env(safe-area-inset-top)) + 49px);right:max(4px,env(safe-area-inset-right));min-width:110px;min-height:44px;background:#202720;z-index:31}
        body.mobile-menu-open .topbar #renderModeBtn{right:calc(max(4px,env(safe-area-inset-right)) + 114px)}
        .bottombar{bottom:max(4px,env(safe-area-inset-bottom));left:max(4px,env(safe-area-inset-left));transform:none;width:calc(100% - max(4px,env(safe-area-inset-left)) - max(4px,env(safe-area-inset-right)));min-height:0;padding:3px 5px;display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
        .selection-panel{max-height:27px;display:block;overflow:hidden;white-space:nowrap}
        .selection-panel .label,#selectionDetails,.army-counts{display:none}
        .selection-panel strong{display:block;font-size:.72rem;line-height:25px;margin:0}
        .actions{min-width:0;max-width:100%;flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;gap:4px;scrollbar-width:thin;touch-action:pan-x}
        .actions button{flex:0 0 auto;min-width:58px;min-height:44px;font-size:.65rem;padding:3px 6px}
        #minimap{display:none;right:max(5px,env(safe-area-inset-right));bottom:calc(max(4px,env(safe-area-inset-bottom)) + 84px);width:150px;height:88px}
        body.mobile-map-open #minimap{display:block}
        .village-identity-3d{display:none}
        .production-queue{right:max(5px,env(safe-area-inset-right));bottom:calc(max(4px,env(safe-area-inset-bottom)) + 84px);width:min(190px,45vw);max-height:94px;padding:5px;font-size:.65rem}
        .production-queue .rally-line,.production-queue li.empty{display:none}
        #mobileGestureHint{display:none;bottom:calc(max(4px,env(safe-area-inset-bottom)) + 85px);max-width:calc(100vw - 16px);overflow:hidden;text-overflow:ellipsis;font-size:.65rem}
        #mobileGestureHint.visible{display:block}
        #mobileRotateHint{display:none !important}
        .build-hint{top:calc(max(4px,env(safe-area-inset-top)) + 48px);max-width:calc(100vw - 12px);white-space:nowrap;font-size:.65rem}
      }
    `;
    document.head.appendChild(style);
    const hint = document.createElement('div');
    hint.id = 'mobileGestureHint';
    hint.setAttribute('aria-live', 'polite');
    hint.textContent = 'Tik: selecteer/verplaats · sleep: selectie/richting · 2 vingers: camera';
    document.body.appendChild(hint);
    const rotate = document.createElement('div');
    rotate.id = 'mobileRotateHint';
    rotate.textContent = 'Landscape geeft de beste slagveldweergave. Portrait blijft speelbaar.';
    document.body.appendChild(rotate);
    const topbar = document.querySelector('.topbar');
    for (const [id, label, className] of [
      ['mobileMapBtn', 'Kaart', 'mobile-map-open'],
      ['mobileMenuBtn', 'Menu', 'mobile-menu-open']
    ]) {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.className = 'mobile-chrome-button';
      button.textContent = label;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        const open = document.body.classList.toggle(className);
        button.setAttribute('aria-pressed', String(open));
      });
      topbar.appendChild(button);
    }
  }
  injectMobilePresentation();

  let hintTimeout;
  function hint(text) {
    const el = document.getElementById('mobileGestureHint');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(hintTimeout);
    hintTimeout = setTimeout(() => el.classList.remove('visible'), 2200);
  }
  function touchHitAt(clientX, clientY) {
    const w = screenToWorld(clientX, clientY);
    return unitAt(w.x, w.y, 'france') || buildingAt(w.x, w.y, 'france');
  }
  function selectedCanMove() {
    return [...selectedUnits].some(u => u && !u.dead);
  }
  function pairMetrics() {
    const pts = [...mobile.pointers.values()].slice(0, 2);
    if (pts.length < 2) return null;
    const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const distance = Math.max(8, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
    return { center, distance };
  }
  function beginPinch() {
    const m = pairMetrics();
    if (!m) return;
    mobile.suppressSingleUntilClear = true;
    mobile.pointers.forEach(p => { p.multi = true; });
    mobile.pinch = {
      center: m.center,
      distance: m.distance,
      zoom: camera.zoom,
      anchor: screenToWorld(m.center.x, m.center.y)
    };
    hint('2 vingers: camera verplaatsen en zoomen');
  }
  function updatePinch() {
    const m = pairMetrics(), base = mobile.pinch;
    if (!m || !base) return;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, base.zoom * (m.distance / base.distance)));
    camera.zoom = nextZoom;
    camera.x = base.anchor.x - (m.center.x - innerWidth / 2) / nextZoom;
    camera.y = base.anchor.y - (m.center.y - innerHeight / 2) / nextZoom;
    clampCamera();
    mobile.cameraGestures++;
  }
  function suppressLegacyTouch(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(type => {
    canvas.addEventListener(type, suppressLegacyTouch, { capture: true, passive: false });
  });

  function onTouchPointerDown(e) {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const w = screenToWorld(e.clientX, e.clientY);
    mobile.pointers.set(e.pointerId, {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
      startWorld: w, startHit: touchHitAt(e.clientX, e.clientY), moved: false, multi: false
    });
    if (mobile.pointers.size >= 2) beginPinch();
    else hint(selectedCanMove() ? 'Tik terrein: verplaats · sleep terrein: richting' : 'Tik unit: selecteer · sleep: vakselectie');
  }
  function onTouchPointerMove(e) {
    if (e.pointerType !== 'touch') return;
    const p = mobile.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > MOBILE_DRAG_PX) p.moved = true;
    if (mobile.pointers.size >= 2 || mobile.pinch) {
      updatePinch();
      return;
    }
    if (p.moved) hint(selectedCanMove() && !p.startHit ? 'Laat los: verplaats met deze frontrichting' : 'Laat los: selecteer dit gebied');
  }
  function finishSingleTouch(p, clientX, clientY) {
    const moved = p.moved || Math.hypot(clientX - p.sx, clientY - p.sy) > MOBILE_DRAG_PX;
    const endWorld = screenToWorld(clientX, clientY);
    if (buildMode) {
      if (!moved) placeBuilding(buildMode, endWorld.x, endWorld.y);
      hint('Bouwplaats gekozen');
      return;
    }
    if (moved) {
      if (selectedCanMove() && !p.startHit) {
        const facing = Math.atan2(endWorld.y - p.startWorld.y, endWorld.x - p.startWorld.x);
        if (typeof issueMoveWithFacingV06 === 'function') issueMoveWithFacingV06(p.startWorld.x, p.startWorld.y, facing);
        else issueMove(p.startWorld.x, p.startWorld.y);
        mobile.facingOrders++;
        hint('Marsorder + frontrichting ingesteld');
      } else {
        selectBox(p.sx, p.sy, clientX, clientY);
        mobile.boxSelections++;
        hint(`${selectedUnits.size} eenheden geselecteerd`);
      }
      return;
    }
    mobile.taps++;
    const hit = touchHitAt(clientX, clientY);
    if (hit) {
      selectPoint(endWorld.x, endWorld.y, false);
      hint(hit.kind === 'unit' && hit.regimentId ? 'Regiment geselecteerd' : 'Selectie bijgewerkt');
      return;
    }
    const resource = resourceAt(endWorld.x, endWorld.y);
    if (resource && assignGather(resource)) {
      hint('Verzamelorder gegeven');
      return;
    }
    if (selectedCanMove()) {
      issueMove(endWorld.x, endWorld.y);
      mobile.moveOrders++;
      hint('Marsorder gegeven');
    } else {
      selectPoint(endWorld.x, endWorld.y, false);
      hint('Tik op een Franse eenheid om te selecteren');
    }
  }
  function onTouchPointerUp(e) {
    if (e.pointerType !== 'touch') return;
    const p = mobile.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const wasMulti = p.multi || mobile.suppressSingleUntilClear || mobile.pointers.size > 1;
    mobile.pointers.delete(e.pointerId);
    if (wasMulti) {
      mobile.ghostOrdersSuppressed++;
      if (mobile.pointers.size < 2) mobile.pinch = null;
      if (!mobile.pointers.size) {
        mobile.suppressSingleUntilClear = false;
        hint('Camera aangepast · tik om verder te spelen');
      }
      return;
    }
    finishSingleTouch(p, e.clientX, e.clientY);
  }
  function onTouchPointerCancel(e) {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    mobile.pointers.delete(e.pointerId);
    if (mobile.pointers.size < 2) mobile.pinch = null;
    if (!mobile.pointers.size) mobile.suppressSingleUntilClear = false;
  }
  canvas.addEventListener('pointerdown', onTouchPointerDown, true);
  canvas.addEventListener('pointermove', onTouchPointerMove, true);
  canvas.addEventListener('pointerup', onTouchPointerUp, true);
  canvas.addEventListener('pointercancel', onTouchPointerCancel, true);

  const api = {
    contract: CONTRACT,
    focusCurrentSelection,
    cyclePlayerRegiment,
    isInteractiveUiTarget,
    mobile: Object.freeze({
      enabled: true,
      inputModel: 'pointer-events',
      primaryOrientation: 'landscape',
      state: () => ({
        activePointers: mobile.pointers.size,
        taps: mobile.taps,
        boxSelections: mobile.boxSelections,
        moveOrders: mobile.moveOrders,
        facingOrders: mobile.facingOrders,
        cameraGestures: mobile.cameraGestures,
        ghostOrdersSuppressed: mobile.ghostOrdersSuppressed,
        camera: { x: camera.x, y: camera.y, zoom: camera.zoom }
      })
    })
  };
  root.__PLAYABILITY_CONTROLS_V1__ = Object.freeze(api);
})(window);
