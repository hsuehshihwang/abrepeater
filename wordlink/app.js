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
  card: null,
  furthest: 0,
  resumed: false
};
var playToken = 0;
var gapTimer = 0;
var audio = new Audio();
audio.preload = "none";
var COURSE_KEY = "wordlink:course";

var $ = function (id) { return document.getElementById(id); };

function hashId() {
  return decodeURIComponent((location.hash || "").replace(/^#/, ""));
}
function currentUnit() {
  return byId[hashId()] || UNITS[0] || null;
}
function unitIndex(unit) {
  return UNITS.indexOf(unit);
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
  var lower = String(text || "").toLowerCase();
  var want = String(term || "").toLowerCase();
  var from = 0;
  while (from <= lower.length) {
    var at = lower.indexOf(want, from);
    if (at < 0) return false;
    if (isBoundary(text, at, at + want.length)) return true;
    from = at + 1;
  }
  return false;
}
function wordEntries(unit) {
  return [{ data: unit.center_word, kind: "center" }].concat(unit.words.map(function (word) {
    return { data: word, kind: word.key ? "key" : "child" };
  }));
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
function loadCourse() {
  state.saved = "";
  state.furthest = 0;
  try {
    var saved = JSON.parse(localStorage.getItem(COURSE_KEY) || "null");
    if (saved && byId[saved.current]) state.saved = saved.current;
    if (saved && typeof saved.furthest === "number") state.furthest = saved.furthest;
  } catch (e) {}
}
function saveCourse() {
  var unit = currentUnit();
  if (!unit) return;
  var reached = unitIndex(unit) + 1;
  if (reached > state.furthest) state.furthest = reached;
  try {
    localStorage.setItem(COURSE_KEY, JSON.stringify({ current: unit.id, furthest: state.furthest }));
  } catch (e) {}
}
function goUnit(id) {
  if (byId[id]) location.hash = id;
}
function fillWords(node, text, unit) {
  linkParts(text, wordEntries(unit)).forEach(function (part) {
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
      openCard(part.entry.data, nextUnitId(unit, part.entry.data));
    });
    node.appendChild(btn);
  });
}
function nextUnitId(unit, word) {
  if (!word || !word.key) return null;
  var nxt = UNITS[unitIndex(unit) + 1];
  return nxt ? nxt.id : null;
}
function renderUnit() {
  var unit = currentUnit();
  if (!unit) return;
  var index = unitIndex(unit);
  document.title = "Wordlink · " + (index + 1) + " " + unit.center;
  $("unitLabel").textContent = "Unit " + (index + 1) + "/" + UNITS.length;
  $("prevUnit").disabled = index <= 0;
  $("nextUnit").disabled = index >= UNITS.length - 1;
  $("continueNote").hidden = !state.resumed;

  var strip = $("strip");
  strip.innerHTML = "";
  UNITS.forEach(function (item, itemIndex) {
    if (itemIndex > 0) {
      var sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      sep.setAttribute("aria-hidden", "true");
      strip.appendChild(sep);
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.center;
    if (item.id === unit.id) btn.className = "now";
    else if (itemIndex < state.furthest) btn.className = "reached";
    btn.setAttribute("aria-current", item.id === unit.id ? "true" : "false");
    btn.addEventListener("click", function () { goUnit(item.id); });
    strip.appendChild(btn);
  });
  var currentStep = strip.querySelector(".now");
  if (currentStep) {
    var left = currentStep.offsetLeft - (strip.clientWidth - currentStep.offsetWidth) / 2;
    strip.scrollLeft = Math.max(0, left);
  }

  var parent = index > 0 ? UNITS[index - 1] : null;
  var scene = $("scene");
  var changed = !!(parent && parent.scene !== unit.scene);
  scene.textContent = (changed ? "New scene · " : "Scene · ") + (unit.scene_label || unit.scene);
  scene.classList.toggle("is-new", changed);

  var heading = $("centerName");
  heading.innerHTML = "";
  var centerBtn = document.createElement("button");
  centerBtn.type = "button";
  centerBtn.textContent = unit.center;
  centerBtn.setAttribute("aria-label", "Word card: " + unit.center);
  centerBtn.addEventListener("click", function () { openCard(unit.center_word, null); });
  heading.appendChild(centerBtn);

  var row = $("words");
  row.innerHTML = "";
  unit.words.forEach(function (word) {
    var chip = document.createElement("div");
    chip.className = "chip" + (word.key ? " is-key" : "");
    chip.dataset.word = word.word;
    var main = document.createElement("button");
    main.type = "button";
    main.className = "chip-main";
    var label = document.createElement("span");
    label.className = "chip-word";
    label.textContent = word.word;
    main.appendChild(label);
    if (state.gloss && word.gloss) {
      var gloss = document.createElement("span");
      gloss.className = "bg";
      gloss.lang = "zh-Hant";
      gloss.textContent = word.gloss;
      main.appendChild(gloss);
    }
    main.setAttribute("aria-label", "Word card: " + word.word);
    main.addEventListener("click", function () { openCard(word, nextUnitId(unit, word)); });
    chip.appendChild(main);
    if (word.key && index < UNITS.length - 1) {
      var next = document.createElement("button");
      next.type = "button";
      next.className = "chip-next";
      next.textContent = "Next: " + word.word + " ›";
      next.addEventListener("click", function () { goUnit(UNITS[index + 1].id); });
      chip.appendChild(next);
    }
    row.appendChild(chip);
  });

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
  unit.sentences.forEach(function (sentence, sentenceIndex) {
    var rowItem = document.createElement("div");
    rowItem.className = "sent";
    rowItem.dataset.index = String(sentenceIndex);
    var num = document.createElement("button");
    num.type = "button";
    num.className = "num";
    num.textContent = String(sentenceIndex + 1);
    num.setAttribute("aria-label", "Play sentence " + (sentenceIndex + 1));
    num.addEventListener("click", function () { startPlayback(sentenceIndex, "one"); });
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
      startPlayback(sentenceIndex, "one");
    });
    rowItem.appendChild(num);
    rowItem.appendChild(body);
    list.appendChild(rowItem);
  });

  var learned = learnedWords();
  $("reviewBtn").textContent = "Words " + learned.length;
  state.scrolled = -2;
  saveCourse();
  highlight();
}
function learnedWords() {
  var out = [];
  var seen = {};
  var limit = Math.max(state.furthest, unitIndex(currentUnit()) + 1);
  for (var i = 0; i < limit && i < UNITS.length; i++) {
    var unit = UNITS[i];
    [unit.center_word].concat(unit.words).forEach(function (word) {
      var key = word.word.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var centerId = null;
      for (var j = 0; j < limit && j < UNITS.length; j++) {
        if (UNITS[j].center.toLowerCase() === key) centerId = UNITS[j].id;
      }
      out.push({ word: word, unitId: centerId });
    });
  }
  return out;
}
function renderReview() {
  var words = learnedWords();
  $("reviewCount").textContent = words.length + " words through unit " + Math.max(state.furthest, unitIndex(currentUnit()) + 1) + ".";
  var list = $("reviewList");
  list.innerHTML = "";
  words.forEach(function (item) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review-item";
    var name = document.createElement("b");
    name.textContent = item.word.word;
    var meta = document.createElement("span");
    meta.textContent = (item.word.pos || "") + (state.gloss && item.word.gloss ? " · " + item.word.gloss : "");
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener("click", function () {
      closeReview();
      openCard(item.word, item.unitId && item.unitId !== currentUnit().id ? item.unitId : null);
    });
    list.appendChild(btn);
  });
}
function openReview() {
  state.reviewReturn = document.activeElement;
  $("review").hidden = false;
  renderReview();
  $("reviewClose").focus();
}
function closeReview() {
  $("review").hidden = true;
  if (state.reviewReturn && state.reviewReturn.focus) {
    try { state.reviewReturn.focus(); } catch (e) {}
  }
}

