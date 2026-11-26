"use strict";

var UNITS = [];
var byId = {};
var state = {
  repeat: 2,
  gap: 1,
  speed: 1,
  hide: false,
  gloss: true,
  index: -1,
  playing: false,
  mode: "",
  repNow: 0,
  note: "",
  scrolled: -2,
  card: null
};
var playToken = 0;
var gapTimer = 0;
var audio = new Audio();
audio.preload = "none";

var $ = function (id) { return document.getElementById(id); };

function hashId() {
  return decodeURIComponent((location.hash || "").replace(/^#/, ""));
}
function currentUnit() {
  return byId[hashId()] || byId.library || null;
}
function parentOf(unit) {
  return unit && unit.parent_unit ? byId[unit.parent_unit] || null : null;
}
function chainOf(unit) {
  var out = [];
  var guard = 0;
  var seen = {};
  while (unit && !seen[unit.id] && guard < 20) {
    seen[unit.id] = true;
    out.unshift(unit);
    unit = parentOf(unit);
    guard += 1;
  }
  return out;
}
function rootOf(unit) {
  var path = chainOf(unit);
  return path.length ? path[0] : unit;
}
function childUnit(parentId, word) {
  var want = String(word || "").toLowerCase();
  for (var i = 0; i < UNITS.length; i++) {
    if (UNITS[i].parent_unit === parentId && String(UNITS[i].center).toLowerCase() === want) return UNITS[i];
  }
  return null;
}
function wordEntries(unit) {
  return [{ data: unit.center_word, kind: "center" }].concat(unit.words.map(function (word) {
    return { data: word, kind: "child" };
  }));
}
function isBoundary(text, start, end) {
  var word = /[A-Za-z0-9]/;
  var before = start > 0 ? text.charAt(start - 1) : "";
  var after = end < text.length ? text.charAt(end) : "";
  if (before && word.test(before)) return false;
  if (after && word.test(after)) return false;
  return true;
}
function linkParts(text, entries) {
  var sorted = entries.slice().sort(function (a, b) { return b.data.word.length - a.data.word.length; });
  var lower = text.toLowerCase();
  var out = [];
  var i = 0;
  while (i < text.length) {
    var hit = null;
    for (var k = 0; k < sorted.length; k++) {
      var term = sorted[k].data.word.toLowerCase();
      if (lower.indexOf(term, i) !== i) continue;
      if (!isBoundary(text, i, i + term.length)) continue;
      hit = sorted[k];
      break;
    }
    if (hit) {
      out.push({ type: "word", entry: hit, text: text.slice(i, i + hit.data.word.length) });
      i += hit.data.word.length;
    } else {
      var j = i + 1;
      while (j < text.length) {
        var found = false;
        for (var n = 0; n < sorted.length; n++) {
          var w = sorted[n].data.word.toLowerCase();
          if (lower.indexOf(w, j) === j && isBoundary(text, j, j + w.length)) { found = true; break; }
        }
        if (found) break;
        j += 1;
      }
      out.push({ type: "text", text: text.slice(i, j) });
      i = j;
    }
  }
  return out;
}
function containsTerm(text, term) {
  var lower = text.toLowerCase();
  var want = term.toLowerCase();
  var from = 0;
  while (from <= lower.length) {
    var at = lower.indexOf(want, from);
    if (at < 0) return false;
    if (isBoundary(text, at, at + want.length)) return true;
    from = at + 1;
  }
  return false;
}
function clampSpeed(value) {
  var n = Math.round(Number(value) * 10) / 10;
  if (!isFinite(n)) n = 1;
  if (n < 0.6) n = 0.6;
  if (n > 1.2) n = 1.2;
  return n;
}
function loadSettings() {
  try {
    var raw = localStorage.getItem("wordlink:v1");
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (saved.repeat === "inf") state.repeat = Infinity;
    else if (saved.repeat === 1 || saved.repeat === 2 || saved.repeat === 3) state.repeat = saved.repeat;
    if (saved.gap === 0 || saved.gap === 1 || saved.gap === 2 || saved.gap === 3) state.gap = saved.gap;
    if (typeof saved.speed === "number") state.speed = clampSpeed(saved.speed);
    if (typeof saved.hide === "boolean") state.hide = saved.hide;
    if (typeof saved.gloss === "boolean") state.gloss = saved.gloss;
  } catch (e) {}
}
function saveSettings() {
  try {
    localStorage.setItem("wordlink:v1", JSON.stringify({
      repeat: state.repeat === Infinity ? "inf" : state.repeat,
      gap: state.gap,
      speed: state.speed,
      hide: state.hide,
      gloss: state.gloss
    }));
  } catch (e) {}
}
function reducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fillWords(node, text, unit) {
  var parts = linkParts(text, wordEntries(unit));
  parts.forEach(function (part) {
    if (part.type === "text") {
      node.appendChild(document.createTextNode(part.text));
      return;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wmark" + (part.entry.kind === "center" ? " center" : "");
    btn.textContent = part.text;
    btn.setAttribute("aria-label", "Word card: " + part.entry.data.word);
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      var child = part.entry.kind === "child" ? childUnit(unit.id, part.entry.data.word) : null;
      openCard(part.entry.data, child ? child.id : null);
    });
    node.appendChild(btn);
  });
}

function makeBubble(word, kind, unit) {
  var child = kind === "child" ? childUnit(unit.id, word.word) : null;
  var bubble = document.createElement("div");
  bubble.className = "bubble " + (kind === "center" ? "center" : "child");
  bubble.dataset.word = word.word;
  if (kind === "child") bubble.classList.add("c" + unit.words.indexOf(word));
  if (child) bubble.classList.add("has-child");

  var main = document.createElement("button");
  main.type = "button";
  main.className = "bmain";
  var label = document.createElement("span");
  label.className = "bw";
  label.textContent = word.word;
  main.appendChild(label);
  if (state.gloss && word.gloss) {
    var gloss = document.createElement("span");
    gloss.className = "bg";
    gloss.lang = "zh-Hant";
    gloss.textContent = word.gloss;
    main.appendChild(gloss);
  }
  if (child) {
    var next = document.createElement("span");
    next.className = "bnext";
    next.textContent = "open ›";
    main.appendChild(next);
    main.setAttribute("aria-label", "Open " + word.word);
  } else {
    main.setAttribute("aria-label", "Word card: " + word.word);
  }
  main.addEventListener("click", function () {
    if (child) location.hash = child.id;
    else openCard(word, null);
  });
  bubble.appendChild(main);

  var info = document.createElement("button");
  info.type = "button";
  info.className = "binfo";
  info.textContent = "i";
  info.setAttribute("aria-label", "Word card: " + word.word);
  info.addEventListener("click", function (event) {
    event.stopPropagation();
    openCard(word, child ? child.id : null);
  });
  bubble.appendChild(info);
  return bubble;
}

function renderUnit() {
  var unit = currentUnit();
  if (!unit) return;
  document.title = "Wordlink · " + unit.center;
  var path = chainOf(unit);
  var parent = parentOf(unit);
  var root = rootOf(unit);

  var roots = $("roots");
  roots.innerHTML = "";
  UNITS.filter(function (item) { return !item.parent_unit; }).forEach(function (item) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.center;
    if (root && item.id === root.id) btn.className = "on";
    btn.setAttribute("aria-current", root && item.id === root.id ? "true" : "false");
    btn.addEventListener("click", function () { location.hash = item.id; });
    roots.appendChild(btn);
  });

  var back = $("back");
  if (parent) {
    back.hidden = false;
    back.onclick = function () { location.hash = parent.id; };
    back.setAttribute("aria-label", "Back to " + parent.center);
  } else {
    back.hidden = true;
    back.onclick = null;
  }

  var crumb = $("crumb");
  crumb.innerHTML = "";
  path.forEach(function (item, index) {
    if (index > 0) {
      var sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      sep.setAttribute("aria-hidden", "true");
      crumb.appendChild(sep);
    }
    if (item.id === unit.id) {
      var here = document.createElement("span");
      here.className = "here";
      here.textContent = item.center;
      here.setAttribute("aria-current", "page");
      crumb.appendChild(here);
    } else {
      var jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = item.center;
      jump.addEventListener("click", function () { location.hash = item.id; });
      crumb.appendChild(jump);
    }
  });

  var scene = $("scene");
  var changed = !!(parent && parent.scene !== unit.scene);
  scene.textContent = (changed ? "New scene · " : "Scene · ") + (unit.scene_label || unit.scene);
  scene.classList.toggle("is-new", changed);

  var tree = $("tree");
  tree.querySelectorAll(".bubble").forEach(function (node) { node.remove(); });
  tree.appendChild(makeBubble(unit.center_word, "center", unit));
  unit.words.forEach(function (word) { tree.appendChild(makeBubble(word, "child", unit)); });

  var story = $("story");
  story.innerHTML = "";
  if (state.hide) {
    story.classList.add("hidden-text");
    story.textContent = "The story is hidden. Just listen.";
  } else {
    story.classList.remove("hidden-text");
    fillWords(story, unit.story_link, unit);
  }

  var list = $("list");
  list.innerHTML = "";
  unit.sentences.forEach(function (sentence, index) {
    var row = document.createElement("div");
    row.className = "sent";
    row.dataset.index = String(index);
    var num = document.createElement("button");
    num.type = "button";
    num.className = "num";
    num.textContent = String(index + 1);
    num.setAttribute("aria-label", "Play sentence " + (index + 1));
    num.addEventListener("click", function () { startPlayback(index, "one"); });
    var body = document.createElement("div");
    body.className = "body";
    if (state.hide) {
      var hidden = document.createElement("span");
      hidden.className = "listen-only";
      hidden.textContent = "Listen";
      body.appendChild(hidden);
    } else {
      fillWords(body, sentence.text, unit);
    }
    body.addEventListener("click", function (event) {
      if (event.target.closest(".wmark")) return;
      startPlayback(index, "one");
    });
    row.appendChild(num);
    row.appendChild(body);
    list.appendChild(row);
  });

  state.scrolled = -2;
  highlight();
  requestAnimationFrame(drawLines);
}

