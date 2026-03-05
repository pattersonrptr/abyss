// ============================================================
//  LOOKING INTO THE ABYSS :: script.js   version: 1.0
// ============================================================

var SITE_VERSION = "1.0";
var API          = "/cgi-bin/api.pl";
// NOTE: visible in page source by design -- client-side JS cannot hide secrets.
// Its purpose is to protect the .bin files from direct filesystem access
// (e.g. FTP/server breach). api.pl never sees this key; it stores ciphertext as-is.
var KEY          = "<L00k 1nto the Abyss>";

// ============================================================
//  CRYPTO (XOR stream cipher + base64, 90s style)
//  Client encrypts before sending; server stores the ciphertext.
//  Without the key, the .bin files are unreadable even with server access.
// ============================================================

function xorEncrypt(text, nonce) {
  var stream = KEY + String(nonce);   // unique keystream per message
  var out = '';
  for (var i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ stream.charCodeAt(i % stream.length));
  }
  return btoa(out);
}

function xorDecrypt(b64, nonce) {
  try {
    var stream = KEY + String(nonce);   // must match the nonce used at encrypt time
    var raw = atob(b64);
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ stream.charCodeAt(i % stream.length));
    }
    return out;
  } catch (e) {
    console.error('[xorDecrypt] ' + e);
    return b64;
  }
}

// ============================================================
//  HTTP (XMLHttpRequest, pure style)
// ============================================================

function xhrGet(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status === 200) {
      try       { callback(null, JSON.parse(xhr.responseText)); }
      catch (e) { callback("Error parsing server response.", null); }
    } else {
      callback("HTTP error " + xhr.status, null);
    }
  };
  xhr.send();
}

function xhrPost(url, params, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", url, true);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status === 200) {
      try       { callback(null, JSON.parse(xhr.responseText)); }
      catch (e) { callback("Error parsing server response.", null); }
    } else {
      callback("HTTP error " + xhr.status, null);
    }
  };
  xhr.send(params);
}

// ============================================================
//  NAVIGATION
// ============================================================

var VIEWS = ["list", "question", "new", "about"];

function showView(name) {
  var i;
  for (i = 0; i < VIEWS.length; i++) {
    var el = document.getElementById("view-" + VIEWS[i]);
    if (el) el.style.display = "none";
  }
  var target = document.getElementById("view-" + name);
  if (target) target.style.display = "block";
  if (name === "list") fetchList();
}

// ============================================================
//  LIST
// ============================================================

function fetchList() {
  var el = document.getElementById("list-content");
  el.innerHTML = "<p class=\"no-answers\">loading...</p>";

  xhrGet(API + "?action=list", function(err, questions) {
    if (err || !questions) {
      el.innerHTML = "<p class=\"no-answers\">Error loading questions.</p>";
      return;
    }
    el.innerHTML = renderListHTML(questions);
  });
}

function renderListHTML(questions) {
  var html = "";
  var i;

  if (questions.length === 0) {
    return "<p class=\"no-answers\">No questions yet. <a href=\"#\" onclick=\"showView('new'); return false;\">Be the first.</a></p>";
  }

  html += "<table class=\"tb-list\"><tbody>";
  for (i = 0; i < questions.length; i++) {
    var q       = questions[i];
    var text    = xorDecrypt(q.text, q.ts);
    var preview = text.length > 110 ? text.substring(0, 110) + "..." : text;
    var n       = q.num_answers || 0;
    var label   = n === 0 ? "no answers" : (n === 1 ? "1 answer" : n + " answers");
    var numClass = n === 0 ? "question-num unanswered" : "question-num";
    html += "<tr class=\"question-row\">";
    html += "<td class=\"" + numClass + "\">#" + q.id + "</td>";
    html += "<td><a href=\"#\" class=\"question-link\" onclick=\"viewQuestion(" + q.id + "); return false;\">" + escapeHTML(preview) + "</a></td>";
    html += "<td class=\"list-meta\">" + label + "<br>" + formatDate(q.ts) + "</td>";
    html += "</tr>";
  }
  html += "</tbody></table>";
  var n = questions.length;
  html += "<p class=\"list-footer\">" + n + (n === 1 ? " question" : " questions") + " in the void</p>";
  return html;
}

// ============================================================
//  QUESTION DETAIL
// ============================================================

function viewQuestion(id) {
  var el = document.getElementById("question-content");
  document.getElementById("view-list").style.display     = "none";
  document.getElementById("view-question").style.display = "block";
  el.innerHTML = "<p class=\"no-answers\">loading...</p>";

  xhrGet(API + "?action=view&id=" + id, function(err, question) {
    if (err || !question || question.error) {
      el.innerHTML = "<p class=\"no-answers\">Error loading question.</p>";
      return;
    }
    el.innerHTML = renderDetailHTML(question);
  });
}

