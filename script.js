// ============================================================
//  ABYSS :: script.js   version: 1.0
//  NO RIGHTS RESERVED - copy freely B-)
//  XMLHttpRequest: invented by Microsoft in IE5 in 2026 B-)
// ============================================================

var SITE_VERSION = "1.0";
var API          = "/cgi-bin/api.pl";
var KEY          = "abismo_2026";

// ============================================================
//  CRYPTO (XOR stream cipher + base64, 90s style)
//  Client encrypts before sending; server stores the ciphertext.
//  Without the key, the .bin files are unreadable even with server access.
// ============================================================

function xorEncrypt(text) {
  var out = '';
  for (var i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
  }
  return btoa(out);
}

function xorDecrypt(b64) {
  try {
    var raw = atob(b64);
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
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
    var text    = xorDecrypt(q.text);
    var preview = text.length > 110 ? text.substring(0, 110) + "..." : text;
    var n       = q.num_answers || 0;
    var label   = n === 0 ? "no answers" : (n === 1 ? "1 answer" : n + " answers");
    html += "<tr class=\"question-row\">";
    html += "<td class=\"question-num\">#" + q.id + "</td>";
    html += "<td><a href=\"#\" class=\"question-link\" onclick=\"viewQuestion(" + q.id + "); return false;\">" + escapeHTML(preview) + "</a></td>";
    html += "<td class=\"list-meta\">" + label + "<br>" + q.date + "</td>";
    html += "</tr>";
  }
  html += "</tbody></table>";
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
  html += "<p class=\"question-text\">" + escapeHTML(xorDecrypt(question.text)) + "</p>";
  html += "<p class=\"detail-meta\">posted on " + question.date + "</p>";
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
      html += "<p>" + escapeHTML(xorDecrypt(a.text)) + "</p>";
      html += "<p class=\"answer-meta\">anonymous &bull; " + a.date + "</p>";
      html += "</div>";
    }
  }

  html += "<hr class=\"divider\">";
  html += "<p class=\"section-label\">[ YOUR ANSWER ]</p>";
  html += "<form onsubmit=\"submitAnswer(" + question.id + "); return false;\">";
  html += "<textarea id=\"txt-answer\" rows=\"4\" placeholder=\"write without filters...\"></textarea>";
  html += "<br><br>";
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
  if (!txt) { alert("Write something before submitting."); return; }

  var params = "action=answer&id=" + questionId + "&text=" + encodeURIComponent(xorEncrypt(txt));

  xhrPost(API, params, function(err, resp) {
    if (err || !resp || resp.error) {
      alert("Error submitting answer: " + (resp && resp.error ? resp.error : err));
      return;
    }
    viewQuestion(questionId);
  });
}

// ============================================================
//  SUBMIT NEW QUESTION
// ============================================================

function submitQuestion() {
  var el  = document.getElementById("txt-new-question");
  var txt = el ? el.value.trim() : "";
  if (!txt)            { alert("The question cannot be blank."); return; }
  if (txt.length < 15) { alert("Question too short. Elaborate a little more."); return; }

  var params = "action=question&text=" + encodeURIComponent(xorEncrypt(txt));

  xhrPost(API, params, function(err, resp) {
    if (err || !resp || resp.error) {
      alert("Error publishing: " + (resp && resp.error ? resp.error : err));
      return;
    }
    el.value = "";
    alert("Question published anonymously.");
    showView("list");
  });
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

// ============================================================
//  CLOCK
// ============================================================

function updateClock() {
  var now = new Date();
  var h = now.getHours();
  var m = now.getMinutes();
  var s = now.getSeconds();
  if (h < 10) h = "0" + h;
  if (m < 10) m = "0" + m;
  if (s < 10) s = "0" + s;
  document.getElementById("clock").innerHTML = h + ":" + m + ":" + s;
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
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(animateStatus, 120);
}