function drawLines() {
  var tree = $("tree");
  var svg = $("lines");
  var box = tree.getBoundingClientRect();
  if (box.width < 20 || box.height < 20) return;
  svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
  svg.setAttribute("width", String(box.width));
  svg.setAttribute("height", String(box.height));
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var ns = "http://www.w3.org/2000/svg";
  function mid(el) {
    var rect = el.getBoundingClientRect();
    return {
      x: rect.left - box.left + rect.width / 2,
      y: rect.top - box.top + rect.height / 2
    };
  }
  function edgePoint(el, toward) {
    var rect = el.getBoundingClientRect();
    var cx = rect.left - box.left + rect.width / 2;
    var cy = rect.top - box.top + rect.height / 2;
    var dx = toward.x - cx;
    var dy = toward.y - cy;
    var rx = Math.max(rect.width / 2, 1);
    var ry = Math.max(rect.height / 2, 1);
    var denom = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) || 1;
    var pad = 6;
    var t = Math.max(0, (1 / denom) - (pad / (Math.hypot(dx, dy) || 1)));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  function addLine(a, b, className) {
    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", a.x.toFixed(1));
    line.setAttribute("y1", a.y.toFixed(1));
    line.setAttribute("x2", b.x.toFixed(1));
    line.setAttribute("y2", b.y.toFixed(1));
    line.setAttribute("class", className);
    svg.appendChild(line);
  }
  var center = tree.querySelector(".bubble.center");
  var kids = Array.prototype.slice.call(tree.querySelectorAll(".bubble.child"));
  if (!center || kids.length !== 3) return;
  var c = mid(center);
  var pts = kids.map(mid);
  for (var s = 0; s < 3; s++) {
    var a = kids[s];
    var b = kids[(s + 1) % 3];
    addLine(edgePoint(a, pts[(s + 1) % 3]), edgePoint(b, pts[s]), "sib");
  }
  kids.forEach(function (kid, index) {
    addLine(edgePoint(center, pts[index]), edgePoint(kid, c), "spoke" + (kid.classList.contains("has-child") ? " next" : ""));
  });
}