function renderDetailHTML(question) {
  var html = "";
  var i;

  html += "<div class=\"question-box\">";
  html += "<p class=\"question-text\">" + escapeHTML(xorDecrypt(question.text, question.ts)) + "</p>";
  html += "<p class=\"detail-meta\">posted on " + formatDate(question.ts) + "</p>";
  html += "</div>";

  var answers  = question.answers || [];
  var nAnswers = answers.length;
  html += "<p class=\"section-label\">[ " +
    (nAnswers === 0 ? "NO ANSWERS YET" : nAnswers === 1 ? "1 ANSWER" : nAnswers + " ANSWERS") +
    " ]</p>";

  if (nAnswers === 0) {
    html += "<p class=\"no-answers\">Total silence. Be the first to answer.</p>";
  } else {
    for (i = 0; i < nAnswers; i++) {
      var a = answers[i];
      html += "<div class=\"answer-box\">";
      html += "<p>" + escapeHTML(xorDecrypt(a.text, a.ts)) + "</p>";
      html += "<p class=\"answer-meta\">anonymous &bull; " + formatDate(a.ts) + "</p>";
      html += "</div>";
    }
  }

  html += "<hr class=\"divider\">";
  html += "<p class=\"section-label\">[ YOUR ANSWER ]</p>";
  html += "<form onsubmit=\"submitAnswer(" + question.id + "); return false;\">";
  html += "<textarea id=\"txt-answer\" rows=\"4\" placeholder=\"write without filters...\" oninput=\"charCount('txt-answer','cc-answer',500)\"></textarea>";
  html += "<br><span id=\"cc-answer\" class=\"char-count\">0 / 500</span><br><br>";
  html += "<input type=\"submit\" value=\"[ Submit Anonymously ]\" class=\"btn-submit\">";
  html += "</form>";

  return html;
}

// ============================================================
//  SUBMIT ANSWER
// ============================================================

function submitAnswer(questionId) {
  var el  = document.getElementById("txt-answer");
  var txt = el ? el.value.trim() : "";
  if (!txt) { notify("Write something before submitting.", true); return; }

  var ts     = Math.floor(Date.now() / 1000);
  var params = "action=answer&id=" + questionId + "&ts=" + ts + "&text=" + encodeURIComponent(xorEncrypt(txt, ts));

  xhrPost(API, params, function(err, resp) {
    if (err || !resp || resp.error) {
      notify("Error submitting answer: " + (resp && resp.error ? resp.error : err), true);
      return;
    }
    notify("Answer posted anonymously.");
    viewQuestion(questionId);
  });
}

// ============================================================
//  SUBMIT NEW QUESTION
// ============================================================

function submitQuestion() {
  var el  = document.getElementById("txt-new-question");
  var txt = el ? el.value.trim() : "";
  if (!txt)            { notify("The question cannot be blank.", true); return; }
  if (txt.length < 15) { notify("Question too short. Elaborate a little more.", true); return; }

  var ts     = Math.floor(Date.now() / 1000);
  var params = "action=question&ts=" + ts + "&text=" + encodeURIComponent(xorEncrypt(txt, ts));

  xhrPost(API, params, function(err, resp) {
    if (err || !resp || resp.error) {
      notify("Error publishing: " + (resp && resp.error ? resp.error : err), true);
      return;
    }
    el.value = "";
    notify("Question published anonymously.");
    showView("list");
  });
}

// ============================================================
//  RANDOM QUESTION
// ============================================================

var lastQuestionList = [];
function randomQuestion() {
  xhrGet(API + "?action=list", function(err, questions) {
    if (err || !questions || questions.length === 0) {
      notify("No questions yet.", true);
      return;
    }
    var pick = questions[Math.floor(Math.random() * questions.length)];
    viewQuestion(pick.id);
  });
}

// ============================================================
//  CHAR COUNTER
// ============================================================

function charCount(textareaId, counterId, max) {
  var ta  = document.getElementById(textareaId);
  var el  = document.getElementById(counterId);
  if (!ta || !el) return;
  var len = ta.value.length;
  el.innerHTML = len + " / " + max;
  el.className = len > max ? "char-count over" : "char-count";
}

// ============================================================
//  UTILITIES
// ============================================================

function escapeHTML(str) {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function formatDate(ts) {
  var d   = new Date(ts * 1000);
  var day = d.getDate();
  var mon = d.getMonth() + 1;
  var yr  = d.getFullYear();
  if (day < 10) day = "0" + day;
  if (mon < 10) mon = "0" + mon;
  return day + "/" + mon + "/" + yr;
}

// ============================================================
//  LIGHT / DARK THEME
// ============================================================

function toggleTheme() {
  var body = document.body;
  var btn  = document.getElementById("btnTheme");
  if (body.className === "light") {
    body.className = "";
    btn.innerHTML  = "&#9790;";
    btn.title      = "Switch to light mode";
  } else {
    body.className = "light";
    btn.innerHTML  = "&#9728;";
    btn.title      = "Switch to dark mode";
  }
}

// ============================================================
//  NOTIFY BAR  (replaces alert() -- 90s status-bar style)
// ============================================================

var notifyTimer = null;
function notify(msg, isError) {
  var bar = document.getElementById("notify-bar");
  if (!bar) return;
  bar.innerHTML    = (isError ? "[ ERROR ] " : "[ OK ] ") + escapeHTML(msg);
  bar.className    = isError ? "error" : "ok";
  bar.style.display = "block";
  window.status    = msg;
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(function() {
    bar.style.display = "none";
    window.status     = "";
  }, 3500);
}

// ============================================================
//  STATUS BAR
// ============================================================

var statusMsg = "   [ ABYSS ] questions without owners. answers without faces.   ";
var statusPos = 0;
function animateStatus() {
  window.status = statusMsg.substring(statusPos) + statusMsg.substring(0, statusPos);
  statusPos     = (statusPos + 1) % statusMsg.length;
}

// ============================================================
//  INIT
// ============================================================

function init() {
  var el = document.getElementById("siteVersion");
  if (el) el.innerHTML = SITE_VERSION;

  showView("list");
  setInterval(animateStatus, 120);
}