function highlight() {
  var unit = currentUnit();
  if (!unit) return;
  var sentence = state.index >= 0 ? unit.sentences[state.index] : null;
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (chip) {
    chip.classList.toggle("hot", !!(sentence && containsTerm(sentence.text, chip.dataset.word || "")));
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
    var scroller = document.querySelector("main");
    var box = scroller.getBoundingClientRect();
    var rowBox = rows[state.index].getBoundingClientRect();
    if (rowBox.bottom > box.bottom + 20) scroller.scrollTop += rowBox.bottom - box.bottom + 12;
    else if (rowBox.top < box.top - 8) scroller.scrollTop -= box.top - rowBox.top + 8;
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
function openCard(word, unitId) {
  state.card = { word: word, unitId: unitId || null };
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
  if (card.unitId && byId[card.unitId] && card.unitId !== currentUnit().id) {
    go.hidden = false;
    go.textContent = "Open " + byId[card.unitId].center + " ›";
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
  state.resumed = false;
  closeCard();
  closeReview();
  renderUnit();
}
function bind() {
  $("prevUnit").addEventListener("click", function () {
    var index = unitIndex(currentUnit());
    if (index > 0) goUnit(UNITS[index - 1].id);
  });
  $("nextUnit").addEventListener("click", function () {
    var index = unitIndex(currentUnit());
    if (index >= 0 && index < UNITS.length - 1) goUnit(UNITS[index + 1].id);
  });
  $("reviewBtn").addEventListener("click", openReview);
  $("reviewClose").addEventListener("click", closeReview);
  $("reviewBack").addEventListener("click", closeReview);
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
    if (state.card && state.card.unitId) goUnit(state.card.unitId);
  });
  function trap(sheet, close) {
    sheet.addEventListener("keydown", function (event) {
      if (sheet.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      var items = Array.prototype.filter.call(sheet.querySelectorAll("button"), function (btn) { return !btn.hidden; });
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
  }
  trap($("sheet"), closeCard);
  trap($("review"), closeReview);
  document.addEventListener("keydown", function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!$("sheet").hidden || !$("review").hidden) return;
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
  if (!UNITS.length) {
    showError("The lesson file has no units.");
    return;
  }
  loadCourse();
  bind();
  if (byId[hashId()]) state.resumed = false;
  else if (state.saved && byId[state.saved]) {
    state.resumed = state.saved !== UNITS[0].id;
    history.replaceState(null, "", "#" + state.saved);
  } else history.replaceState(null, "", "#" + UNITS[0].id);
  $("boot").hidden = true;
  $("stage").hidden = false;
  $("dock").hidden = false;
  renderUnit();
}

init();
