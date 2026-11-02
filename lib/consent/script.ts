import { CONSENT_COPY, CONSENT_WORDING_VERSION } from "./copy";
import { tagPatterns } from "./pixels";

export const CONSENT_CHOICE_PATH = "/api/public/consent";
export const CONSENT_INSTALL_PATH = "/api/public/consent/install";

export function consentScriptPath(clientKey: string) {
  return `/api/public/consent/script?client=${encodeURIComponent(clientKey)}`;
}

function htmlAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function embed(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Runs before other tags. Holds our pixels until a saved choice allows them. */
export function blockerPrelude(clientKey: string) {
  const config = embed({
    storageKey: `diver_consent_${clientKey}`,
    version: CONSENT_WORDING_VERSION,
    tags: tagPatterns(),
  });
  return `<script data-diver-consent-snippet="1">
(function () {
  var config = ${config};
  if (window.__diverConsentHold) return;
  window.__diverConsentHold = true;
  var RANK = { reject: 0, low: 1, medium: 2, high: 3 };
  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(config.storageKey) || "null");
      if (!parsed || parsed.version !== config.version || parsed.action === "withdraw") return null;
      return parsed;
    } catch (error) { return null; }
  }
  function allowed(need) {
    var choice = read();
    if (!choice || !choice.level || choice.level === "reject") return false;
    return (RANK[choice.level] || 0) >= (RANK[need] || 99);
  }
  function needFor(text, marked) {
    if (marked === "low" || marked === "medium" || marked === "high") return marked;
    var tags = config.tags;
    for (var i = 0; i < tags.length; i++) if (text.indexOf(tags[i].p) !== -1) return tags[i].n;
    return "";
  }
  function ours(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.getAttribute && node.getAttribute("data-diver-consent-snippet") === "1") return true;
    var src = (node.src || (node.getAttribute && node.getAttribute("src")) || "");
    return String(src).indexOf("/api/public/consent/script") !== -1;
  }
  function hold(node) {
    if (!node || node.tagName !== "SCRIPT" || ours(node) || node.getAttribute("data-diver-held")) return;
    var marked = node.getAttribute("data-diver-consent");
    var src = node.src || node.getAttribute("src") || "";
    var need = needFor(String(src) + " " + (node.textContent || ""), marked);
    if (!need || allowed(need)) return;
    node.type = "text/plain";
    node.setAttribute("data-diver-held", need);
    if (src) { node.setAttribute("data-diver-src", src); node.removeAttribute("src"); }
  }
  var srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  if (srcDesc && srcDesc.set && srcDesc.get) {
    Object.defineProperty(HTMLScriptElement.prototype, "src", {
      configurable: true,
      enumerable: srcDesc.enumerable,
      get: srcDesc.get,
      set: function (value) {
        var need = needFor(String(value), this.getAttribute("data-diver-consent"));
        if (need && !allowed(need)) {
          this.type = "text/plain";
          this.setAttribute("data-diver-held", need);
          this.setAttribute("data-diver-src", value);
          return;
        }
        return srcDesc.set.call(this, value);
      }
    });
  }
  var original = Document.prototype.createElement;
  Document.prototype.createElement = function (name) {
    var element = original.call(this, name);
    if (String(name).toLowerCase() !== "script") return element;
    var set = element.setAttribute;
    element.setAttribute = function (attr, value) {
      if (String(attr).toLowerCase() === "src" && needFor(String(value), element.getAttribute("data-diver-consent")) && !allowed(needFor(String(value), element.getAttribute("data-diver-consent")))) {
        var need = needFor(String(value), element.getAttribute("data-diver-consent"));
        element.type = "text/plain";
        set.call(element, "data-diver-held", need);
        return set.call(element, "data-diver-src", value);
      }
      return set.call(element, attr, value);
    };
    return element;
  };
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        hold(node);
        if (node.querySelectorAll) node.querySelectorAll("script").forEach(hold);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll("script").forEach(hold);
})();
</script>`;
}

export function consentSnippet(origin: string, clientKey: string) {
  const base = origin.replace(/\/$/, "");
  const src = htmlAttr(`${base}${consentScriptPath(clientKey)}`);
  return `${blockerPrelude(clientKey)}\n<script src="${src}"></script>`;
}

export function consentScriptSource(input: { clientKey: string; choiceUrl: string; installUrl: string }) {
  const config = embed({
    clientKey: input.clientKey,
    choiceUrl: input.choiceUrl,
    installUrl: input.installUrl,
    storageKey: `diver_consent_${input.clientKey}`,
    version: CONSENT_WORDING_VERSION,
    wording: CONSENT_COPY,
    tags: tagPatterns(),
  });
  return `/* Diver AI consent. Draft wording. Not a Concord integration. */
(function () {
  var config = ${config};
  if (window.__diverConsentWidget) return;
  window.__diverConsentWidget = true;
  var RANK = { reject: 0, low: 1, medium: 2, high: 3 };
  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(config.storageKey) || "null");
      if (!parsed || parsed.version !== config.version) return null;
      return parsed;
    } catch (error) { return null; }
  }
  function allowed(need) {
    var choice = read();
    if (!choice || choice.action === "withdraw" || !choice.level || choice.level === "reject") return false;
    return (RANK[choice.level] || 0) >= (RANK[need] || 99);
  }
  function id(name) {
    var key = config.storageKey + ":" + name;
    try {
      var current = localStorage.getItem(key);
      if (current) return current;
      var next = "diver_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(key, next);
      return next;
    } catch (error) { return "diver_" + Date.now().toString(36); }
  }
  var visitorId = id("visitor");
  var deviceId = id("device");
  function release() {
    document.querySelectorAll("script[data-diver-held]").forEach(function (node) {
      var need = node.getAttribute("data-diver-held") || "high";
      if (!allowed(need)) return;
      var fresh = document.createElement("script");
      var src = node.getAttribute("data-diver-src");
      if (src) fresh.src = src;
      else fresh.text = node.textContent || "";
      node.replaceWith(fresh);
    });
  }
  function send(level, action) {
    var match = window.DiverConsentMatch || {};
    function text(value) { return typeof value === "string" ? value : ""; }
    return fetch(config.choiceUrl, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        clientKey: config.clientKey,
        visitorId: visitorId,
        deviceId: deviceId,
        level: level,
        action: action,
        pageUrl: location.href,
        wordingVersion: config.version,
        email: text(match.email),
        phone: text(match.phone),
        ghlContactId: text(match.ghlContactId),
        gclid: text(match.gclid),
        fbclid: text(match.fbclid),
        gbraid: text(match.gbraid),
        wbraid: text(match.wbraid)
      })
    }).then(function (response) { return response.ok; }).catch(function () { return false; });
  }
  var root = document.createElement("section");
  root.setAttribute("data-diver-consent", "widget");
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;max-width:380px;padding:16px;border:1px solid #d4d4d8;border-radius:16px;background:#fff;color:#18181b;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.12)";
  function button(label, onClick) {
    var node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.style.cssText = "min-height:44px;margin:4px 4px 0 0;padding:0 12px;border:1px solid #18181b;border-radius:999px;background:#18181b;color:#fff;font:inherit;cursor:pointer";
    node.addEventListener("click", onClick);
    return node;
  }
  function showError(parent) {
    var error = document.createElement("p");
    error.textContent = "We could not save that choice. Tracking stays off.";
    parent.appendChild(error);
  }
  function render() {
    root.replaceChildren();
    var banner = document.createElement("p");
    banner.textContent = config.wording.banner;
    banner.style.cssText = "margin:0 0 8px;font-weight:700";
    root.appendChild(banner);
    var choice = read();
    if (choice && choice.action !== "withdraw") {
      var saved = document.createElement("p");
      saved.textContent = config.wording.title + " — " + choice.level + ". " + config.wording.change;
      root.appendChild(saved);
      root.appendChild(button("Change", function () { localStorage.removeItem(config.storageKey); render(); }));
      root.appendChild(button("Withdraw", function () {
        send("reject", "withdraw").then(function (ok) {
          if (!ok) { showError(root); return; }
          localStorage.setItem(config.storageKey, JSON.stringify({ level: "reject", action: "withdraw", version: config.version }));
          render();
        });
      }));
      document.documentElement.appendChild(root);
      release();
      return;
    }
    var title = document.createElement("h2");
    title.textContent = config.wording.title;
    title.style.cssText = "margin:0 0 8px;font-size:18px";
    var intro = document.createElement("p");
    intro.textContent = config.wording.intro;
    root.appendChild(title);
    root.appendChild(intro);
    var levels = [
      ["low", "grant", config.wording.lowTitle, config.wording.lowBody],
      ["medium", "grant", config.wording.mediumTitle, config.wording.mediumBody],
      ["high", "grant", config.wording.highTitle, config.wording.highBody],
      ["reject", "grant", config.wording.rejectTitle, config.wording.rejectBody]
    ];
    levels.forEach(function (row) {
      var copy = document.createElement("p");
      copy.textContent = row[3];
      root.appendChild(copy);
      root.appendChild(button(row[2], function () {
        send(row[0], row[1]).then(function (ok) {
          if (!ok) { showError(root); return; }
          localStorage.setItem(config.storageKey, JSON.stringify({ level: row[0], action: row[1], version: config.version }));
          release();
          render();
        });
      }));
    });
    var note = document.createElement("p");
    note.textContent = config.wording.footnote + " " + config.wording.withdraw;
    root.appendChild(note);
    document.documentElement.appendChild(root);
  }
  fetch(config.installUrl, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ clientKey: config.clientKey, pageUrl: location.href, visitorId: visitorId, deviceId: deviceId })
  }).catch(function () {});
  if (document.body) render();
  else document.addEventListener("DOMContentLoaded", render);
})();
`;
}