function highlight() {
  var unit = currentUnit();
  if (!unit) return;
  var sentence = state.index >= 0 ? unit.sentences[state.index] : null;
  Array.prototype.forEach.call(document.querySelectorAll(".bubble"), function (bubble) {
    var hot = !!(sentence && containsTerm(sentence.text, bubble.dataset.word || ""));
    bubble.classList.toggle("hot", hot);
  });
  var rows = document.querySelectorAll(".sent");
  Array.prototype.forEach.call(rows, function (row) {
    var on = Number(row.dataset.index) === state.index;
    row.classList.toggle("on", on);
    if (on) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  });
  if (state.index >= 0 && state.index !== state.scrolled && rows[state.index]) {
    state.scrolled = state.index;
    try {
      rows[state.index].scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    } catch (e) {
      rows[state.index].scrollIntoView(false);
    }
  }
  updateDock();
  if (state.card) renderCard();
}

function updateDock() {
  var unit = currentUnit();
  var len = unit ? unit.sentences.length : 0;
  $("prev").disabled = !unit || state.index <= 0;
  $("next").disabled = !unit || (state.index >= len - 1 && state.index !== -1);
  $("stop").disabled = !state.playing;
  $("playAll").setAttribute("aria-pressed", state.playing && state.mode === "all" ? "true" : "false");
  Array.prototype.forEach.call($("repeatSeg").querySelectorAll("button"), function (btn) {
    var value = btn.getAttribute("data-repeat");
    var on = value === "inf" ? state.repeat === Infinity : Number(value) === state.repeat;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  Array.prototype.forEach.call($("gapSeg").querySelectorAll("button"), function (btn) {
    btn.setAttribute("aria-pressed", Number(btn.getAttribute("data-gap")) === state.gap ? "true" : "false");
  });
  var speed = $("speed");
  var shown = clampSpeed(speed.value);
  if (shown !== state.speed) speed.value = String(state.speed);
  speed.setAttribute("aria-valuenow", state.speed.toFixed(1));
  $("speedVal").textContent = state.speed.toFixed(1) + "×";
  $("hideText").setAttribute("aria-pressed", state.hide ? "true" : "false");
  $("glossBtn").setAttribute("aria-pressed", state.gloss ? "true" : "false");
  $("status").textContent = statusText(len);
  document.body.classList.toggle("is-playing", state.playing);
}

function statusText(len) {
  if (state.note) return state.note;
  if (!len || state.index < 0) return "Tap a sentence to listen.";
  var place = "Sentence " + (state.index + 1) + " of " + len;
  if (!state.playing) return place;
  if (state.repeat === Infinity) return place + " · repeating";
  return place + " · play " + state.repNow + " of " + state.repeat;
}

function stopPlayback() {
  playToken += 1;
  clearTimeout(gapTimer);
  audio.onended = null;
  audio.onplaying = null;
  audio.onerror = null;
  try { audio.pause(); } catch (e) {}
  state.playing = false;
  state.mode = "";
}

function afterGap(token, fn) {
  var ms = state.gap * 1000;
  if (ms <= 0) fn();
  else gapTimer = setTimeout(function () {
    if (token !== playToken) return;
    fn();
  }, ms);
}

function startPlayback(index, mode) {
  var unit = currentUnit();
  if (!unit || !unit.sentences.length) return;
  if (index < 0) index = 0;
  if (index >= unit.sentences.length) index = unit.sentences.length - 1;
  var token = ++playToken;
  clearTimeout(gapTimer);
  state.playing = true;
  state.mode = mode;
  state.note = "";
  state.index = index;
  highlight();
  playOnce(unit, index, 0, token, mode);
}

function playOnce(unit, index, doneBefore, token, mode) {
  if (token !== playToken) return;
  if (currentUnit() !== unit) return;
  var sentence = unit.sentences[index];
  state.index = index;
  state.repNow = doneBefore + 1;
  highlight();
  var absolute = new URL(sentence.audio, document.baseURI).href;
  audio.onended = null;
  audio.onplaying = null;
  audio.onerror = null;
  if (audio.src !== absolute) audio.src = sentence.audio;
  audio.playbackRate = state.speed;
  try { audio.currentTime = 0; } catch (e) {}
  audio.onplaying = function () {
    if (token !== playToken) return;
    audio.playbackRate = state.speed;
  };
  audio.onended = function () {
    if (token !== playToken) return;
    var finished = doneBefore + 1;
    if (finished < state.repeat) afterGap(token, function () { playOnce(unit, index, finished, token, mode); });
    else if (mode === "all" && index + 1 < unit.sentences.length) afterGap(token, function () { playOnce(unit, index + 1, 0, token, mode); });
    else {
      state.playing = false;
      state.mode = "";
      state.repNow = finished;
      highlight();
    }
  };
  audio.onerror = function () {
    if (token !== playToken) return;
    if (audio.error && audio.error.code === 1) return;
    state.playing = false;
    state.mode = "";
    state.note = "This audio file did not play.";
    highlight();
  };
  var pending = audio.play();
  if (pending && pending.catch) {
    pending.catch(function () {
      if (token !== playToken) return;
      state.playing = false;
      state.mode = "";
      state.note = "Tap the sentence again to play.";
      highlight();
    });
  }
}

function step(dir) {
  var unit = currentUnit();
  if (!unit) return;
  var index = state.index < 0 ? 0 : state.index + dir;
  if (index < 0 || index >= unit.sentences.length) return;
  startPlayback(index, state.playing && state.mode === "all" ? "all" : "one");
}

function openCard(word, childId) {
  state.card = { word: word, childId: childId || null };
  state.cardReturn = document.activeElement;
  $("sheet").hidden = false;
  renderCard();
  $("cardClose").focus();
}
function closeCard() {
  state.card = null;
  $("sheet").hidden = true;
  if (state.cardReturn && state.cardReturn.focus) {
    try { state.cardReturn.focus(); } catch (e) {}
  }
}
function renderCard() {
  var card = state.card;
  if (!card) return;
  var word = card.word;
  $("cardPos").textContent = word.pos || "";
  $("cardWord").textContent = word.word;
  $("cardIpa").textContent = word.ipa || "";
  $("cardDef").textContent = word.definition || "";
  var gloss = $("cardGloss");
  if (state.gloss && word.gloss) {
    gloss.hidden = false;
    gloss.textContent = word.gloss;
  } else {
    gloss.hidden = true;
    gloss.textContent = "";
  }
  var go = $("cardGo");
  if (card.childId && byId[card.childId]) {
    go.hidden = false;
    go.textContent = "Open " + word.word + " ›";
  } else {
    go.hidden = true;
  }
}

function onHash() {
  stopPlayback();
  state.index = -1;
  state.repNow = 0;
  state.note = "";
  state.scrolled = -2;
  closeCard();
  renderUnit();
}

function bind() {
  $("playAll").addEventListener("click", function () { startPlayback(0, "all"); });
  $("stop").addEventListener("click", function () {
    stopPlayback();
    state.note = "";
    highlight();
  });
  $("prev").addEventListener("click", function () { step(-1); });
  $("next").addEventListener("click", function () { step(1); });
  $("repeatSeg").addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    var value = btn.getAttribute("data-repeat");
    state.repeat = value === "inf" ? Infinity : Number(value);
    saveSettings();
    updateDock();
  });
  $("gapSeg").addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    state.gap = Number(btn.getAttribute("data-gap"));
    saveSettings();
    updateDock();
  });
  $("speed").addEventListener("input", function () {
    state.speed = clampSpeed($("speed").value);
    $("speedVal").textContent = state.speed.toFixed(1) + "×";
    $("speed").setAttribute("aria-valuenow", state.speed.toFixed(1));
    audio.playbackRate = state.speed;
    saveSettings();
  });
  $("hideText").addEventListener("click", function () {
    state.hide = !state.hide;
    saveSettings();
    renderUnit();
  });
  $("glossBtn").addEventListener("click", function () {
    state.gloss = !state.gloss;
    saveSettings();
    renderUnit();
  });
  $("cardClose").addEventListener("click", closeCard);
  $("sheetBack").addEventListener("click", closeCard);
  $("cardGo").addEventListener("click", function () {
    if (state.card && state.card.childId) location.hash = state.card.childId;
  });
  $("sheet").addEventListener("keydown", function (event) {
    if ($("sheet").hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCard();
      return;
    }
    if (event.key !== "Tab") return;
    var items = Array.prototype.filter.call($("sheet").querySelectorAll("button"), function (btn) { return !btn.hidden; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!$("sheet").hidden) return;
    var tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    else if (event.key === " ") {
      event.preventDefault();
      if (state.playing) {
        stopPlayback();
        state.note = "";
        highlight();
      } else startPlayback(state.index < 0 ? 0 : state.index, "one");
    }
  });
  window.addEventListener("hashchange", onHash);
  var tree = $("tree");
  if (window.ResizeObserver) new ResizeObserver(drawLines).observe(tree);
  else window.addEventListener("resize", drawLines);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLines);
}

function showError(message) {
  $("boot").hidden = false;
  $("boot").textContent = message;
}

async function init() {
  loadSettings();
  var response;
  try {
    response = await fetch("data/units.json");
  } catch (e) {
    showError("Could not load data/units.json.");
    return;
  }
  if (!response.ok) {
    showError("Could not load data/units.json (" + response.status + ").");
    return;
  }
  var data = await response.json();
  UNITS = data.units || [];
  byId = {};
  UNITS.forEach(function (unit) { byId[unit.id] = unit; });
  if (!byId.library) {
    showError("The lesson file has no library unit.");
    return;
  }
  bind();
  if (!byId[hashId()]) history.replaceState(null, "", "#library");
  $("boot").hidden = true;
  $("stage").hidden = false;
  $("dock").hidden = false;
  renderUnit();
}

init();
