var Ps = Object.defineProperty;
var Ls = (t, e, n) => e in t ? Ps(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : t[e] = n;
var w = (t, e, n) => Ls(t, typeof e != "symbol" ? e + "" : e, n);
import { SessionStatus as Ms, ScribeError as yn, UploadError as Fs, ScribeClient as Us, TransportMode as En } from "med-scribe-alliance-ts-sdk";
import { createWorkerBlobUrl as Sd, getWorkerUrl as kd } from "med-scribe-alliance-ts-sdk";
const Bs = 1e4;
class Hs {
  constructor(e) {
    this.tokenRefreshPromise = null, this.accessToken = e.access_token, this.clientId = e.clientId, this.flavour = e.flavour, this.defaultTimeout = e.defaultTimeout ?? Bs, this.onUnauthorized = e.onUnauthorized;
  }
  setAuthToken(e) {
    this.accessToken = e;
  }
  async request(e) {
    try {
      return await this.executeRequest(e);
    } catch (n) {
      if (this.isUnauthorizedError(n) && this.onUnauthorized) {
        const r = await this.refreshToken();
        return this.accessToken = r, this.executeRequest(e);
      }
      throw n;
    }
  }
  async executeRequest(e) {
    const n = e.body instanceof Blob || e.body instanceof File || e.body instanceof FormData, r = this.buildHeaders(e.headers, n), s = e.timeout ?? this.defaultTimeout, i = new AbortController(), o = setTimeout(() => i.abort(), s);
    try {
      const a = await fetch(e.url, {
        method: e.method,
        headers: r,
        body: e.body != null ? n ? e.body : JSON.stringify(e.body) : void 0,
        signal: i.signal,
        credentials: "include"
      }), c = await this.parseBody(a);
      if (!a.ok)
        throw new W(
          Ir(c, a.statusText),
          a.status,
          c
        );
      return {
        status: a.status,
        data: c,
        headers: this.extractHeaders(a.headers)
      };
    } finally {
      clearTimeout(o);
    }
  }
  /** Never throws — a bad body must not mask the status, or 401 would skip refresh. */
  async parseBody(e) {
    try {
      return e.headers.get("content-type")?.includes("application/json") ? await e.json() : await e.text();
    } catch {
      return;
    }
  }
  buildHeaders(e, n) {
    const r = {};
    return n || (r["Content-Type"] = "application/json"), this.accessToken && (r.Authorization = `Bearer ${this.accessToken}`), this.clientId && (r["client-id"] = this.clientId), this.flavour && (r.flavour = this.flavour), e && Object.assign(r, e), r;
  }
  async refreshToken() {
    return this.tokenRefreshPromise ? this.tokenRefreshPromise : (this.tokenRefreshPromise = this.onUnauthorized().finally(() => {
      this.tokenRefreshPromise = null;
    }), this.tokenRefreshPromise);
  }
  isUnauthorizedError(e) {
    return e instanceof W && e.status === 401;
  }
  extractHeaders(e) {
    const n = {};
    return e.forEach((r, s) => {
      n[s] = r;
    }), n;
  }
}
class W extends Error {
  constructor(e, n, r) {
    super(e), this.status = n, this.body = r, this.name = "TransportError";
  }
}
function Ir(t, e) {
  if (typeof t == "string" && t.trim())
    return t;
  if (t && typeof t == "object") {
    const { error: n, message: r, msg: s } = t, i = n?.message ?? r ?? s;
    if (i)
      return i;
  }
  return e || "Request failed";
}
const zs = 1e4;
class js {
  constructor(e, n) {
    this.tokenRefreshPromise = null, this.pendingRequests = /* @__PURE__ */ new Map(), this.accessToken = e.access_token, this.clientId = e.clientId, this.flavour = e.flavour, this.defaultTimeout = e.defaultTimeout ?? zs, this.onUnauthorized = e.onUnauthorized, this.bridge = n, this.bridge.onResponse((r) => {
      const s = r;
      if (s?.type !== "response" || !s.correlationId) return;
      const i = this.pendingRequests.get(s.correlationId);
      i && (this.pendingRequests.delete(s.correlationId), i.resolve({
        status: s.payload.status,
        data: s.payload.data,
        headers: s.payload.headers
      }));
    });
  }
  setAuthToken(e) {
    this.accessToken = e;
  }
  destroy() {
    for (const [, e] of this.pendingRequests)
      e.reject(new W("Transport destroyed", 0));
    this.pendingRequests.clear();
  }
  async request(e) {
    try {
      return await this.executeRequest(e);
    } catch (n) {
      if (this.isUnauthorizedError(n) && this.onUnauthorized) {
        const r = await this.refreshToken();
        return this.accessToken = r, this.executeRequest(e);
      }
      throw n;
    }
  }
  async executeRequest(e) {
    const n = this.generateCorrelationId(), r = e.timeout ?? this.defaultTimeout, s = e.body instanceof Blob || e.body instanceof File || e.body instanceof FormData, i = this.buildHeaders(e.headers, s), o = {
      correlationId: n,
      type: "request",
      payload: {
        method: e.method,
        url: e.url,
        headers: i,
        body: e.body != null ? s ? e.body : JSON.stringify(e.body) : void 0
      }
    };
    return new Promise((a, c) => {
      const l = setTimeout(() => {
        this.pendingRequests.delete(n), c(new W("IPC request timed out", 408));
      }, r);
      this.pendingRequests.set(n, {
        resolve: (d) => {
          if (clearTimeout(l), d.status < 200 || d.status >= 300) {
            c(
              new W(
                Ir(d.data, `Request failed with status ${d.status}`),
                d.status,
                d.data
              )
            );
            return;
          }
          a(d);
        },
        reject: (d) => {
          clearTimeout(l), c(d);
        }
      }), this.bridge.send(o);
    });
  }
  buildHeaders(e, n) {
    const r = {};
    return n || (r["Content-Type"] = "application/json"), this.accessToken && (r.Authorization = `Bearer ${this.accessToken}`), this.clientId && (r["client-id"] = this.clientId), this.flavour && (r.flavour = this.flavour), e && Object.assign(r, e), r;
  }
  async refreshToken() {
    return this.tokenRefreshPromise ? this.tokenRefreshPromise : (this.tokenRefreshPromise = this.onUnauthorized().finally(() => {
      this.tokenRefreshPromise = null;
    }), this.tokenRefreshPromise);
  }
  isUnauthorizedError(e) {
    return e instanceof W && e.status === 401;
  }
  generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
const qs = {
  voiceV1: "https://api.dev.eka.care/voice/api/v1",
  voiceV2: "https://api.dev.eka.care/voice/api/v2",
  voiceV3: "https://api.dev.eka.care/voice/api/v3",
  cookV1: "https://deepthought-genai.dev.eka.care/api/v1",
  ekaHost: "https://api.dev.eka.care",
  parchiHost: "https://parchi.dev.eka.care"
}, Gs = {
  voiceV1: "https://api.eka.care/voice/api/v1",
  voiceV2: "https://api.eka.care/voice/api/v2",
  voiceV3: "https://api.eka.care/voice/api/v3",
  cookV1: "https://cook.eka.care/api/v1",
  ekaHost: "https://api.eka.care",
  parchiHost: "https://parchi.eka.care"
};
function Vs(t) {
  return t === "PROD" ? Gs : qs;
}
class Ws {
  constructor() {
    this.handlers = /* @__PURE__ */ new Map();
  }
  register(e, n) {
    this.handlers.has(e) || this.handlers.set(e, /* @__PURE__ */ new Set()), this.handlers.get(e).add(n);
  }
  remove(e, n) {
    this.handlers.get(e)?.delete(n);
  }
  removeAll() {
    this.handlers.clear();
  }
  async dispatch(e, ...n) {
    const r = this.handlers.get(e);
    if (!r || r.size === 0) return;
    let s;
    for (const i of r)
      try {
        const o = await i(...n);
        s === void 0 && (s = o);
      } catch (o) {
        console.error(`[EkaScribe] Callback error in '${e}':`, o);
      }
    return s;
  }
  hasHandlers(e) {
    const n = this.handlers.get(e);
    return !!n && n.size > 0;
  }
}
const _ = typeof __SENTRY_DEBUG__ > "u" || __SENTRY_DEBUG__, R = globalThis, ie = "10.43.0";
function nt() {
  return rt(R), R;
}
function rt(t) {
  const e = t.__SENTRY__ = t.__SENTRY__ || {};
  return e.version = e.version || ie, e[ie] = e[ie] || {};
}
function _e(t, e, n = R) {
  const r = n.__SENTRY__ = n.__SENTRY__ || {}, s = r[ie] = r[ie] || {};
  return s[t] || (s[t] = e());
}
const Xs = [
  "debug",
  "info",
  "warn",
  "error",
  "log",
  "assert",
  "trace"
], Ks = "Sentry Logger ", Ye = {};
function ye(t) {
  if (!("console" in R))
    return t();
  const e = R.console, n = {}, r = Object.keys(Ye);
  r.forEach((s) => {
    const i = Ye[s];
    n[s] = e[s], e[s] = i;
  });
  try {
    return t();
  } finally {
    r.forEach((s) => {
      e[s] = n[s];
    });
  }
}
function Ys() {
  Xt().enabled = !0;
}
function Zs() {
  Xt().enabled = !1;
}
function Cr() {
  return Xt().enabled;
}
function Js(...t) {
  Wt("log", ...t);
}
function Qs(...t) {
  Wt("warn", ...t);
}
function ei(...t) {
  Wt("error", ...t);
}
function Wt(t, ...e) {
  _ && Cr() && ye(() => {
    R.console[t](`${Ks}[${t}]:`, ...e);
  });
}
function Xt() {
  return _ ? _e("loggerSettings", () => ({ enabled: !1 })) : { enabled: !1 };
}
const m = {
  /** Enable logging. */
  enable: Ys,
  /** Disable logging. */
  disable: Zs,
  /** Check if logging is enabled. */
  isEnabled: Cr,
  /** Log a message. */
  log: Js,
  /** Log a warning. */
  warn: Qs,
  /** Log an error. */
  error: ei
}, Ar = 50, oe = "?", bn = /\(error: (.*)\)/, Sn = /captureMessage|captureException/;
function Dr(...t) {
  const e = t.sort((n, r) => n[0] - r[0]).map((n) => n[1]);
  return (n, r = 0, s = 0) => {
    const i = [], o = n.split(`
`);
    for (let a = r; a < o.length; a++) {
      let c = o[a];
      c.length > 1024 && (c = c.slice(0, 1024));
      const l = bn.test(c) ? c.replace(bn, "$1") : c;
      if (!l.match(/\S*Error: /)) {
        for (const d of e) {
          const u = d(l);
          if (u) {
            i.push(u);
            break;
          }
        }
        if (i.length >= Ar + s)
          break;
      }
    }
    return ni(i.slice(s));
  };
}
function ti(t) {
  return Array.isArray(t) ? Dr(...t) : t;
}
function ni(t) {
  if (!t.length)
    return [];
  const e = Array.from(t);
  return /sentryWrapped/.test(Me(e).function || "") && e.pop(), e.reverse(), Sn.test(Me(e).function || "") && (e.pop(), Sn.test(Me(e).function || "") && e.pop()), e.slice(0, Ar).map((n) => ({
    ...n,
    filename: n.filename || Me(e).filename,
    function: n.function || oe
  }));
}
function Me(t) {
  return t[t.length - 1] || {};
}
const ft = "<anonymous>";
function X(t) {
  try {
    return !t || typeof t != "function" ? ft : t.name || ft;
  } catch {
    return ft;
  }
}
function kn(t) {
  const e = t.exception;
  if (e) {
    const n = [];
    try {
      return e.values.forEach((r) => {
        r.stacktrace.frames && n.push(...r.stacktrace.frames);
      }), n;
    } catch {
      return;
    }
  }
}
function Nr(t) {
  return "__v_isVNode" in t && t.__v_isVNode ? "[VueVNode]" : "[VueViewModel]";
}
const qe = {}, xn = {};
function ce(t, e) {
  qe[t] = qe[t] || [], qe[t].push(e);
}
function le(t, e) {
  if (!xn[t]) {
    xn[t] = !0;
    try {
      e();
    } catch (n) {
      _ && m.error(`Error while instrumenting ${t}`, n);
    }
  }
}
function F(t, e) {
  const n = t && qe[t];
  if (n)
    for (const r of n)
      try {
        r(e);
      } catch (s) {
        _ && m.error(
          `Error while triggering instrumentation handler.
Type: ${t}
Name: ${X(r)}
Error:`,
          s
        );
      }
}
let gt = null;
function ri(t) {
  const e = "error";
  ce(e, t), le(e, si);
}
function si() {
  gt = R.onerror, R.onerror = function(t, e, n, r, s) {
    return F("error", {
      column: r,
      error: s,
      line: n,
      msg: t,
      url: e
    }), gt ? gt.apply(this, arguments) : !1;
  }, R.onerror.__SENTRY_INSTRUMENTED__ = !0;
}
let mt = null;
function ii(t) {
  const e = "unhandledrejection";
  ce(e, t), le(e, oi);
}
function oi() {
  mt = R.onunhandledrejection, R.onunhandledrejection = function(t) {
    return F("unhandledrejection", t), mt ? mt.apply(this, arguments) : !0;
  }, R.onunhandledrejection.__SENTRY_INSTRUMENTED__ = !0;
}
const Or = Object.prototype.toString;
function st(t) {
  switch (Or.call(t)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
    case "[object WebAssembly.Exception]":
      return !0;
    default:
      return K(t, Error);
  }
}
function Ee(t, e) {
  return Or.call(t) === `[object ${e}]`;
}
function $r(t) {
  return Ee(t, "ErrorEvent");
}
function Rn(t) {
  return Ee(t, "DOMError");
}
function ai(t) {
  return Ee(t, "DOMException");
}
function j(t) {
  return Ee(t, "String");
}
function Kt(t) {
  return typeof t == "object" && t !== null && "__sentry_template_string__" in t && "__sentry_template_values__" in t;
}
function it(t) {
  return t === null || Kt(t) || typeof t != "object" && typeof t != "function";
}
function Ie(t) {
  return Ee(t, "Object");
}
function ot(t) {
  return typeof Event < "u" && K(t, Event);
}
function ci(t) {
  return typeof Element < "u" && K(t, Element);
}
function li(t) {
  return Ee(t, "RegExp");
}
function De(t) {
  return !!(t?.then && typeof t.then == "function");
}
function ui(t) {
  return Ie(t) && "nativeEvent" in t && "preventDefault" in t && "stopPropagation" in t;
}
function K(t, e) {
  try {
    return t instanceof e;
  } catch {
    return !1;
  }
}
function Pr(t) {
  return !!(typeof t == "object" && t !== null && (t.__isVue || t._isVue || t.__v_isVNode));
}
function Lr(t) {
  return typeof Request < "u" && K(t, Request);
}
const Yt = R, di = 80;
function Mr(t, e = {}) {
  if (!t)
    return "<unknown>";
  try {
    let n = t;
    const r = 5, s = [];
    let i = 0, o = 0;
    const a = " > ", c = a.length;
    let l;
    const d = Array.isArray(e) ? e : e.keyAttrs, u = !Array.isArray(e) && e.maxStringLength || di;
    for (; n && i++ < r && (l = pi(n, d), !(l === "html" || i > 1 && o + s.length * c + l.length >= u)); )
      s.push(l), o += l.length, n = n.parentNode;
    return s.reverse().join(a);
  } catch {
    return "<unknown>";
  }
}
function pi(t, e) {
  const n = t, r = [];
  if (!n?.tagName)
    return "";
  if (Yt.HTMLElement && n instanceof HTMLElement && n.dataset) {
    if (n.dataset.sentryComponent)
      return n.dataset.sentryComponent;
    if (n.dataset.sentryElement)
      return n.dataset.sentryElement;
  }
  r.push(n.tagName.toLowerCase());
  const s = e?.length ? e.filter((o) => n.getAttribute(o)).map((o) => [o, n.getAttribute(o)]) : null;
  if (s?.length)
    s.forEach((o) => {
      r.push(`[${o[0]}="${o[1]}"]`);
    });
  else {
    n.id && r.push(`#${n.id}`);
    const o = n.className;
    if (o && j(o)) {
      const a = o.split(/\s+/);
      for (const c of a)
        r.push(`.${c}`);
    }
  }
  const i = ["aria-label", "type", "name", "title", "alt"];
  for (const o of i) {
    const a = n.getAttribute(o);
    a && r.push(`[${o}="${a}"]`);
  }
  return r.join("");
}
function Zt() {
  try {
    return Yt.document.location.href;
  } catch {
    return "";
  }
}
function hi(t) {
  if (!Yt.HTMLElement)
    return null;
  let e = t;
  const n = 5;
  for (let r = 0; r < n; r++) {
    if (!e)
      return null;
    if (e instanceof HTMLElement) {
      if (e.dataset.sentryComponent)
        return e.dataset.sentryComponent;
      if (e.dataset.sentryElement)
        return e.dataset.sentryElement;
    }
    e = e.parentNode;
  }
  return null;
}
function $(t, e, n) {
  if (!(e in t))
    return;
  const r = t[e];
  if (typeof r != "function")
    return;
  const s = n(r);
  typeof s == "function" && Fr(s, r);
  try {
    t[e] = s;
  } catch {
    _ && m.log(`Failed to replace method "${e}" in object`, t);
  }
}
function Y(t, e, n) {
  try {
    Object.defineProperty(t, e, {
      // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
      value: n,
      writable: !0,
      configurable: !0
    });
  } catch {
    _ && m.log(`Failed to add non-enumerable property "${e}" to object`, t);
  }
}
function Fr(t, e) {
  try {
    const n = e.prototype || {};
    t.prototype = e.prototype = n, Y(t, "__sentry_original__", e);
  } catch {
  }
}
function Jt(t) {
  return t.__sentry_original__;
}
function Ur(t) {
  if (st(t))
    return {
      message: t.message,
      name: t.name,
      stack: t.stack,
      ...Tn(t)
    };
  if (ot(t)) {
    const e = {
      type: t.type,
      target: wn(t.target),
      currentTarget: wn(t.currentTarget),
      ...Tn(t)
    };
    return typeof CustomEvent < "u" && K(t, CustomEvent) && (e.detail = t.detail), e;
  } else
    return t;
}
function wn(t) {
  try {
    return ci(t) ? Mr(t) : Object.prototype.toString.call(t);
  } catch {
    return "<unknown>";
  }
}
function Tn(t) {
  if (typeof t == "object" && t !== null) {
    const e = {};
    for (const n in t)
      Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
    return e;
  } else
    return {};
}
function fi(t) {
  const e = Object.keys(Ur(t));
  return e.sort(), e[0] ? e.join(", ") : "[object has no keys]";
}
let de;
function at(t) {
  if (de !== void 0)
    return de ? de(t) : t();
  const e = Symbol.for("__SENTRY_SAFE_RANDOM_ID_WRAPPER__"), n = R;
  return e in n && typeof n[e] == "function" ? (de = n[e], de(t)) : (de = null, t());
}
function Ze() {
  return at(() => Math.random());
}
function ct() {
  return at(() => Date.now());
}
function vt(t, e = 0) {
  return typeof t != "string" || e === 0 || t.length <= e ? t : `${t.slice(0, e)}...`;
}
function vn(t, e) {
  if (!Array.isArray(t))
    return "";
  const n = [];
  for (let r = 0; r < t.length; r++) {
    const s = t[r];
    try {
      Pr(s) ? n.push(Nr(s)) : n.push(String(s));
    } catch {
      n.push("[value cannot be serialized]");
    }
  }
  return n.join(e);
}
function Ge(t, e, n = !1) {
  return j(t) ? li(e) ? e.test(t) : j(e) ? n ? t === e : t.includes(e) : !1 : !1;
}
function lt(t, e = [], n = !1) {
  return e.some((r) => Ge(t, r, n));
}
function gi() {
  const t = R;
  return t.crypto || t.msCrypto;
}
let _t;
function mi() {
  return Ze() * 16;
}
function P(t = gi()) {
  try {
    if (t?.randomUUID)
      return at(() => t.randomUUID()).replace(/-/g, "");
  } catch {
  }
  return _t || (_t = "10000000100040008000" + 1e11), _t.replace(
    /[018]/g,
    (e) => (
      // eslint-disable-next-line no-bitwise
      (e ^ (mi() & 15) >> e / 4).toString(16)
    )
  );
}
function Br(t) {
  return t.exception?.values?.[0];
}
function re(t) {
  const { message: e, event_id: n } = t;
  if (e)
    return e;
  const r = Br(t);
  return r ? r.type && r.value ? `${r.type}: ${r.value}` : r.type || r.value || n || "<unknown>" : n || "<unknown>";
}
function It(t, e, n) {
  const r = t.exception = t.exception || {}, s = r.values = r.values || [], i = s[0] = s[0] || {};
  i.value || (i.value = e || ""), i.type || (i.type = "Error");
}
function he(t, e) {
  const n = Br(t);
  if (!n)
    return;
  const r = { type: "generic", handled: !0 }, s = n.mechanism;
  if (n.mechanism = { ...r, ...s, ...e }, e && "data" in e) {
    const i = { ...s?.data, ...e.data };
    n.mechanism.data = i;
  }
}
function In(t) {
  if (_i(t))
    return !0;
  try {
    Y(t, "__sentry_captured__", !0);
  } catch {
  }
  return !1;
}
function _i(t) {
  try {
    return t.__sentry_captured__;
  } catch {
  }
}
const Hr = 1e3;
function Ne() {
  return ct() / Hr;
}
function yi() {
  const { performance: t } = R;
  if (!t?.now || !t.timeOrigin)
    return Ne;
  const e = t.timeOrigin;
  return () => (e + at(() => t.now())) / Hr;
}
let Cn;
function q() {
  return (Cn ?? (Cn = yi()))();
}
function Ei(t) {
  const e = q(), n = {
    sid: P(),
    init: !0,
    timestamp: e,
    started: e,
    duration: 0,
    status: "ok",
    errors: 0,
    ignoreDuration: !1,
    toJSON: () => Si(n)
  };
  return t && fe(n, t), n;
}
function fe(t, e = {}) {
  if (e.user && (!t.ipAddress && e.user.ip_address && (t.ipAddress = e.user.ip_address), !t.did && !e.did && (t.did = e.user.id || e.user.email || e.user.username)), t.timestamp = e.timestamp || q(), e.abnormal_mechanism && (t.abnormal_mechanism = e.abnormal_mechanism), e.ignoreDuration && (t.ignoreDuration = e.ignoreDuration), e.sid && (t.sid = e.sid.length === 32 ? e.sid : P()), e.init !== void 0 && (t.init = e.init), !t.did && e.did && (t.did = `${e.did}`), typeof e.started == "number" && (t.started = e.started), t.ignoreDuration)
    t.duration = void 0;
  else if (typeof e.duration == "number")
    t.duration = e.duration;
  else {
    const n = t.timestamp - t.started;
    t.duration = n >= 0 ? n : 0;
  }
  e.release && (t.release = e.release), e.environment && (t.environment = e.environment), !t.ipAddress && e.ipAddress && (t.ipAddress = e.ipAddress), !t.userAgent && e.userAgent && (t.userAgent = e.userAgent), typeof e.errors == "number" && (t.errors = e.errors), e.status && (t.status = e.status);
}
function bi(t, e) {
  let n = {};
  t.status === "ok" && (n = { status: "exited" }), fe(t, n);
}
function Si(t) {
  return {
    sid: `${t.sid}`,
    init: t.init,
    // Make sure that sec is converted to ms for date constructor
    started: new Date(t.started * 1e3).toISOString(),
    timestamp: new Date(t.timestamp * 1e3).toISOString(),
    status: t.status,
    errors: t.errors,
    did: typeof t.did == "number" || typeof t.did == "string" ? `${t.did}` : void 0,
    duration: t.duration,
    abnormal_mechanism: t.abnormal_mechanism,
    attrs: {
      release: t.release,
      environment: t.environment,
      ip_address: t.ipAddress,
      user_agent: t.userAgent
    }
  };
}
function Oe(t, e, n = 2) {
  if (!e || typeof e != "object" || n <= 0)
    return e;
  if (t && Object.keys(e).length === 0)
    return t;
  const r = { ...t };
  for (const s in e)
    Object.prototype.hasOwnProperty.call(e, s) && (r[s] = Oe(r[s], e[s], n - 1));
  return r;
}
function An() {
  return P();
}
function zr() {
  return P().substring(16);
}
const Ct = "_sentrySpan";
function Dn(t, e) {
  e ? Y(t, Ct, e) : delete t[Ct];
}
function Nn(t) {
  return t[Ct];
}
const ki = 100;
class B {
  /** Flag if notifying is happening. */
  /** Callback for client to receive scope changes. */
  /** Callback list that will be called during event processing. */
  /** Array of breadcrumbs. */
  /** User */
  /** Tags */
  /** Attributes */
  /** Extra */
  /** Contexts */
  /** Attachments */
  /** Propagation Context for distributed tracing */
  /**
   * A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get
   * sent to Sentry
   */
  /** Fingerprint */
  /** Severity */
  /**
   * Transaction Name
   *
   * IMPORTANT: The transaction name on the scope has nothing to do with root spans/transaction objects.
   * It's purpose is to assign a transaction to the scope that's added to non-transaction events.
   */
  /** Session */
  /** The client on this scope */
  /** Contains the last event id of a captured event.  */
  /** Conversation ID */
  // NOTE: Any field which gets added here should get added not only to the constructor but also to the `clone` method.
  constructor() {
    this._notifyingListeners = !1, this._scopeListeners = [], this._eventProcessors = [], this._breadcrumbs = [], this._attachments = [], this._user = {}, this._tags = {}, this._attributes = {}, this._extra = {}, this._contexts = {}, this._sdkProcessingMetadata = {}, this._propagationContext = {
      traceId: An(),
      sampleRand: Ze()
    };
  }
  /**
   * Clone all data from this scope into a new scope.
   */
  clone() {
    const e = new B();
    return e._breadcrumbs = [...this._breadcrumbs], e._tags = { ...this._tags }, e._attributes = { ...this._attributes }, e._extra = { ...this._extra }, e._contexts = { ...this._contexts }, this._contexts.flags && (e._contexts.flags = {
      values: [...this._contexts.flags.values]
    }), e._user = this._user, e._level = this._level, e._session = this._session, e._transactionName = this._transactionName, e._fingerprint = this._fingerprint, e._eventProcessors = [...this._eventProcessors], e._attachments = [...this._attachments], e._sdkProcessingMetadata = { ...this._sdkProcessingMetadata }, e._propagationContext = { ...this._propagationContext }, e._client = this._client, e._lastEventId = this._lastEventId, e._conversationId = this._conversationId, Dn(e, Nn(this)), e;
  }
  /**
   * Update the client assigned to this scope.
   * Note that not every scope will have a client assigned - isolation scopes & the global scope will generally not have a client,
   * as well as manually created scopes.
   */
  setClient(e) {
    this._client = e;
  }
  /**
   * Set the ID of the last captured error event.
   * This is generally only captured on the isolation scope.
   */
  setLastEventId(e) {
    this._lastEventId = e;
  }
  /**
   * Get the client assigned to this scope.
   */
  getClient() {
    return this._client;
  }
  /**
   * Get the ID of the last captured error event.
   * This is generally only available on the isolation scope.
   */
  lastEventId() {
    return this._lastEventId;
  }
  /**
   * @inheritDoc
   */
  addScopeListener(e) {
    this._scopeListeners.push(e);
  }
  /**
   * Add an event processor that will be called before an event is sent.
   */
  addEventProcessor(e) {
    return this._eventProcessors.push(e), this;
  }
  /**
   * Set the user for this scope.
   * Set to `null` to unset the user.
   */
  setUser(e) {
    return this._user = e || {
      email: void 0,
      id: void 0,
      ip_address: void 0,
      username: void 0
    }, this._session && fe(this._session, { user: e }), this._notifyScopeListeners(), this;
  }
  /**
   * Get the user from this scope.
   */
  getUser() {
    return this._user;
  }
  /**
   * Set the conversation ID for this scope.
   * Set to `null` to unset the conversation ID.
   */
  setConversationId(e) {
    return this._conversationId = e || void 0, this._notifyScopeListeners(), this;
  }
  /**
   * Set an object that will be merged into existing tags on the scope,
   * and will be sent as tags data with the event.
   */
  setTags(e) {
    return this._tags = {
      ...this._tags,
      ...e
    }, this._notifyScopeListeners(), this;
  }
  /**
   * Set a single tag that will be sent as tags data with the event.
   */
  setTag(e, n) {
    return this.setTags({ [e]: n });
  }
  /**
   * Sets attributes onto the scope.
   *
   * These attributes are currently applied to logs and metrics.
   * In the future, they will also be applied to spans.
   *
   * Important: For now, only strings, numbers and boolean attributes are supported, despite types allowing for
   * more complex attribute types. We'll add this support in the future but already specify the wider type to
   * avoid a breaking change in the future.
   *
   * @param newAttributes - The attributes to set on the scope. You can either pass in key-value pairs, or
   * an object with a `value` and an optional `unit` (if applicable to your attribute).
   *
   * @example
   * ```typescript
   * scope.setAttributes({
   *   is_admin: true,
   *   payment_selection: 'credit_card',
   *   render_duration: { value: 'render_duration', unit: 'ms' },
   * });
   * ```
   */
  setAttributes(e) {
    return this._attributes = {
      ...this._attributes,
      ...e
    }, this._notifyScopeListeners(), this;
  }
  /**
   * Sets an attribute onto the scope.
   *
   * These attributes are currently applied to logs and metrics.
   * In the future, they will also be applied to spans.
   *
   * Important: For now, only strings, numbers and boolean attributes are supported, despite types allowing for
   * more complex attribute types. We'll add this support in the future but already specify the wider type to
   * avoid a breaking change in the future.
   *
   * @param key - The attribute key.
   * @param value - the attribute value. You can either pass in a raw value, or an attribute
   * object with a `value` and an optional `unit` (if applicable to your attribute).
   *
   * @example
   * ```typescript
   * scope.setAttribute('is_admin', true);
   * scope.setAttribute('render_duration', { value: 'render_duration', unit: 'ms' });
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAttribute(e, n) {
    return this.setAttributes({ [e]: n });
  }
  /**
   * Removes the attribute with the given key from the scope.
   *
   * @param key - The attribute key.
   *
   * @example
   * ```typescript
   * scope.removeAttribute('is_admin');
   * ```
   */
  removeAttribute(e) {
    return e in this._attributes && (delete this._attributes[e], this._notifyScopeListeners()), this;
  }
  /**
   * Set an object that will be merged into existing extra on the scope,
   * and will be sent as extra data with the event.
   */
  setExtras(e) {
    return this._extra = {
      ...this._extra,
      ...e
    }, this._notifyScopeListeners(), this;
  }
  /**
   * Set a single key:value extra entry that will be sent as extra data with the event.
   */
  setExtra(e, n) {
    return this._extra = { ...this._extra, [e]: n }, this._notifyScopeListeners(), this;
  }
  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param {string[]} fingerprint Fingerprint to group events in Sentry.
   */
  setFingerprint(e) {
    return this._fingerprint = e, this._notifyScopeListeners(), this;
  }
  /**
   * Sets the level on the scope for future events.
   */
  setLevel(e) {
    return this._level = e, this._notifyScopeListeners(), this;
  }
  /**
   * Sets the transaction name on the scope so that the name of e.g. taken server route or
   * the page location is attached to future events.
   *
   * IMPORTANT: Calling this function does NOT change the name of the currently active
   * root span. If you want to change the name of the active root span, use
   * `Sentry.updateSpanName(rootSpan, 'new name')` instead.
   *
   * By default, the SDK updates the scope's transaction name automatically on sensible
   * occasions, such as a page navigation or when handling a new request on the server.
   */
  setTransactionName(e) {
    return this._transactionName = e, this._notifyScopeListeners(), this;
  }
  /**
   * Sets context data with the given name.
   * Data passed as context will be normalized. You can also pass `null` to unset the context.
   * Note that context data will not be merged - calling `setContext` will overwrite an existing context with the same key.
   */
  setContext(e, n) {
    return n === null ? delete this._contexts[e] : this._contexts[e] = n, this._notifyScopeListeners(), this;
  }
  /**
   * Set the session for the scope.
   */
  setSession(e) {
    return e ? this._session = e : delete this._session, this._notifyScopeListeners(), this;
  }
  /**
   * Get the session from the scope.
   */
  getSession() {
    return this._session;
  }
  /**
   * Updates the scope with provided data. Can work in three variations:
   * - plain object containing updatable attributes
   * - Scope instance that'll extract the attributes from
   * - callback function that'll receive the current scope as an argument and allow for modifications
   */
  update(e) {
    if (!e)
      return this;
    const n = typeof e == "function" ? e(this) : e, r = n instanceof B ? n.getScopeData() : Ie(n) ? e : void 0, {
      tags: s,
      attributes: i,
      extra: o,
      user: a,
      contexts: c,
      level: l,
      fingerprint: d = [],
      propagationContext: u,
      conversationId: p
    } = r || {};
    return this._tags = { ...this._tags, ...s }, this._attributes = { ...this._attributes, ...i }, this._extra = { ...this._extra, ...o }, this._contexts = { ...this._contexts, ...c }, a && Object.keys(a).length && (this._user = a), l && (this._level = l), d.length && (this._fingerprint = d), u && (this._propagationContext = u), p && (this._conversationId = p), this;
  }
  /**
   * Clears the current scope and resets its properties.
   * Note: The client will not be cleared.
   */
  clear() {
    return this._breadcrumbs = [], this._tags = {}, this._attributes = {}, this._extra = {}, this._user = {}, this._contexts = {}, this._level = void 0, this._transactionName = void 0, this._fingerprint = void 0, this._session = void 0, this._conversationId = void 0, Dn(this, void 0), this._attachments = [], this.setPropagationContext({
      traceId: An(),
      sampleRand: Ze()
    }), this._notifyScopeListeners(), this;
  }
  /**
   * Adds a breadcrumb to the scope.
   * By default, the last 100 breadcrumbs are kept.
   */
  addBreadcrumb(e, n) {
    const r = typeof n == "number" ? n : ki;
    if (r <= 0)
      return this;
    const s = {
      timestamp: Ne(),
      ...e,
      // Breadcrumb messages can theoretically be infinitely large and they're held in memory so we truncate them not to leak (too much) memory
      message: e.message ? vt(e.message, 2048) : e.message
    };
    return this._breadcrumbs.push(s), this._breadcrumbs.length > r && (this._breadcrumbs = this._breadcrumbs.slice(-r), this._client?.recordDroppedEvent("buffer_overflow", "log_item")), this._notifyScopeListeners(), this;
  }
  /**
   * Get the last breadcrumb of the scope.
   */
  getLastBreadcrumb() {
    return this._breadcrumbs[this._breadcrumbs.length - 1];
  }
  /**
   * Clear all breadcrumbs from the scope.
   */
  clearBreadcrumbs() {
    return this._breadcrumbs = [], this._notifyScopeListeners(), this;
  }
  /**
   * Add an attachment to the scope.
   */
  addAttachment(e) {
    return this._attachments.push(e), this;
  }
  /**
   * Clear all attachments from the scope.
   */
  clearAttachments() {
    return this._attachments = [], this;
  }
  /**
   * Get the data of this scope, which should be applied to an event during processing.
   */
  getScopeData() {
    return {
      breadcrumbs: this._breadcrumbs,
      attachments: this._attachments,
      contexts: this._contexts,
      tags: this._tags,
      attributes: this._attributes,
      extra: this._extra,
      user: this._user,
      level: this._level,
      fingerprint: this._fingerprint || [],
      eventProcessors: this._eventProcessors,
      propagationContext: this._propagationContext,
      sdkProcessingMetadata: this._sdkProcessingMetadata,
      transactionName: this._transactionName,
      span: Nn(this),
      conversationId: this._conversationId
    };
  }
  /**
   * Add data which will be accessible during event processing but won't get sent to Sentry.
   */
  setSDKProcessingMetadata(e) {
    return this._sdkProcessingMetadata = Oe(this._sdkProcessingMetadata, e, 2), this;
  }
  /**
   * Add propagation context to the scope, used for distributed tracing
   */
  setPropagationContext(e) {
    return this._propagationContext = e, this;
  }
  /**
   * Get propagation context from the scope, used for distributed tracing
   */
  getPropagationContext() {
    return this._propagationContext;
  }
  /**
   * Capture an exception for this scope.
   *
   * @returns {string} The id of the captured Sentry event.
   */
  captureException(e, n) {
    const r = n?.event_id || P();
    if (!this._client)
      return _ && m.warn("No client configured on scope - will not capture exception!"), r;
    const s = new Error("Sentry syntheticException");
    return this._client.captureException(
      e,
      {
        originalException: e,
        syntheticException: s,
        ...n,
        event_id: r
      },
      this
    ), r;
  }
  /**
   * Capture a message for this scope.
   *
   * @returns {string} The id of the captured message.
   */
  captureMessage(e, n, r) {
    const s = r?.event_id || P();
    if (!this._client)
      return _ && m.warn("No client configured on scope - will not capture message!"), s;
    const i = r?.syntheticException ?? new Error(e);
    return this._client.captureMessage(
      e,
      n,
      {
        originalException: e,
        syntheticException: i,
        ...r,
        event_id: s
      },
      this
    ), s;
  }
  /**
   * Capture a Sentry event for this scope.
   *
   * @returns {string} The id of the captured event.
   */
  captureEvent(e, n) {
    const r = e.event_id || n?.event_id || P();
    return this._client ? (this._client.captureEvent(e, { ...n, event_id: r }, this), r) : (_ && m.warn("No client configured on scope - will not capture event!"), r);
  }
  /**
   * This will be called on every set call.
   */
  _notifyScopeListeners() {
    this._notifyingListeners || (this._notifyingListeners = !0, this._scopeListeners.forEach((e) => {
      e(this);
    }), this._notifyingListeners = !1);
  }
}
function xi() {
  return _e("defaultCurrentScope", () => new B());
}
function Ri() {
  return _e("defaultIsolationScope", () => new B());
}
class wi {
  constructor(e, n) {
    let r;
    e ? r = e : r = new B();
    let s;
    n ? s = n : s = new B(), this._stack = [{ scope: r }], this._isolationScope = s;
  }
  /**
   * Fork a scope for the stack.
   */
  withScope(e) {
    const n = this._pushScope();
    let r;
    try {
      r = e(n);
    } catch (s) {
      throw this._popScope(), s;
    }
    return De(r) ? r.then(
      (s) => (this._popScope(), s),
      (s) => {
        throw this._popScope(), s;
      }
    ) : (this._popScope(), r);
  }
  /**
   * Get the client of the stack.
   */
  getClient() {
    return this.getStackTop().client;
  }
  /**
   * Returns the scope of the top stack.
   */
  getScope() {
    return this.getStackTop().scope;
  }
  /**
   * Get the isolation scope for the stack.
   */
  getIsolationScope() {
    return this._isolationScope;
  }
  /**
   * Returns the topmost scope layer in the order domain > local > process.
   */
  getStackTop() {
    return this._stack[this._stack.length - 1];
  }
  /**
   * Push a scope to the stack.
   */
  _pushScope() {
    const e = this.getScope().clone();
    return this._stack.push({
      client: this.getClient(),
      scope: e
    }), e;
  }
  /**
   * Pop a scope from the stack.
   */
  _popScope() {
    return this._stack.length <= 1 ? !1 : !!this._stack.pop();
  }
}
function ge() {
  const t = nt(), e = rt(t);
  return e.stack = e.stack || new wi(xi(), Ri());
}
function Ti(t) {
  return ge().withScope(t);
}
function vi(t, e) {
  const n = ge();
  return n.withScope(() => (n.getStackTop().scope = t, e(t)));
}
function On(t) {
  return ge().withScope(() => t(ge().getIsolationScope()));
}
function Ii() {
  return {
    withIsolationScope: On,
    withScope: Ti,
    withSetScope: vi,
    withSetIsolationScope: (t, e) => On(e),
    getCurrentScope: () => ge().getScope(),
    getIsolationScope: () => ge().getIsolationScope()
  };
}
function Qt(t) {
  const e = rt(t);
  return e.acs ? e.acs : Ii();
}
function H() {
  const t = nt();
  return Qt(t).getCurrentScope();
}
function J() {
  const t = nt();
  return Qt(t).getIsolationScope();
}
function Ci() {
  return _e("globalScope", () => new B());
}
function Ai(...t) {
  const e = nt(), n = Qt(e);
  if (t.length === 2) {
    const [r, s] = t;
    return r ? n.withSetScope(r, s) : n.withScope(s);
  }
  return n.withScope(t[0]);
}
function C() {
  return H().getClient();
}
function Di(t) {
  const e = t.getPropagationContext(), { traceId: n, parentSpanId: r, propagationSpanId: s } = e, i = {
    trace_id: n,
    span_id: s || zr()
  };
  return r && (i.parent_span_id = r), i;
}
const Ni = "sentry.source", Oi = "sentry.sample_rate", $i = "sentry.previous_trace_sample_rate", Pi = "sentry.op", Li = "sentry.origin", jr = "sentry.profile_id", qr = "sentry.exclusive_time", Mi = "gen_ai.conversation.id", Fi = 0, Ui = 1, Bi = "_sentryScope", Hi = "_sentryIsolationScope";
function zi(t) {
  if (t) {
    if (typeof t == "object" && "deref" in t && typeof t.deref == "function")
      try {
        return t.deref();
      } catch {
        return;
      }
    return t;
  }
}
function Gr(t) {
  const e = t;
  return {
    scope: e[Bi],
    isolationScope: zi(e[Hi])
  };
}
const ji = "sentry-", qi = /^sentry-/;
function Gi(t) {
  const e = Vi(t);
  if (!e)
    return;
  const n = Object.entries(e).reduce((r, [s, i]) => {
    if (s.match(qi)) {
      const o = s.slice(ji.length);
      r[o] = i;
    }
    return r;
  }, {});
  if (Object.keys(n).length > 0)
    return n;
}
function Vi(t) {
  if (!(!t || !j(t) && !Array.isArray(t)))
    return Array.isArray(t) ? t.reduce((e, n) => {
      const r = $n(n);
      return Object.entries(r).forEach(([s, i]) => {
        e[s] = i;
      }), e;
    }, {}) : $n(t);
}
function $n(t) {
  return t.split(",").map((e) => {
    const n = e.indexOf("=");
    if (n === -1)
      return [];
    const r = e.slice(0, n), s = e.slice(n + 1);
    return [r, s].map((i) => {
      try {
        return decodeURIComponent(i.trim());
      } catch {
        return;
      }
    });
  }).reduce((e, [n, r]) => (n && r && (e[n] = r), e), {});
}
const Wi = /^o(\d+)\./, Xi = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)((?:\[[:.%\w]+\]|[\w.-]+))(?::(\d+))?\/(.+)/;
function Ki(t) {
  return t === "http" || t === "https";
}
function $e(t, e = !1) {
  const { host: n, path: r, pass: s, port: i, projectId: o, protocol: a, publicKey: c } = t;
  return `${a}://${c}${e && s ? `:${s}` : ""}@${n}${i ? `:${i}` : ""}/${r && `${r}/`}${o}`;
}
function Yi(t) {
  const e = Xi.exec(t);
  if (!e) {
    ye(() => {
      console.error(`Invalid Sentry Dsn: ${t}`);
    });
    return;
  }
  const [n, r, s = "", i = "", o = "", a = ""] = e.slice(1);
  let c = "", l = a;
  const d = l.split("/");
  if (d.length > 1 && (c = d.slice(0, -1).join("/"), l = d.pop()), l) {
    const u = l.match(/^\d+/);
    u && (l = u[0]);
  }
  return Vr({ host: i, pass: s, path: c, projectId: l, port: o, protocol: n, publicKey: r });
}
function Vr(t) {
  return {
    protocol: t.protocol,
    publicKey: t.publicKey || "",
    pass: t.pass || "",
    host: t.host,
    port: t.port || "",
    path: t.path || "",
    projectId: t.projectId
  };
}
function Zi(t) {
  if (!_)
    return !0;
  const { port: e, projectId: n, protocol: r } = t;
  return ["protocol", "publicKey", "host", "projectId"].find((o) => t[o] ? !1 : (m.error(`Invalid Sentry Dsn: ${o} missing`), !0)) ? !1 : n.match(/^\d+$/) ? Ki(r) ? e && isNaN(parseInt(e, 10)) ? (m.error(`Invalid Sentry Dsn: Invalid port ${e}`), !1) : !0 : (m.error(`Invalid Sentry Dsn: Invalid protocol ${r}`), !1) : (m.error(`Invalid Sentry Dsn: Invalid projectId ${n}`), !1);
}
function Ji(t) {
  return t.match(Wi)?.[1];
}
function Qi(t) {
  const e = t.getOptions(), { host: n } = t.getDsn() || {};
  let r;
  return e.orgId ? r = String(e.orgId) : n && (r = Ji(n)), r;
}
function eo(t) {
  const e = typeof t == "string" ? Yi(t) : Vr(t);
  if (!(!e || !Zi(e)))
    return e;
}
function to(t) {
  if (typeof t == "boolean")
    return Number(t);
  const e = typeof t == "string" ? parseFloat(t) : t;
  if (!(typeof e != "number" || isNaN(e) || e < 0 || e > 1))
    return e;
}
const Wr = 1;
let Pn = !1;
function no(t) {
  const { spanId: e, traceId: n, isRemote: r } = t.spanContext(), s = r ? e : en(t).parent_span_id, i = Gr(t).scope, o = r ? i?.getPropagationContext().propagationSpanId || zr() : e;
  return {
    parent_span_id: s,
    span_id: o,
    trace_id: n
  };
}
function ro(t) {
  if (t && t.length > 0)
    return t.map(({ context: { spanId: e, traceId: n, traceFlags: r, ...s }, attributes: i }) => ({
      span_id: e,
      trace_id: n,
      sampled: r === Wr,
      attributes: i,
      ...s
    }));
}
function Ln(t) {
  return typeof t == "number" ? Mn(t) : Array.isArray(t) ? t[0] + t[1] / 1e9 : t instanceof Date ? Mn(t.getTime()) : q();
}
function Mn(t) {
  return t > 9999999999 ? t / 1e3 : t;
}
function en(t) {
  if (io(t))
    return t.getSpanJSON();
  const { spanId: e, traceId: n } = t.spanContext();
  if (so(t)) {
    const { attributes: r, startTime: s, name: i, endTime: o, status: a, links: c } = t, l = "parentSpanId" in t ? t.parentSpanId : "parentSpanContext" in t ? t.parentSpanContext?.spanId : void 0;
    return {
      span_id: e,
      trace_id: n,
      data: r,
      description: i,
      parent_span_id: l,
      start_timestamp: Ln(s),
      // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
      timestamp: Ln(o) || void 0,
      status: ao(a),
      op: r[Pi],
      origin: r[Li],
      links: ro(c)
    };
  }
  return {
    span_id: e,
    trace_id: n,
    start_timestamp: 0,
    data: {}
  };
}
function so(t) {
  const e = t;
  return !!e.attributes && !!e.startTime && !!e.name && !!e.endTime && !!e.status;
}
function io(t) {
  return typeof t.getSpanJSON == "function";
}
function oo(t) {
  const { traceFlags: e } = t.spanContext();
  return e === Wr;
}
function ao(t) {
  if (!(!t || t.code === Fi))
    return t.code === Ui ? "ok" : t.message || "internal_error";
}
const co = "_sentryRootSpan";
function Xr(t) {
  return t[co] || t;
}
function Fn() {
  Pn || (ye(() => {
    console.warn(
      "[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`."
    );
  }), Pn = !0);
}
function lo(t) {
  if (typeof __SENTRY_TRACING__ == "boolean" && !__SENTRY_TRACING__)
    return !1;
  const e = C()?.getOptions();
  return !!e && // Note: This check is `!= null`, meaning "nullish". `0` is not "nullish", `undefined` and `null` are. (This comment was brought to you by 15 minutes of questioning life)
  (e.tracesSampleRate != null || !!e.tracesSampler);
}
function Un(t) {
  m.log(`Ignoring span ${t.op} - ${t.description} because it matches \`ignoreSpans\`.`);
}
function Bn(t, e) {
  if (!e?.length || !t.description)
    return !1;
  for (const n of e) {
    if (po(n)) {
      if (Ge(t.description, n))
        return _ && Un(t), !0;
      continue;
    }
    if (!n.name && !n.op)
      continue;
    const r = n.name ? Ge(t.description, n.name) : !0, s = n.op ? t.op && Ge(t.op, n.op) : !0;
    if (r && s)
      return _ && Un(t), !0;
  }
  return !1;
}
function uo(t, e) {
  const n = e.parent_span_id, r = e.span_id;
  if (n)
    for (const s of t)
      s.parent_span_id === r && (s.parent_span_id = n);
}
function po(t) {
  return typeof t == "string" || t instanceof RegExp;
}
const tn = "production", ho = "_frozenDsc";
function Kr(t, e) {
  const n = e.getOptions(), { publicKey: r } = e.getDsn() || {}, s = {
    environment: n.environment || tn,
    release: n.release,
    public_key: r,
    trace_id: t,
    org_id: Qi(e)
  };
  return e.emit("createDsc", s), s;
}
function fo(t, e) {
  const n = e.getPropagationContext();
  return n.dsc || Kr(n.traceId, t);
}
function go(t) {
  const e = C();
  if (!e)
    return {};
  const n = Xr(t), r = en(n), s = r.data, i = n.spanContext().traceState, o = i?.get("sentry.sample_rate") ?? s[Oi] ?? s[$i];
  function a(f) {
    return (typeof o == "number" || typeof o == "string") && (f.sample_rate = `${o}`), f;
  }
  const c = n[ho];
  if (c)
    return a(c);
  const l = i?.get("sentry.dsc"), d = l && Gi(l);
  if (d)
    return a(d);
  const u = Kr(t.spanContext().traceId, e), p = s[Ni], h = r.description;
  return p !== "url" && h && (u.transaction = h), lo() && (u.sampled = String(oo(n)), u.sample_rand = // In OTEL we store the sample rand on the trace state because we cannot access scopes for NonRecordingSpans
  // The Sentry OTEL SpanSampler takes care of writing the sample rand on the root span
  i?.get("sentry.sample_rand") ?? // On all other platforms we can actually get the scopes from a root span (we use this as a fallback)
  Gr(n).scope?.getPropagationContext().sampleRand.toString()), a(u), e.emit("createDsc", u, n), u;
}
function z(t, e = 100, n = 1 / 0) {
  try {
    return At("", t, e, n);
  } catch (r) {
    return { ERROR: `**non-serializable** (${r})` };
  }
}
function Yr(t, e = 3, n = 100 * 1024) {
  const r = z(t, e);
  return Eo(r) > n ? Yr(t, e - 1, n) : r;
}
function At(t, e, n = 1 / 0, r = 1 / 0, s = bo()) {
  const [i, o] = s;
  if (e == null || // this matches null and undefined -> eqeq not eqeqeq
  ["boolean", "string"].includes(typeof e) || typeof e == "number" && Number.isFinite(e))
    return e;
  const a = mo(t, e);
  if (!a.startsWith("[object "))
    return a;
  if (e.__sentry_skip_normalization__)
    return e;
  const c = typeof e.__sentry_override_normalization_depth__ == "number" ? e.__sentry_override_normalization_depth__ : n;
  if (c === 0)
    return a.replace("object ", "");
  if (i(e))
    return "[Circular ~]";
  const l = e;
  if (l && typeof l.toJSON == "function")
    try {
      const h = l.toJSON();
      return At("", h, c - 1, r, s);
    } catch {
    }
  const d = Array.isArray(e) ? [] : {};
  let u = 0;
  const p = Ur(e);
  for (const h in p) {
    if (!Object.prototype.hasOwnProperty.call(p, h))
      continue;
    if (u >= r) {
      d[h] = "[MaxProperties ~]";
      break;
    }
    const f = p[h];
    d[h] = At(h, f, c - 1, r, s), u++;
  }
  return o(e), d;
}
function mo(t, e) {
  try {
    if (t === "domain" && e && typeof e == "object" && e._events)
      return "[Domain]";
    if (t === "domainEmitter")
      return "[DomainEmitter]";
    if (typeof global < "u" && e === global)
      return "[Global]";
    if (typeof window < "u" && e === window)
      return "[Window]";
    if (typeof document < "u" && e === document)
      return "[Document]";
    if (Pr(e))
      return Nr(e);
    if (ui(e))
      return "[SyntheticEvent]";
    if (typeof e == "number" && !Number.isFinite(e))
      return `[${e}]`;
    if (typeof e == "function")
      return `[Function: ${X(e)}]`;
    if (typeof e == "symbol")
      return `[${String(e)}]`;
    if (typeof e == "bigint")
      return `[BigInt: ${String(e)}]`;
    const n = _o(e);
    return /^HTML(\w*)Element$/.test(n) ? `[HTMLElement: ${n}]` : `[object ${n}]`;
  } catch (n) {
    return `**non-serializable** (${n})`;
  }
}
function _o(t) {
  const e = Object.getPrototypeOf(t);
  return e?.constructor ? e.constructor.name : "null prototype";
}
function yo(t) {
  return ~-encodeURI(t).split(/%..|./).length;
}
function Eo(t) {
  return yo(JSON.stringify(t));
}
function bo() {
  const t = /* @__PURE__ */ new WeakSet();
  function e(r) {
    return t.has(r) ? !0 : (t.add(r), !1);
  }
  function n(r) {
    t.delete(r);
  }
  return [e, n];
}
function be(t, e = []) {
  return [t, e];
}
function So(t, e) {
  const [n, r] = t;
  return [n, [...r, e]];
}
function Dt(t, e) {
  const n = t[1];
  for (const r of n) {
    const s = r[0].type;
    if (e(r, s))
      return !0;
  }
  return !1;
}
function ko(t, e) {
  return Dt(t, (n, r) => e.includes(r));
}
function Nt(t) {
  const e = rt(R);
  return e.encodePolyfill ? e.encodePolyfill(t) : new TextEncoder().encode(t);
}
function xo(t) {
  const [e, n] = t;
  let r = JSON.stringify(e);
  function s(i) {
    typeof r == "string" ? r = typeof i == "string" ? r + i : [Nt(r), i] : r.push(typeof i == "string" ? Nt(i) : i);
  }
  for (const i of n) {
    const [o, a] = i;
    if (s(`
${JSON.stringify(o)}
`), typeof a == "string" || a instanceof Uint8Array)
      s(a);
    else {
      let c;
      try {
        c = JSON.stringify(a);
      } catch {
        c = JSON.stringify(z(a));
      }
      s(c);
    }
  }
  return typeof r == "string" ? r : Ro(r);
}
function Ro(t) {
  const e = t.reduce((s, i) => s + i.length, 0), n = new Uint8Array(e);
  let r = 0;
  for (const s of t)
    n.set(s, r), r += s.length;
  return n;
}
function wo(t) {
  const e = typeof t.data == "string" ? Nt(t.data) : t.data;
  return [
    {
      type: "attachment",
      length: e.length,
      filename: t.filename,
      content_type: t.contentType,
      attachment_type: t.attachmentType
    },
    e
  ];
}
const To = {
  session: "session",
  sessions: "session",
  attachment: "attachment",
  transaction: "transaction",
  event: "error",
  client_report: "internal",
  user_report: "default",
  profile: "profile",
  profile_chunk: "profile",
  replay_event: "replay",
  replay_recording: "replay",
  check_in: "monitor",
  feedback: "feedback",
  span: "span",
  raw_security: "security",
  log: "log_item",
  metric: "metric",
  trace_metric: "metric"
};
function Hn(t) {
  return To[t];
}
function Zr(t) {
  if (!t?.sdk)
    return;
  const { name: e, version: n } = t.sdk;
  return { name: e, version: n };
}
function vo(t, e, n, r) {
  const s = t.sdkProcessingMetadata?.dynamicSamplingContext;
  return {
    event_id: t.event_id,
    sent_at: (/* @__PURE__ */ new Date()).toISOString(),
    ...e && { sdk: e },
    ...!!n && r && { dsn: $e(r) },
    ...s && {
      trace: s
    }
  };
}
function Io(t, e) {
  if (!e)
    return t;
  const n = t.sdk || {};
  return t.sdk = {
    ...n,
    name: n.name || e.name,
    version: n.version || e.version,
    integrations: [...t.sdk?.integrations || [], ...e.integrations || []],
    packages: [...t.sdk?.packages || [], ...e.packages || []],
    settings: t.sdk?.settings || e.settings ? {
      ...t.sdk?.settings,
      ...e.settings
    } : void 0
  }, t;
}
function Co(t, e, n, r) {
  const s = Zr(n), i = {
    sent_at: (/* @__PURE__ */ new Date()).toISOString(),
    ...s && { sdk: s },
    ...!!r && e && { dsn: $e(e) }
  }, o = "aggregates" in t ? [{ type: "sessions" }, t] : [{ type: "session" }, t.toJSON()];
  return be(i, [o]);
}
function Ao(t, e, n, r) {
  const s = Zr(n), i = t.type && t.type !== "replay_event" ? t.type : "event";
  Io(t, n?.sdk);
  const o = vo(t, s, r, e);
  return delete t.sdkProcessingMetadata, be(o, [[{ type: i }, t]]);
}
const yt = 0, zn = 1, jn = 2;
function Pe(t) {
  return new Ce((e) => {
    e(t);
  });
}
function nn(t) {
  return new Ce((e, n) => {
    n(t);
  });
}
class Ce {
  constructor(e) {
    this._state = yt, this._handlers = [], this._runExecutor(e);
  }
  /** @inheritdoc */
  then(e, n) {
    return new Ce((r, s) => {
      this._handlers.push([
        !1,
        (i) => {
          if (!e)
            r(i);
          else
            try {
              r(e(i));
            } catch (o) {
              s(o);
            }
        },
        (i) => {
          if (!n)
            s(i);
          else
            try {
              r(n(i));
            } catch (o) {
              s(o);
            }
        }
      ]), this._executeHandlers();
    });
  }
  /** @inheritdoc */
  catch(e) {
    return this.then((n) => n, e);
  }
  /** @inheritdoc */
  finally(e) {
    return new Ce((n, r) => {
      let s, i;
      return this.then(
        (o) => {
          i = !1, s = o, e && e();
        },
        (o) => {
          i = !0, s = o, e && e();
        }
      ).then(() => {
        if (i) {
          r(s);
          return;
        }
        n(s);
      });
    });
  }
  /** Excute the resolve/reject handlers. */
  _executeHandlers() {
    if (this._state === yt)
      return;
    const e = this._handlers.slice();
    this._handlers = [], e.forEach((n) => {
      n[0] || (this._state === zn && n[1](this._value), this._state === jn && n[2](this._value), n[0] = !0);
    });
  }
  /** Run the executor for the SyncPromise. */
  _runExecutor(e) {
    const n = (i, o) => {
      if (this._state === yt) {
        if (De(o)) {
          o.then(r, s);
          return;
        }
        this._state = i, this._value = o, this._executeHandlers();
      }
    }, r = (i) => {
      n(zn, i);
    }, s = (i) => {
      n(jn, i);
    };
    try {
      e(r, s);
    } catch (i) {
      s(i);
    }
  }
}
function Do(t, e, n, r = 0) {
  try {
    const s = Ot(e, n, t, r);
    return De(s) ? s : Pe(s);
  } catch (s) {
    return nn(s);
  }
}
function Ot(t, e, n, r) {
  const s = n[r];
  if (!t || !s)
    return t;
  const i = s({ ...t }, e);
  return _ && i === null && m.log(`Event processor "${s.id || "?"}" dropped event`), De(i) ? i.then((o) => Ot(o, e, n, r + 1)) : Ot(i, e, n, r + 1);
}
let Q, qn, Gn, G;
function No(t) {
  const e = R._sentryDebugIds, n = R._debugIds;
  if (!e && !n)
    return {};
  const r = e ? Object.keys(e) : [], s = n ? Object.keys(n) : [];
  if (G && r.length === qn && s.length === Gn)
    return G;
  qn = r.length, Gn = s.length, G = {}, Q || (Q = {});
  const i = (o, a) => {
    for (const c of o) {
      const l = a[c], d = Q?.[c];
      if (d && G && l)
        G[d[0]] = l, Q && (Q[c] = [d[0], l]);
      else if (l) {
        const u = t(c);
        for (let p = u.length - 1; p >= 0; p--) {
          const f = u[p]?.filename;
          if (f && G && Q) {
            G[f] = l, Q[c] = [f, l];
            break;
          }
        }
      }
    }
  };
  return e && i(r, e), n && i(s, n), G;
}
function Oo(t, e) {
  const { fingerprint: n, span: r, breadcrumbs: s, sdkProcessingMetadata: i } = e;
  $o(t, e), r && Mo(t, r), Fo(t, n), Po(t, s), Lo(t, i);
}
function Vn(t, e) {
  const {
    extra: n,
    tags: r,
    attributes: s,
    user: i,
    contexts: o,
    level: a,
    sdkProcessingMetadata: c,
    breadcrumbs: l,
    fingerprint: d,
    eventProcessors: u,
    attachments: p,
    propagationContext: h,
    transactionName: f,
    span: k
  } = e;
  Re(t, "extra", n), Re(t, "tags", r), Re(t, "attributes", s), Re(t, "user", i), Re(t, "contexts", o), t.sdkProcessingMetadata = Oe(t.sdkProcessingMetadata, c, 2), a && (t.level = a), f && (t.transactionName = f), k && (t.span = k), l.length && (t.breadcrumbs = [...t.breadcrumbs, ...l]), d.length && (t.fingerprint = [...t.fingerprint, ...d]), u.length && (t.eventProcessors = [...t.eventProcessors, ...u]), p.length && (t.attachments = [...t.attachments, ...p]), t.propagationContext = { ...t.propagationContext, ...h };
}
function Re(t, e, n) {
  t[e] = Oe(t[e], n, 1);
}
function Jr(t, e) {
  const n = Ci().getScopeData();
  return t && Vn(n, t.getScopeData()), e && Vn(n, e.getScopeData()), n;
}
function $o(t, e) {
  const { extra: n, tags: r, user: s, contexts: i, level: o, transactionName: a } = e;
  Object.keys(n).length && (t.extra = { ...n, ...t.extra }), Object.keys(r).length && (t.tags = { ...r, ...t.tags }), Object.keys(s).length && (t.user = { ...s, ...t.user }), Object.keys(i).length && (t.contexts = { ...i, ...t.contexts }), o && (t.level = o), a && t.type !== "transaction" && (t.transaction = a);
}
function Po(t, e) {
  const n = [...t.breadcrumbs || [], ...e];
  t.breadcrumbs = n.length ? n : void 0;
}
function Lo(t, e) {
  t.sdkProcessingMetadata = {
    ...t.sdkProcessingMetadata,
    ...e
  };
}
function Mo(t, e) {
  t.contexts = {
    trace: no(e),
    ...t.contexts
  }, t.sdkProcessingMetadata = {
    dynamicSamplingContext: go(e),
    ...t.sdkProcessingMetadata
  };
  const n = Xr(e), r = en(n).description;
  r && !t.transaction && t.type === "transaction" && (t.transaction = r);
}
function Fo(t, e) {
  t.fingerprint = t.fingerprint ? Array.isArray(t.fingerprint) ? t.fingerprint : [t.fingerprint] : [], e && (t.fingerprint = t.fingerprint.concat(e)), t.fingerprint.length || delete t.fingerprint;
}
function Uo(t, e, n, r, s, i) {
  const { normalizeDepth: o = 3, normalizeMaxBreadth: a = 1e3 } = t, c = {
    ...e,
    event_id: e.event_id || n.event_id || P(),
    timestamp: e.timestamp || Ne()
  }, l = n.integrations || t.integrations.map((A) => A.name);
  Bo(c, t), jo(c, l), s && s.emit("applyFrameMetadata", e), e.type === void 0 && Ho(c, t.stackParser);
  const d = Go(r, n.captureContext);
  n.mechanism && he(c, n.mechanism);
  const u = s ? s.getEventProcessors() : [], p = Jr(i, d), h = [...n.attachments || [], ...p.attachments];
  h.length && (n.attachments = h), Oo(c, p);
  const f = [
    ...u,
    // Run scope event processors _after_ all other processors
    ...p.eventProcessors
  ];
  return (n.data && n.data.__sentry__ === !0 ? Pe(c) : Do(f, c, n)).then((A) => (A && zo(A), typeof o == "number" && o > 0 ? qo(A, o, a) : A));
}
function Bo(t, e) {
  const { environment: n, release: r, dist: s, maxValueLength: i } = e;
  t.environment = t.environment || n || tn, !t.release && r && (t.release = r), !t.dist && s && (t.dist = s);
  const o = t.request;
  o?.url && i && (o.url = vt(o.url, i)), i && t.exception?.values?.forEach((a) => {
    a.value && (a.value = vt(a.value, i));
  });
}
function Ho(t, e) {
  const n = No(e);
  t.exception?.values?.forEach((r) => {
    r.stacktrace?.frames?.forEach((s) => {
      s.filename && (s.debug_id = n[s.filename]);
    });
  });
}
function zo(t) {
  const e = {};
  if (t.exception?.values?.forEach((r) => {
    r.stacktrace?.frames?.forEach((s) => {
      s.debug_id && (s.abs_path ? e[s.abs_path] = s.debug_id : s.filename && (e[s.filename] = s.debug_id), delete s.debug_id);
    });
  }), Object.keys(e).length === 0)
    return;
  t.debug_meta = t.debug_meta || {}, t.debug_meta.images = t.debug_meta.images || [];
  const n = t.debug_meta.images;
  Object.entries(e).forEach(([r, s]) => {
    n.push({
      type: "sourcemap",
      code_file: r,
      debug_id: s
    });
  });
}
function jo(t, e) {
  e.length > 0 && (t.sdk = t.sdk || {}, t.sdk.integrations = [...t.sdk.integrations || [], ...e]);
}
function qo(t, e, n) {
  if (!t)
    return null;
  const r = {
    ...t,
    ...t.breadcrumbs && {
      breadcrumbs: t.breadcrumbs.map((s) => ({
        ...s,
        ...s.data && {
          data: z(s.data, e, n)
        }
      }))
    },
    ...t.user && {
      user: z(t.user, e, n)
    },
    ...t.contexts && {
      contexts: z(t.contexts, e, n)
    },
    ...t.extra && {
      extra: z(t.extra, e, n)
    }
  };
  return t.contexts?.trace && r.contexts && (r.contexts.trace = t.contexts.trace, t.contexts.trace.data && (r.contexts.trace.data = z(t.contexts.trace.data, e, n))), t.spans && (r.spans = t.spans.map((s) => ({
    ...s,
    ...s.data && {
      data: z(s.data, e, n)
    }
  }))), t.contexts?.flags && r.contexts && (r.contexts.flags = z(t.contexts.flags, 3, n)), r;
}
function Go(t, e) {
  if (!e)
    return t;
  const n = t ? t.clone() : new B();
  return n.update(e), n;
}
function Vo(t) {
  if (t)
    return Wo(t) ? { captureContext: t } : Ko(t) ? {
      captureContext: t
    } : t;
}
function Wo(t) {
  return t instanceof B || typeof t == "function";
}
const Xo = [
  "user",
  "level",
  "extra",
  "contexts",
  "tags",
  "fingerprint",
  "propagationContext"
];
function Ko(t) {
  return Object.keys(t).some((e) => Xo.includes(e));
}
function Qr(t, e) {
  return H().captureException(t, Vo(e));
}
function Yo(t, e) {
  const n = typeof e == "string" ? e : void 0, r = typeof e != "string" ? { captureContext: e } : void 0;
  return H().captureMessage(t, n, r);
}
function es(t, e) {
  return H().captureEvent(t, e);
}
function Zo(t) {
  J().setUser(t);
}
function Wn(t) {
  const e = J(), { user: n } = Jr(e, H()), { userAgent: r } = R.navigator || {}, s = Ei({
    user: n,
    ...r && { userAgent: r },
    ...t
  }), i = e.getSession();
  return i?.status === "ok" && fe(i, { status: "exited" }), ts(), e.setSession(s), s;
}
function ts() {
  const t = J(), n = H().getSession() || t.getSession();
  n && bi(n), ns(), t.setSession();
}
function ns() {
  const t = J(), e = C(), n = t.getSession();
  n && e && e.captureSession(n);
}
function Et(t = !1) {
  if (t) {
    ts();
    return;
  }
  ns();
}
const Jo = "7";
function Qo(t) {
  const e = t.protocol ? `${t.protocol}:` : "", n = t.port ? `:${t.port}` : "";
  return `${e}//${t.host}${n}${t.path ? `/${t.path}` : ""}/api/`;
}
function ea(t) {
  return `${Qo(t)}${t.projectId}/envelope/`;
}
function ta(t, e) {
  const n = {
    sentry_version: Jo
  };
  return t.publicKey && (n.sentry_key = t.publicKey), e && (n.sentry_client = `${e.name}/${e.version}`), new URLSearchParams(n).toString();
}
function na(t, e, n) {
  return e || `${ea(t)}?${ta(t, n)}`;
}
const Xn = [];
function ra(t) {
  const e = {};
  return t.forEach((n) => {
    const { name: r } = n, s = e[r];
    s && !s.isDefaultInstance && n.isDefaultInstance || (e[r] = n);
  }), Object.values(e);
}
function sa(t) {
  const e = t.defaultIntegrations || [], n = t.integrations;
  e.forEach((s) => {
    s.isDefaultInstance = !0;
  });
  let r;
  if (Array.isArray(n))
    r = [...e, ...n];
  else if (typeof n == "function") {
    const s = n(e);
    r = Array.isArray(s) ? s : [s];
  } else
    r = e;
  return ra(r);
}
function ia(t, e) {
  const n = {};
  return e.forEach((r) => {
    r && rs(t, r, n);
  }), n;
}
function Kn(t, e) {
  for (const n of e)
    n?.afterAllSetup && n.afterAllSetup(t);
}
function rs(t, e, n) {
  if (n[e.name]) {
    _ && m.log(`Integration skipped because it was already installed: ${e.name}`);
    return;
  }
  if (n[e.name] = e, !Xn.includes(e.name) && typeof e.setupOnce == "function" && (e.setupOnce(), Xn.push(e.name)), e.setup && typeof e.setup == "function" && e.setup(t), typeof e.preprocessEvent == "function") {
    const r = e.preprocessEvent.bind(e);
    t.on("preprocessEvent", (s, i) => r(s, i, t));
  }
  if (typeof e.processEvent == "function") {
    const r = e.processEvent.bind(e), s = Object.assign((i, o) => r(i, o, t), {
      id: e.name
    });
    t.addEventProcessor(s);
  }
  _ && m.log(`Integration installed: ${e.name}`);
}
function oa(t) {
  return [
    {
      type: "log",
      item_count: t.length,
      content_type: "application/vnd.sentry.items.log+json"
    },
    {
      items: t
    }
  ];
}
function aa(t, e, n, r) {
  const s = {};
  return e?.sdk && (s.sdk = {
    name: e.sdk.name,
    version: e.sdk.version
  }), n && r && (s.dsn = $e(r)), be(s, [oa(t)]);
}
function $t(t, e) {
  const n = e ?? ca(t) ?? [];
  if (n.length === 0)
    return;
  const r = t.getOptions(), s = aa(n, r._metadata, r.tunnel, t.getDsn());
  ss().set(t, []), t.emit("flushLogs"), t.sendEnvelope(s);
}
function ca(t) {
  return ss().get(t);
}
function ss() {
  return _e("clientToLogBufferMap", () => /* @__PURE__ */ new WeakMap());
}
function la(t) {
  return [
    {
      type: "trace_metric",
      item_count: t.length,
      content_type: "application/vnd.sentry.items.trace-metric+json"
    },
    {
      items: t
    }
  ];
}
function ua(t, e, n, r) {
  const s = {};
  return e?.sdk && (s.sdk = {
    name: e.sdk.name,
    version: e.sdk.version
  }), n && r && (s.dsn = $e(r)), be(s, [la(t)]);
}
function is(t, e) {
  const n = e ?? da(t) ?? [];
  if (n.length === 0)
    return;
  const r = t.getOptions(), s = ua(n, r._metadata, r.tunnel, t.getDsn());
  os().set(t, []), t.emit("flushMetrics"), t.sendEnvelope(s);
}
function da(t) {
  return os().get(t);
}
function os() {
  return _e("clientToMetricBufferMap", () => /* @__PURE__ */ new WeakMap());
}
function as(t) {
  return typeof t == "object" && typeof t.unref == "function" && t.unref(), t;
}
const rn = Symbol.for("SentryBufferFullError");
function sn(t = 100) {
  const e = /* @__PURE__ */ new Set();
  function n() {
    return e.size < t;
  }
  function r(o) {
    e.delete(o);
  }
  function s(o) {
    if (!n())
      return nn(rn);
    const a = o();
    return e.add(a), a.then(
      () => r(a),
      () => r(a)
    ), a;
  }
  function i(o) {
    if (!e.size)
      return Pe(!0);
    const a = Promise.allSettled(Array.from(e)).then(() => !0);
    if (!o)
      return a;
    const c = [
      a,
      new Promise((l) => as(setTimeout(() => l(!1), o)))
    ];
    return Promise.race(c);
  }
  return {
    get $() {
      return Array.from(e);
    },
    add: s,
    drain: i
  };
}
const pa = 60 * 1e3;
function ha(t, e = ct()) {
  const n = parseInt(`${t}`, 10);
  if (!isNaN(n))
    return n * 1e3;
  const r = Date.parse(`${t}`);
  return isNaN(r) ? pa : r - e;
}
function fa(t, e) {
  return t[e] || t.all || 0;
}
function ga(t, e, n = ct()) {
  return fa(t, e) > n;
}
function ma(t, { statusCode: e, headers: n }, r = ct()) {
  const s = {
    ...t
  }, i = n?.["x-sentry-rate-limits"], o = n?.["retry-after"];
  if (i)
    for (const a of i.trim().split(",")) {
      const [c, l, , , d] = a.split(":", 5), u = parseInt(c, 10), p = (isNaN(u) ? 60 : u) * 1e3;
      if (!l)
        s.all = r + p;
      else
        for (const h of l.split(";"))
          h === "metric_bucket" ? (!d || d.split(";").includes("custom")) && (s[h] = r + p) : s[h] = r + p;
    }
  else o ? s.all = r + ha(o, r) : e === 429 && (s.all = r + 60 * 1e3);
  return s;
}
const cs = 64;
function _a(t, e, n = sn(
  t.bufferSize || cs
)) {
  let r = {};
  const s = (o) => n.drain(o);
  function i(o) {
    const a = [];
    if (Dt(o, (u, p) => {
      const h = Hn(p);
      ga(r, h) ? t.recordDroppedEvent("ratelimit_backoff", h) : a.push(u);
    }), a.length === 0)
      return Promise.resolve({});
    const c = be(o[0], a), l = (u) => {
      if (ko(c, ["client_report"])) {
        _ && m.warn(`Dropping client report. Will not send outcomes (reason: ${u}).`);
        return;
      }
      Dt(c, (p, h) => {
        t.recordDroppedEvent(u, Hn(h));
      });
    }, d = () => e({ body: xo(c) }).then(
      (u) => u.statusCode === 413 ? (_ && m.error(
        "Sentry responded with status code 413. Envelope was discarded due to exceeding size limits."
      ), l("send_error"), u) : (_ && u.statusCode !== void 0 && (u.statusCode < 200 || u.statusCode >= 300) && m.warn(`Sentry responded with status code ${u.statusCode} to sent event.`), r = ma(r, u), u),
      (u) => {
        throw l("network_error"), _ && m.error("Encountered error running transport request:", u), u;
      }
    );
    return n.add(d).then(
      (u) => u,
      (u) => {
        if (u === rn)
          return _ && m.error("Skipped sending event because buffer is full."), l("queue_overflow"), Promise.resolve({});
        throw u;
      }
    );
  }
  return {
    send: i,
    flush: s
  };
}
function ya(t, e, n) {
  const r = [
    { type: "client_report" },
    {
      timestamp: Ne(),
      discarded_events: t
    }
  ];
  return be(e ? { dsn: e } : {}, [r]);
}
function ls(t) {
  const e = [];
  t.message && e.push(t.message);
  try {
    const n = t.exception.values[t.exception.values.length - 1];
    n?.value && (e.push(n.value), n.type && e.push(`${n.type}: ${n.value}`));
  } catch {
  }
  return e;
}
function Ea(t) {
  const { trace_id: e, parent_span_id: n, span_id: r, status: s, origin: i, data: o, op: a } = t.contexts?.trace ?? {};
  return {
    data: o ?? {},
    description: t.transaction,
    op: a,
    parent_span_id: n,
    span_id: r ?? "",
    start_timestamp: t.start_timestamp ?? 0,
    status: s,
    timestamp: t.timestamp,
    trace_id: e ?? "",
    origin: i,
    profile_id: o?.[jr],
    exclusive_time: o?.[qr],
    measurements: t.measurements,
    is_segment: !0
  };
}
function ba(t) {
  return {
    type: "transaction",
    timestamp: t.timestamp,
    start_timestamp: t.start_timestamp,
    transaction: t.description,
    contexts: {
      trace: {
        trace_id: t.trace_id,
        span_id: t.span_id,
        parent_span_id: t.parent_span_id,
        op: t.op,
        status: t.status,
        origin: t.origin,
        data: {
          ...t.data,
          ...t.profile_id && { [jr]: t.profile_id },
          ...t.exclusive_time && { [qr]: t.exclusive_time }
        }
      }
    },
    measurements: t.measurements
  };
}
const Yn = "Not capturing exception because it's already been captured.", Zn = "Discarded session because of missing or non-string release", us = Symbol.for("SentryInternalError"), ds = Symbol.for("SentryDoNotSendEventError"), Sa = 5e3;
function Ve(t) {
  return {
    message: t,
    [us]: !0
  };
}
function bt(t) {
  return {
    message: t,
    [ds]: !0
  };
}
function Jn(t) {
  return !!t && typeof t == "object" && us in t;
}
function Qn(t) {
  return !!t && typeof t == "object" && ds in t;
}
function er(t, e, n, r, s) {
  let i = 0, o, a = !1;
  t.on(n, () => {
    i = 0, clearTimeout(o), a = !1;
  }), t.on(e, (c) => {
    i += r(c), i >= 8e5 ? s(t) : a || (a = !0, o = as(
      setTimeout(() => {
        s(t);
      }, Sa)
    ));
  }), t.on("flush", () => {
    s(t);
  });
}
class ka {
  /** Options passed to the SDK. */
  /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
  /** Array of set up integrations. */
  /** Number of calls being processed */
  /** Holds flushable  */
  // eslint-disable-next-line @typescript-eslint/ban-types
  /**
   * Initializes this client instance.
   *
   * @param options Options for the client.
   */
  constructor(e) {
    if (this._options = e, this._integrations = {}, this._numProcessing = 0, this._outcomes = {}, this._hooks = {}, this._eventProcessors = [], this._promiseBuffer = sn(e.transportOptions?.bufferSize ?? cs), e.dsn ? this._dsn = eo(e.dsn) : _ && m.warn("No DSN provided, client will not send events."), this._dsn) {
      const r = na(
        this._dsn,
        e.tunnel,
        e._metadata ? e._metadata.sdk : void 0
      );
      this._transport = e.transport({
        tunnel: this._options.tunnel,
        recordDroppedEvent: this.recordDroppedEvent.bind(this),
        ...e.transportOptions,
        url: r
      });
    }
    this._options.enableLogs = this._options.enableLogs ?? this._options._experiments?.enableLogs, this._options.enableLogs && er(this, "afterCaptureLog", "flushLogs", Ta, $t), (this._options.enableMetrics ?? this._options._experiments?.enableMetrics ?? !0) && er(
      this,
      "afterCaptureMetric",
      "flushMetrics",
      wa,
      is
    );
  }
  /**
   * Captures an exception event and sends it to Sentry.
   *
   * Unlike `captureException` exported from every SDK, this method requires that you pass it the current scope.
   */
  captureException(e, n, r) {
    const s = P();
    if (In(e))
      return _ && m.log(Yn), s;
    const i = {
      event_id: s,
      ...n
    };
    return this._process(
      () => this.eventFromException(e, i).then((o) => this._captureEvent(o, i, r)).then((o) => o),
      "error"
    ), i.event_id;
  }
  /**
   * Captures a message event and sends it to Sentry.
   *
   * Unlike `captureMessage` exported from every SDK, this method requires that you pass it the current scope.
   */
  captureMessage(e, n, r, s) {
    const i = {
      event_id: P(),
      ...r
    }, o = Kt(e) ? e : String(e), a = it(e), c = a ? this.eventFromMessage(o, n, i) : this.eventFromException(e, i);
    return this._process(
      () => c.then((l) => this._captureEvent(l, i, s)),
      a ? "unknown" : "error"
    ), i.event_id;
  }
  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * Unlike `captureEvent` exported from every SDK, this method requires that you pass it the current scope.
   */
  captureEvent(e, n, r) {
    const s = P();
    if (n?.originalException && In(n.originalException))
      return _ && m.log(Yn), s;
    const i = {
      event_id: s,
      ...n
    }, o = e.sdkProcessingMetadata || {}, a = o.capturedSpanScope, c = o.capturedSpanIsolationScope, l = tr(e.type);
    return this._process(
      () => this._captureEvent(e, i, a || r, c),
      l
    ), i.event_id;
  }
  /**
   * Captures a session.
   */
  captureSession(e) {
    this.sendSession(e), fe(e, { init: !1 });
  }
  /**
   * Create a cron monitor check in and send it to Sentry. This method is not available on all clients.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   * @param scope An optional scope containing event metadata.
   * @returns A string representing the id of the check in.
   */
  /**
   * Get the current Dsn.
   */
  getDsn() {
    return this._dsn;
  }
  /**
   * Get the current options.
   */
  getOptions() {
    return this._options;
  }
  /**
   * Get the SDK metadata.
   * @see SdkMetadata
   */
  getSdkMetadata() {
    return this._options._metadata;
  }
  /**
   * Returns the transport that is used by the client.
   * Please note that the transport gets lazy initialized so it will only be there once the first event has been sent.
   */
  getTransport() {
    return this._transport;
  }
  /**
   * Wait for all events to be sent or the timeout to expire, whichever comes first.
   *
   * @param timeout Maximum time in ms the client should wait for events to be flushed. Omitting this parameter will
   *   cause the client to wait until all events are sent before resolving the promise.
   * @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
   * still events in the queue when the timeout is reached.
   */
  // @ts-expect-error - PromiseLike is a subset of Promise
  async flush(e) {
    const n = this._transport;
    if (!n)
      return !0;
    this.emit("flush");
    const r = await this._isClientDoneProcessing(e), s = await n.flush(e);
    return r && s;
  }
  /**
   * Flush the event queue and set the client to `enabled = false`. See {@link Client.flush}.
   *
   * @param {number} timeout Maximum time in ms the client should wait before shutting down. Omitting this parameter will cause
   *   the client to wait until all events are sent before disabling itself.
   * @returns {Promise<boolean>} A promise which resolves to `true` if the flush completes successfully before the timeout, or `false` if
   * it doesn't.
   */
  // @ts-expect-error - PromiseLike is a subset of Promise
  async close(e) {
    $t(this);
    const n = await this.flush(e);
    return this.getOptions().enabled = !1, this.emit("close"), n;
  }
  /**
   * Get all installed event processors.
   */
  getEventProcessors() {
    return this._eventProcessors;
  }
  /**
   * Adds an event processor that applies to any event processed by this client.
   */
  addEventProcessor(e) {
    this._eventProcessors.push(e);
  }
  /**
   * Initialize this client.
   * Call this after the client was set on a scope.
   */
  init() {
    (this._isEnabled() || // Force integrations to be setup even if no DSN was set when we have
    // Spotlight enabled. This is particularly important for browser as we
    // don't support the `spotlight` option there and rely on the users
    // adding the `spotlightBrowserIntegration()` to their integrations which
    // wouldn't get initialized with the check below when there's no DSN set.
    this._options.integrations.some(({ name: e }) => e.startsWith("Spotlight"))) && this._setupIntegrations();
  }
  /**
   * Gets an installed integration by its name.
   *
   * @returns {Integration|undefined} The installed integration or `undefined` if no integration with that `name` was installed.
   */
  getIntegrationByName(e) {
    return this._integrations[e];
  }
  /**
   * Add an integration to the client.
   * This can be used to e.g. lazy load integrations.
   * In most cases, this should not be necessary,
   * and you're better off just passing the integrations via `integrations: []` at initialization time.
   * However, if you find the need to conditionally load & add an integration, you can use `addIntegration` to do so.
   */
  addIntegration(e) {
    const n = this._integrations[e.name];
    rs(this, e, this._integrations), n || Kn(this, [e]);
  }
  /**
   * Send a fully prepared event to Sentry.
   */
  sendEvent(e, n = {}) {
    this.emit("beforeSendEvent", e, n);
    let r = Ao(e, this._dsn, this._options._metadata, this._options.tunnel);
    for (const s of n.attachments || [])
      r = So(r, wo(s));
    this.sendEnvelope(r).then((s) => this.emit("afterSendEvent", e, s));
  }
  /**
   * Send a session or session aggregrates to Sentry.
   */
  sendSession(e) {
    const { release: n, environment: r = tn } = this._options;
    if ("aggregates" in e) {
      const i = e.attrs || {};
      if (!i.release && !n) {
        _ && m.warn(Zn);
        return;
      }
      i.release = i.release || n, i.environment = i.environment || r, e.attrs = i;
    } else {
      if (!e.release && !n) {
        _ && m.warn(Zn);
        return;
      }
      e.release = e.release || n, e.environment = e.environment || r;
    }
    this.emit("beforeSendSession", e);
    const s = Co(e, this._dsn, this._options._metadata, this._options.tunnel);
    this.sendEnvelope(s);
  }
  /**
   * Record on the client that an event got dropped (ie, an event that will not be sent to Sentry).
   */
  recordDroppedEvent(e, n, r = 1) {
    if (this._options.sendClientReports) {
      const s = `${e}:${n}`;
      _ && m.log(`Recording outcome: "${s}"${r > 1 ? ` (${r} times)` : ""}`), this._outcomes[s] = (this._outcomes[s] || 0) + r;
    }
  }
  /* eslint-disable @typescript-eslint/unified-signatures */
  /**
   * Register a callback for whenever a span is started.
   * Receives the span as argument.
   * @returns {() => void} A function that, when executed, removes the registered callback.
   */
  /**
   * Register a hook on this client.
   */
  on(e, n) {
    const r = this._hooks[e] = this._hooks[e] || /* @__PURE__ */ new Set(), s = (...i) => n(...i);
    return r.add(s), () => {
      r.delete(s);
    };
  }
  /** Fire a hook whenever a span starts. */
  /**
   * Emit a hook that was previously registered via `on()`.
   */
  emit(e, ...n) {
    const r = this._hooks[e];
    r && r.forEach((s) => s(...n));
  }
  /**
   * Send an envelope to Sentry.
   */
  // @ts-expect-error - PromiseLike is a subset of Promise
  async sendEnvelope(e) {
    if (this.emit("beforeEnvelope", e), this._isEnabled() && this._transport)
      try {
        return await this._transport.send(e);
      } catch (n) {
        return _ && m.error("Error while sending envelope:", n), {};
      }
    return _ && m.error("Transport disabled"), {};
  }
  /**
   * Disposes of the client and releases all resources.
   *
   * Subclasses should override this method to clean up their own resources.
   * After calling dispose(), the client should not be used anymore.
   */
  dispose() {
  }
  /* eslint-enable @typescript-eslint/unified-signatures */
  /** Setup integrations for this client. */
  _setupIntegrations() {
    const { integrations: e } = this._options;
    this._integrations = ia(this, e), Kn(this, e);
  }
  /** Updates existing session based on the provided event */
  _updateSessionFromEvent(e, n) {
    let r = n.level === "fatal", s = !1;
    const i = n.exception?.values;
    if (i) {
      s = !0, r = !1;
      for (const c of i)
        if (c.mechanism?.handled === !1) {
          r = !0;
          break;
        }
    }
    const o = e.status === "ok";
    (o && e.errors === 0 || o && r) && (fe(e, {
      ...r && { status: "crashed" },
      errors: e.errors || Number(s || r)
    }), this.captureSession(e));
  }
  /**
   * Determine if the client is finished processing. Returns a promise because it will wait `timeout` ms before saying
   * "no" (resolving to `false`) in order to give the client a chance to potentially finish first.
   *
   * @param timeout The time, in ms, after which to resolve to `false` if the client is still busy. Passing `0` (or not
   * passing anything) will make the promise wait as long as it takes for processing to finish before resolving to
   * `true`.
   * @returns A promise which will resolve to `true` if processing is already done or finishes before the timeout, and
   * `false` otherwise
   */
  async _isClientDoneProcessing(e) {
    let n = 0;
    for (; !e || n < e; ) {
      if (await new Promise((r) => setTimeout(r, 1)), !this._numProcessing)
        return !0;
      n++;
    }
    return !1;
  }
  /** Determines whether this SDK is enabled and a transport is present. */
  _isEnabled() {
    return this.getOptions().enabled !== !1 && this._transport !== void 0;
  }
  /**
   * Adds common information to events.
   *
   * The information includes release and environment from `options`,
   * breadcrumbs and context (extra, tags and user) from the scope.
   *
   * Information that is already present in the event is never overwritten. For
   * nested objects, such as the context, keys are merged.
   *
   * @param event The original event.
   * @param hint May contain additional information about the original exception.
   * @param currentScope A scope containing event metadata.
   * @returns A new event with more information.
   */
  _prepareEvent(e, n, r, s) {
    const i = this.getOptions(), o = Object.keys(this._integrations);
    return !n.integrations && o?.length && (n.integrations = o), this.emit("preprocessEvent", e, n), e.type || s.setLastEventId(e.event_id || n.event_id), Uo(i, e, n, r, this, s).then((a) => {
      if (a === null)
        return a;
      this.emit("postprocessEvent", a, n), a.contexts = {
        trace: { ...a.contexts?.trace, ...Di(r) },
        ...a.contexts
      };
      const c = fo(this, r);
      return a.sdkProcessingMetadata = {
        dynamicSamplingContext: c,
        ...a.sdkProcessingMetadata
      }, a;
    });
  }
  /**
   * Processes the event and logs an error in case of rejection
   * @param event
   * @param hint
   * @param scope
   */
  _captureEvent(e, n = {}, r = H(), s = J()) {
    return _ && Pt(e) && m.log(`Captured error event \`${ls(e)[0] || "<unknown>"}\``), this._processEvent(e, n, r, s).then(
      (i) => i.event_id,
      (i) => {
        _ && (Qn(i) ? m.log(i.message) : Jn(i) ? m.warn(i.message) : m.warn(i));
      }
    );
  }
  /**
   * Processes an event (either error or message) and sends it to Sentry.
   *
   * This also adds breadcrumbs and context information to the event. However,
   * platform specific meta data (such as the User's IP address) must be added
   * by the SDK implementor.
   *
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   * @param currentScope A scope containing event metadata.
   * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
   */
  _processEvent(e, n, r, s) {
    const i = this.getOptions(), { sampleRate: o } = i, a = ps(e), c = Pt(e), d = `before send for type \`${e.type || "error"}\``, u = typeof o > "u" ? void 0 : to(o);
    if (c && typeof u == "number" && Ze() > u)
      return this.recordDroppedEvent("sample_rate", "error"), nn(
        bt(
          `Discarding event because it's not included in the random sample (sampling rate = ${o})`
        )
      );
    const p = tr(e.type);
    return this._prepareEvent(e, n, r, s).then((h) => {
      if (h === null)
        throw this.recordDroppedEvent("event_processor", p), bt("An event processor returned `null`, will not send event.");
      if (n.data && n.data.__sentry__ === !0)
        return h;
      const k = Ra(this, i, h, n);
      return xa(k, d);
    }).then((h) => {
      if (h === null) {
        if (this.recordDroppedEvent("before_send", p), a) {
          const A = 1 + (e.spans || []).length;
          this.recordDroppedEvent("before_send", "span", A);
        }
        throw bt(`${d} returned \`null\`, will not send event.`);
      }
      const f = r.getSession() || s.getSession();
      if (c && f && this._updateSessionFromEvent(f, h), a) {
        const N = h.sdkProcessingMetadata?.spanCountBeforeProcessing || 0, A = h.spans ? h.spans.length : 0, ke = N - A;
        ke > 0 && this.recordDroppedEvent("before_send", "span", ke);
      }
      const k = h.transaction_info;
      if (a && k && h.transaction !== e.transaction) {
        const N = "custom";
        h.transaction_info = {
          ...k,
          source: N
        };
      }
      return this.sendEvent(h, n), h;
    }).then(null, (h) => {
      throw Qn(h) || Jn(h) ? h : (this.captureException(h, {
        mechanism: {
          handled: !1,
          type: "internal"
        },
        data: {
          __sentry__: !0
        },
        originalException: h
      }), Ve(
        `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.
Reason: ${h}`
      ));
    });
  }
  /**
   * Occupies the client with processing and event
   */
  _process(e, n) {
    this._numProcessing++, this._promiseBuffer.add(e).then(
      (r) => (this._numProcessing--, r),
      (r) => (this._numProcessing--, r === rn && this.recordDroppedEvent("queue_overflow", n), r)
    );
  }
  /**
   * Clears outcomes on this client and returns them.
   */
  _clearOutcomes() {
    const e = this._outcomes;
    return this._outcomes = {}, Object.entries(e).map(([n, r]) => {
      const [s, i] = n.split(":");
      return {
        reason: s,
        category: i,
        quantity: r
      };
    });
  }
  /**
   * Sends client reports as an envelope.
   */
  _flushOutcomes() {
    _ && m.log("Flushing outcomes...");
    const e = this._clearOutcomes();
    if (e.length === 0) {
      _ && m.log("No outcomes to send");
      return;
    }
    if (!this._dsn) {
      _ && m.log("No dsn provided, will not send outcomes");
      return;
    }
    _ && m.log("Sending outcomes:", e);
    const n = ya(e, this._options.tunnel && $e(this._dsn));
    this.sendEnvelope(n);
  }
  /**
   * Creates an {@link Event} from all inputs to `captureException` and non-primitive inputs to `captureMessage`.
   */
}
function tr(t) {
  return t === "replay_event" ? "replay" : t || "error";
}
function xa(t, e) {
  const n = `${e} must return \`null\` or a valid event.`;
  if (De(t))
    return t.then(
      (r) => {
        if (!Ie(r) && r !== null)
          throw Ve(n);
        return r;
      },
      (r) => {
        throw Ve(`${e} rejected with ${r}`);
      }
    );
  if (!Ie(t) && t !== null)
    throw Ve(n);
  return t;
}
function Ra(t, e, n, r) {
  const { beforeSend: s, beforeSendTransaction: i, beforeSendSpan: o, ignoreSpans: a } = e;
  let c = n;
  if (Pt(c) && s)
    return s(c, r);
  if (ps(c)) {
    if (o || a) {
      const l = Ea(c);
      if (a?.length && Bn(l, a))
        return null;
      if (o) {
        const d = o(l);
        d ? c = Oe(n, ba(d)) : Fn();
      }
      if (c.spans) {
        const d = [], u = c.spans;
        for (const h of u) {
          if (a?.length && Bn(h, a)) {
            uo(u, h);
            continue;
          }
          if (o) {
            const f = o(h);
            f ? d.push(f) : (Fn(), d.push(h));
          } else
            d.push(h);
        }
        const p = c.spans.length - d.length;
        p && t.recordDroppedEvent("before_send", "span", p), c.spans = d;
      }
    }
    if (i) {
      if (c.spans) {
        const l = c.spans.length;
        c.sdkProcessingMetadata = {
          ...n.sdkProcessingMetadata,
          spanCountBeforeProcessing: l
        };
      }
      return i(c, r);
    }
  }
  return c;
}
function Pt(t) {
  return t.type === void 0;
}
function ps(t) {
  return t.type === "transaction";
}
function wa(t) {
  let e = 0;
  return t.name && (e += t.name.length * 2), e += 8, e + hs(t.attributes);
}
function Ta(t) {
  let e = 0;
  return t.message && (e += t.message.length * 2), e + hs(t.attributes);
}
function hs(t) {
  if (!t)
    return 0;
  let e = 0;
  return Object.values(t).forEach((n) => {
    Array.isArray(n) ? e += n.length * nr(n[0]) : it(n) ? e += nr(n) : e += 100;
  }), e;
}
function nr(t) {
  return typeof t == "string" ? t.length * 2 : typeof t == "number" ? 8 : typeof t == "boolean" ? 4 : 0;
}
function va(t) {
  return st(t) && "__sentry_fetch_url_host__" in t && typeof t.__sentry_fetch_url_host__ == "string";
}
function rr(t) {
  return va(t) ? `${t.message} (${t.__sentry_fetch_url_host__})` : t.message;
}
function Ia(t, e) {
  e.debug === !0 && (_ ? m.enable() : ye(() => {
    console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
  })), H().update(e.initialScope);
  const r = new t(e);
  return Ca(r), r.init(), r;
}
function Ca(t) {
  H().setClient(t);
}
function St(t) {
  if (!t)
    return {};
  const e = t.match(/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);
  if (!e)
    return {};
  const n = e[6] || "", r = e[8] || "";
  return {
    host: e[4],
    path: e[5],
    protocol: e[2],
    search: n,
    hash: r,
    relative: e[5] + n + r
    // everything minus origin
  };
}
function Aa(t, e = !0) {
  if (t.startsWith("data:")) {
    const n = t.match(/^data:([^;,]+)/), r = n ? n[1] : "text/plain", s = t.includes(";base64,"), i = t.indexOf(",");
    let o = "";
    if (e && i !== -1) {
      const a = t.slice(i + 1);
      o = a.length > 10 ? `${a.slice(0, 10)}... [truncated]` : a;
    }
    return `data:${r}${s ? ",base64" : ""}${o ? `,${o}` : ""}`;
  }
  return t;
}
function Da(t) {
  "aggregates" in t ? t.attrs?.ip_address === void 0 && (t.attrs = {
    ...t.attrs,
    ip_address: "{{auto}}"
  }) : t.ipAddress === void 0 && (t.ipAddress = "{{auto}}");
}
function Na(t, e, n = [e], r = "npm") {
  const s = (t._metadata = t._metadata || {}).sdk = t._metadata.sdk || {};
  s.name || (s.name = `sentry.javascript.${e}`, s.packages = n.map((i) => ({
    name: `${r}:@sentry/${i}`,
    version: ie
  })), s.version = ie);
}
const Oa = 100;
function Z(t, e) {
  const n = C(), r = J();
  if (!n) return;
  const { beforeBreadcrumb: s = null, maxBreadcrumbs: i = Oa } = n.getOptions();
  if (i <= 0) return;
  const a = { timestamp: Ne(), ...t }, c = s ? ye(() => s(a, e)) : a;
  c !== null && (n.emit && n.emit("beforeAddBreadcrumb", c, e), r.addBreadcrumb(c, i));
}
let sr;
const $a = "FunctionToString", ir = /* @__PURE__ */ new WeakMap(), Pa = (() => ({
  name: $a,
  setupOnce() {
    sr = Function.prototype.toString;
    try {
      Function.prototype.toString = function(...t) {
        const e = Jt(this), n = ir.has(C()) && e !== void 0 ? e : this;
        return sr.apply(n, t);
      };
    } catch {
    }
  },
  setup(t) {
    ir.set(t, !0);
  }
})), La = Pa, Ma = [
  /^Script error\.?$/,
  /^Javascript error: Script error\.? on line 0$/,
  /^ResizeObserver loop completed with undelivered notifications.$/,
  // The browser logs this when a ResizeObserver handler takes a bit longer. Usually this is not an actual issue though. It indicates slowness.
  /^Cannot redefine property: googletag$/,
  // This is thrown when google tag manager is used in combination with an ad blocker
  /^Can't find variable: gmo$/,
  // Error from Google Search App https://issuetracker.google.com/issues/396043331
  /^undefined is not an object \(evaluating 'a\.[A-Z]'\)$/,
  // Random error that happens but not actionable or noticeable to end-users.
  `can't redefine non-configurable property "solana"`,
  // Probably a browser extension or custom browser (Brave) throwing this error
  "vv().getRestrictions is not a function. (In 'vv().getRestrictions(1,a)', 'vv().getRestrictions' is undefined)",
  // Error thrown by GTM, seemingly not affecting end-users
  "Can't find variable: _AutofillCallbackHandler",
  // Unactionable error in instagram webview https://developers.facebook.com/community/threads/320013549791141/
  /^Non-Error promise rejection captured with value: Object Not Found Matching Id:\d+, MethodName:simulateEvent, ParamCount:\d+$/,
  // unactionable error from CEFSharp, a .NET library that embeds chromium in .NET apps
  /^Java exception was raised during method invocation$/
  // error from Facebook Mobile browser (https://github.com/getsentry/sentry-javascript/issues/15065)
], Fa = "EventFilters", Ua = (t = {}) => {
  let e;
  return {
    name: Fa,
    setup(n) {
      const r = n.getOptions();
      e = or(t, r);
    },
    processEvent(n, r, s) {
      if (!e) {
        const i = s.getOptions();
        e = or(t, i);
      }
      return Ha(n, e) ? null : n;
    }
  };
}, Ba = ((t = {}) => ({
  ...Ua(t),
  name: "InboundFilters"
}));
function or(t = {}, e = {}) {
  return {
    allowUrls: [...t.allowUrls || [], ...e.allowUrls || []],
    denyUrls: [...t.denyUrls || [], ...e.denyUrls || []],
    ignoreErrors: [
      ...t.ignoreErrors || [],
      ...e.ignoreErrors || [],
      ...t.disableErrorDefaults ? [] : Ma
    ],
    ignoreTransactions: [...t.ignoreTransactions || [], ...e.ignoreTransactions || []]
  };
}
function Ha(t, e) {
  if (t.type) {
    if (t.type === "transaction" && ja(t, e.ignoreTransactions))
      return _ && m.warn(
        `Event dropped due to being matched by \`ignoreTransactions\` option.
Event: ${re(t)}`
      ), !0;
  } else {
    if (za(t, e.ignoreErrors))
      return _ && m.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.
Event: ${re(t)}`
      ), !0;
    if (Wa(t))
      return _ && m.warn(
        `Event dropped due to not having an error message, error type or stacktrace.
Event: ${re(
          t
        )}`
      ), !0;
    if (qa(t, e.denyUrls))
      return _ && m.warn(
        `Event dropped due to being matched by \`denyUrls\` option.
Event: ${re(
          t
        )}.
Url: ${Je(t)}`
      ), !0;
    if (!Ga(t, e.allowUrls))
      return _ && m.warn(
        `Event dropped due to not being matched by \`allowUrls\` option.
Event: ${re(
          t
        )}.
Url: ${Je(t)}`
      ), !0;
  }
  return !1;
}
function za(t, e) {
  return e?.length ? ls(t).some((n) => lt(n, e)) : !1;
}
function ja(t, e) {
  if (!e?.length)
    return !1;
  const n = t.transaction;
  return n ? lt(n, e) : !1;
}
function qa(t, e) {
  if (!e?.length)
    return !1;
  const n = Je(t);
  return n ? lt(n, e) : !1;
}
function Ga(t, e) {
  if (!e?.length)
    return !0;
  const n = Je(t);
  return n ? lt(n, e) : !0;
}
function Va(t = []) {
  for (let e = t.length - 1; e >= 0; e--) {
    const n = t[e];
    if (n && n.filename !== "<anonymous>" && n.filename !== "[native code]")
      return n.filename || null;
  }
  return null;
}
function Je(t) {
  try {
    const n = [...t.exception?.values ?? []].reverse().find((r) => r.mechanism?.parent_id === void 0 && r.stacktrace?.frames?.length)?.stacktrace?.frames;
    return n ? Va(n) : null;
  } catch {
    return _ && m.error(`Cannot extract url for event ${re(t)}`), null;
  }
}
function Wa(t) {
  return t.exception?.values?.length ? (
    // No top-level message
    !t.message && // There are no exception values that have a stacktrace, a non-generic-Error type or value
    !t.exception.values.some((e) => e.stacktrace || e.type && e.type !== "Error" || e.value)
  ) : !1;
}
function Xa(t, e, n, r, s, i) {
  if (!s.exception?.values || !i || !K(i.originalException, Error))
    return;
  const o = s.exception.values.length > 0 ? s.exception.values[s.exception.values.length - 1] : void 0;
  o && (s.exception.values = Lt(
    t,
    e,
    r,
    i.originalException,
    n,
    s.exception.values,
    o,
    0
  ));
}
function Lt(t, e, n, r, s, i, o, a) {
  if (i.length >= n + 1)
    return i;
  let c = [...i];
  if (K(r[s], Error)) {
    ar(o, a, r);
    const l = t(e, r[s]), d = c.length;
    cr(l, s, d, a), c = Lt(
      t,
      e,
      n,
      r[s],
      s,
      [l, ...c],
      l,
      d
    );
  }
  return fs(r) && r.errors.forEach((l, d) => {
    if (K(l, Error)) {
      ar(o, a, r);
      const u = t(e, l), p = c.length;
      cr(u, `errors[${d}]`, p, a), c = Lt(
        t,
        e,
        n,
        l,
        s,
        [u, ...c],
        u,
        p
      );
    }
  }), c;
}
function fs(t) {
  return Array.isArray(t.errors);
}
function ar(t, e, n) {
  t.mechanism = {
    handled: !0,
    type: "auto.core.linked_errors",
    ...fs(n) && { is_exception_group: !0 },
    ...t.mechanism,
    exception_id: e
  };
}
function cr(t, e, n, r) {
  t.mechanism = {
    handled: !0,
    ...t.mechanism,
    type: "chained",
    source: e,
    exception_id: n,
    parent_id: r
  };
}
function Ka(t) {
  const e = "console";
  ce(e, t), le(e, Ya);
}
function Ya() {
  "console" in R && Xs.forEach(function(t) {
    t in R.console && $(R.console, t, function(e) {
      return Ye[t] = e, function(...n) {
        F("console", { args: n, level: t }), Ye[t]?.apply(R.console, n);
      };
    });
  });
}
function Za(t) {
  return t === "warn" ? "warning" : ["fatal", "error", "warning", "log", "info", "debug"].includes(t) ? t : "log";
}
const Ja = "Dedupe", Qa = (() => {
  let t;
  return {
    name: Ja,
    processEvent(e) {
      if (e.type)
        return e;
      try {
        if (tc(e, t))
          return _ && m.warn("Event dropped due to being a duplicate of previously captured event."), null;
      } catch {
      }
      return t = e;
    }
  };
}), ec = Qa;
function tc(t, e) {
  return e ? !!(nc(t, e) || rc(t, e)) : !1;
}
function nc(t, e) {
  const n = t.message, r = e.message;
  return !(!n && !r || n && !r || !n && r || n !== r || !ms(t, e) || !gs(t, e));
}
function rc(t, e) {
  const n = lr(e), r = lr(t);
  return !(!n || !r || n.type !== r.type || n.value !== r.value || !ms(t, e) || !gs(t, e));
}
function gs(t, e) {
  let n = kn(t), r = kn(e);
  if (!n && !r)
    return !0;
  if (n && !r || !n && r || (n = n, r = r, r.length !== n.length))
    return !1;
  for (let s = 0; s < r.length; s++) {
    const i = r[s], o = n[s];
    if (i.filename !== o.filename || i.lineno !== o.lineno || i.colno !== o.colno || i.function !== o.function)
      return !1;
  }
  return !0;
}
function ms(t, e) {
  let n = t.fingerprint, r = e.fingerprint;
  if (!n && !r)
    return !0;
  if (n && !r || !n && r)
    return !1;
  n = n, r = r;
  try {
    return n.join("") === r.join("");
  } catch {
    return !1;
  }
}
function lr(t) {
  return t.exception?.values?.[0];
}
const sc = "ConversationId", ic = (() => ({
  name: sc,
  setup(t) {
    t.on("spanStart", (e) => {
      const n = H().getScopeData(), r = J().getScopeData(), s = n.conversationId || r.conversationId;
      s && e.setAttribute(Mi, s);
    });
  }
})), oc = ic;
function _s(t) {
  if (t !== void 0)
    return t >= 400 && t < 500 ? "warning" : t >= 500 ? "error" : void 0;
}
const Ae = R;
function ac() {
  return "history" in Ae && !!Ae.history;
}
function cc() {
  if (!("fetch" in Ae))
    return !1;
  try {
    return new Headers(), new Request("data:,"), new Response(), !0;
  } catch {
    return !1;
  }
}
function Mt(t) {
  return t && /^function\s+\w+\(\)\s+\{\s+\[native code\]\s+\}$/.test(t.toString());
}
function lc() {
  if (typeof EdgeRuntime == "string")
    return !0;
  if (!cc())
    return !1;
  if (Mt(Ae.fetch))
    return !0;
  let t = !1;
  const e = Ae.document;
  if (e && typeof e.createElement == "function")
    try {
      const n = e.createElement("iframe");
      n.hidden = !0, e.head.appendChild(n), n.contentWindow?.fetch && (t = Mt(n.contentWindow.fetch)), e.head.removeChild(n);
    } catch (n) {
      _ && m.warn("Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ", n);
    }
  return t;
}
function uc(t, e) {
  const n = "fetch";
  ce(n, t), le(n, () => dc(void 0, e));
}
function dc(t, e = !1) {
  e && !lc() || $(R, "fetch", function(n) {
    return function(...r) {
      const s = new Error(), { method: i, url: o } = pc(r), a = {
        args: r,
        fetchData: {
          method: i,
          url: o
        },
        startTimestamp: q() * 1e3,
        // // Adding the error to be able to fingerprint the failed fetch event in HttpClient instrumentation
        virtualError: s,
        headers: hc(r)
      };
      return F("fetch", {
        ...a
      }), n.apply(R, r).then(
        async (c) => (F("fetch", {
          ...a,
          endTimestamp: q() * 1e3,
          response: c
        }), c),
        (c) => {
          F("fetch", {
            ...a,
            endTimestamp: q() * 1e3,
            error: c
          }), st(c) && c.stack === void 0 && (c.stack = s.stack, Y(c, "framesToPop", 1));
          const d = C()?.getOptions().enhanceFetchErrorMessages ?? "always";
          if (d !== !1 && c instanceof TypeError && (c.message === "Failed to fetch" || c.message === "Load failed" || c.message === "NetworkError when attempting to fetch resource."))
            try {
              const h = new URL(a.fetchData.url).host;
              d === "always" ? c.message = `${c.message} (${h})` : Y(c, "__sentry_fetch_url_host__", h);
            } catch {
            }
          throw c;
        }
      );
    };
  });
}
function We(t, e) {
  return !!t && typeof t == "object" && !!t[e];
}
function ur(t) {
  return typeof t == "string" ? t : t ? We(t, "url") ? t.url : t.toString ? t.toString() : "" : "";
}
function pc(t) {
  if (t.length === 0)
    return { method: "GET", url: "" };
  if (t.length === 2) {
    const [n, r] = t;
    return {
      url: ur(n),
      method: We(r, "method") ? String(r.method).toUpperCase() : (
        // Request object as first argument
        Lr(n) && We(n, "method") ? String(n.method).toUpperCase() : "GET"
      )
    };
  }
  const e = t[0];
  return {
    url: ur(e),
    method: We(e, "method") ? String(e.method).toUpperCase() : "GET"
  };
}
function hc(t) {
  const [e, n] = t;
  try {
    if (typeof n == "object" && n !== null && "headers" in n && n.headers)
      return new Headers(n.headers);
    if (Lr(e))
      return new Headers(e.headers);
  } catch {
  }
}
function fc() {
  return "npm";
}
const T = R;
let Ft = 0;
function ys() {
  return Ft > 0;
}
function gc() {
  Ft++, setTimeout(() => {
    Ft--;
  });
}
function me(t, e = {}) {
  function n(s) {
    return typeof s == "function";
  }
  if (!n(t))
    return t;
  try {
    const s = t.__sentry_wrapped__;
    if (s)
      return typeof s == "function" ? s : t;
    if (Jt(t))
      return t;
  } catch {
    return t;
  }
  const r = function(...s) {
    try {
      const i = s.map((o) => me(o, e));
      return t.apply(this, i);
    } catch (i) {
      throw gc(), Ai((o) => {
        o.addEventProcessor((a) => (e.mechanism && (It(a, void 0), he(a, e.mechanism)), a.extra = {
          ...a.extra,
          arguments: s
        }, a)), Qr(i);
      }), i;
    }
  };
  try {
    for (const s in t)
      Object.prototype.hasOwnProperty.call(t, s) && (r[s] = t[s]);
  } catch {
  }
  Fr(r, t), Y(t, "__sentry_wrapped__", r);
  try {
    Object.getOwnPropertyDescriptor(r, "name").configurable && Object.defineProperty(r, "name", {
      get() {
        return t.name;
      }
    });
  } catch {
  }
  return r;
}
function mc() {
  const t = Zt(), { referrer: e } = T.document || {}, { userAgent: n } = T.navigator || {}, r = {
    ...e && { Referer: e },
    ...n && { "User-Agent": n }
  };
  return {
    url: t,
    headers: r
  };
}
function on(t, e) {
  const n = an(t, e), r = {
    type: Sc(e),
    value: kc(e)
  };
  return n.length && (r.stacktrace = { frames: n }), r.type === void 0 && r.value === "" && (r.value = "Unrecoverable error caught"), r;
}
function _c(t, e, n, r) {
  const i = C()?.getOptions().normalizeDepth, o = vc(e), a = {
    __serialized__: Yr(e, i)
  };
  if (o)
    return {
      exception: {
        values: [on(t, o)]
      },
      extra: a
    };
  const c = {
    exception: {
      values: [
        {
          type: ot(e) ? e.constructor.name : r ? "UnhandledRejection" : "Error",
          value: wc(e, { isUnhandledRejection: r })
        }
      ]
    },
    extra: a
  };
  if (n) {
    const l = an(t, n);
    l.length && (c.exception.values[0].stacktrace = { frames: l });
  }
  return c;
}
function kt(t, e) {
  return {
    exception: {
      values: [on(t, e)]
    }
  };
}
function an(t, e) {
  const n = e.stacktrace || e.stack || "", r = Ec(e), s = bc(e);
  try {
    return t(n, r, s);
  } catch {
  }
  return [];
}
const yc = /Minified React error #\d+;/i;
function Ec(t) {
  return t && yc.test(t.message) ? 1 : 0;
}
function bc(t) {
  return typeof t.framesToPop == "number" ? t.framesToPop : 0;
}
function Es(t) {
  return typeof WebAssembly < "u" && typeof WebAssembly.Exception < "u" ? t instanceof WebAssembly.Exception : !1;
}
function Sc(t) {
  const e = t?.name;
  return !e && Es(t) ? t.message && Array.isArray(t.message) && t.message.length == 2 ? t.message[0] : "WebAssembly.Exception" : e;
}
function kc(t) {
  const e = t?.message;
  return Es(t) ? Array.isArray(t.message) && t.message.length == 2 ? t.message[1] : "wasm exception" : e ? e.error && typeof e.error.message == "string" ? rr(e.error) : rr(t) : "No error message";
}
function xc(t, e, n, r) {
  const s = n?.syntheticException || void 0, i = cn(t, e, s, r);
  return he(i), i.level = "error", n?.event_id && (i.event_id = n.event_id), Pe(i);
}
function Rc(t, e, n = "info", r, s) {
  const i = r?.syntheticException || void 0, o = Ut(t, e, i, s);
  return o.level = n, r?.event_id && (o.event_id = r.event_id), Pe(o);
}
function cn(t, e, n, r, s) {
  let i;
  if ($r(e) && e.error)
    return kt(t, e.error);
  if (Rn(e) || ai(e)) {
    const o = e;
    if ("stack" in e)
      i = kt(t, e);
    else {
      const a = o.name || (Rn(o) ? "DOMError" : "DOMException"), c = o.message ? `${a}: ${o.message}` : a;
      i = Ut(t, c, n, r), It(i, c);
    }
    return "code" in o && (i.tags = { ...i.tags, "DOMException.code": `${o.code}` }), i;
  }
  return st(e) ? kt(t, e) : Ie(e) || ot(e) ? (i = _c(t, e, n, s), he(i, {
    synthetic: !0
  }), i) : (i = Ut(t, e, n, r), It(i, `${e}`), he(i, {
    synthetic: !0
  }), i);
}
function Ut(t, e, n, r) {
  const s = {};
  if (r && n) {
    const i = an(t, n);
    i.length && (s.exception = {
      values: [{ value: e, stacktrace: { frames: i } }]
    }), he(s, { synthetic: !0 });
  }
  if (Kt(e)) {
    const { __sentry_template_string__: i, __sentry_template_values__: o } = e;
    return s.logentry = {
      message: i,
      params: o
    }, s;
  }
  return s.message = e, s;
}
function wc(t, { isUnhandledRejection: e }) {
  const n = fi(t), r = e ? "promise rejection" : "exception";
  return $r(t) ? `Event \`ErrorEvent\` captured as ${r} with message \`${t.message}\`` : ot(t) ? `Event \`${Tc(t)}\` (type=${t.type}) captured as ${r}` : `Object captured as ${r} with keys: ${n}`;
}
function Tc(t) {
  try {
    const e = Object.getPrototypeOf(t);
    return e ? e.constructor.name : void 0;
  } catch {
  }
}
function vc(t) {
  for (const e in t)
    if (Object.prototype.hasOwnProperty.call(t, e)) {
      const n = t[e];
      if (n instanceof Error)
        return n;
    }
}
class Ic extends ka {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  constructor(e) {
    const n = Cc(e), r = T.SENTRY_SDK_SOURCE || fc();
    Na(n, "browser", ["browser"], r), n._metadata?.sdk && (n._metadata.sdk.settings = {
      infer_ip: n.sendDefaultPii ? "auto" : "never",
      // purposefully allowing already passed settings to override the default
      ...n._metadata.sdk.settings
    }), super(n);
    const {
      sendDefaultPii: s,
      sendClientReports: i,
      enableLogs: o,
      _experiments: a,
      enableMetrics: c
    } = this._options, l = c ?? a?.enableMetrics ?? !0;
    T.document && (i || o || l) && T.document.addEventListener("visibilitychange", () => {
      T.document.visibilityState === "hidden" && (i && this._flushOutcomes(), o && $t(this), l && is(this));
    }), s && this.on("beforeSendSession", Da);
  }
  /**
   * @inheritDoc
   */
  eventFromException(e, n) {
    return xc(this._options.stackParser, e, n, this._options.attachStacktrace);
  }
  /**
   * @inheritDoc
   */
  eventFromMessage(e, n = "info", r) {
    return Rc(this._options.stackParser, e, n, r, this._options.attachStacktrace);
  }
  /**
   * @inheritDoc
   */
  _prepareEvent(e, n, r, s) {
    return e.platform = e.platform || "javascript", super._prepareEvent(e, n, r, s);
  }
}
function Cc(t) {
  return {
    release: typeof __SENTRY_RELEASE__ == "string" ? __SENTRY_RELEASE__ : T.SENTRY_RELEASE?.id,
    // This supports the variable that sentry-webpack-plugin injects
    sendClientReports: !0,
    // We default this to true, as it is the safer scenario
    parentSpanIsAlwaysRootSpan: !0,
    ...t
  };
}
const Ac = typeof __SENTRY_DEBUG__ > "u" || __SENTRY_DEBUG__, D = R, Dc = 1e3;
let dr, Bt, Ht;
function Nc(t) {
  ce("dom", t), le("dom", Oc);
}
function Oc() {
  if (!D.document)
    return;
  const t = F.bind(null, "dom"), e = pr(t, !0);
  D.document.addEventListener("click", e, !1), D.document.addEventListener("keypress", e, !1), ["EventTarget", "Node"].forEach((n) => {
    const s = D[n]?.prototype;
    s?.hasOwnProperty?.("addEventListener") && ($(s, "addEventListener", function(i) {
      return function(o, a, c) {
        if (o === "click" || o == "keypress")
          try {
            const l = this.__sentry_instrumentation_handlers__ = this.__sentry_instrumentation_handlers__ || {}, d = l[o] = l[o] || { refCount: 0 };
            if (!d.handler) {
              const u = pr(t);
              d.handler = u, i.call(this, o, u, c);
            }
            d.refCount++;
          } catch {
          }
        return i.call(this, o, a, c);
      };
    }), $(
      s,
      "removeEventListener",
      function(i) {
        return function(o, a, c) {
          if (o === "click" || o == "keypress")
            try {
              const l = this.__sentry_instrumentation_handlers__ || {}, d = l[o];
              d && (d.refCount--, d.refCount <= 0 && (i.call(this, o, d.handler, c), d.handler = void 0, delete l[o]), Object.keys(l).length === 0 && delete this.__sentry_instrumentation_handlers__);
            } catch {
            }
          return i.call(this, o, a, c);
        };
      }
    ));
  });
}
function $c(t) {
  if (t.type !== Bt)
    return !1;
  try {
    if (!t.target || t.target._sentryId !== Ht)
      return !1;
  } catch {
  }
  return !0;
}
function Pc(t, e) {
  return t !== "keypress" ? !1 : e?.tagName ? !(e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable) : !0;
}
function pr(t, e = !1) {
  return (n) => {
    if (!n || n._sentryCaptured)
      return;
    const r = Lc(n);
    if (Pc(n.type, r))
      return;
    Y(n, "_sentryCaptured", !0), r && !r._sentryId && Y(r, "_sentryId", P());
    const s = n.type === "keypress" ? "input" : n.type;
    $c(n) || (t({ event: n, name: s, global: e }), Bt = n.type, Ht = r ? r._sentryId : void 0), clearTimeout(dr), dr = D.setTimeout(() => {
      Ht = void 0, Bt = void 0;
    }, Dc);
  };
}
function Lc(t) {
  try {
    return t.target;
  } catch {
    return null;
  }
}
let Fe;
function bs(t) {
  const e = "history";
  ce(e, t), le(e, Mc);
}
function Mc() {
  if (D.addEventListener("popstate", () => {
    const e = D.location.href, n = Fe;
    if (Fe = e, n === e)
      return;
    F("history", { from: n, to: e });
  }), !ac())
    return;
  function t(e) {
    return function(...n) {
      const r = n.length > 2 ? n[2] : void 0;
      if (r) {
        const s = Fe, i = Fc(String(r));
        if (Fe = i, s === i)
          return e.apply(this, n);
        F("history", { from: s, to: i });
      }
      return e.apply(this, n);
    };
  }
  $(D.history, "pushState", t), $(D.history, "replaceState", t);
}
function Fc(t) {
  try {
    return new URL(t, D.location.origin).toString();
  } catch {
    return t;
  }
}
const Xe = {};
function Uc(t) {
  const e = Xe[t];
  if (e)
    return e;
  let n = D[t];
  if (Mt(n))
    return Xe[t] = n.bind(D);
  const r = D.document;
  if (r && typeof r.createElement == "function")
    try {
      const s = r.createElement("iframe");
      s.hidden = !0, r.head.appendChild(s);
      const i = s.contentWindow;
      i?.[t] && (n = i[t]), r.head.removeChild(s);
    } catch (s) {
      Ac && m.warn(`Could not create sandbox iframe for ${t} check, bailing to window.${t}: `, s);
    }
  return n && (Xe[t] = n.bind(D));
}
function Bc(t) {
  Xe[t] = void 0;
}
const Te = "__sentry_xhr_v3__";
function Hc(t) {
  ce("xhr", t), le("xhr", zc);
}
function zc() {
  if (!D.XMLHttpRequest)
    return;
  const t = XMLHttpRequest.prototype;
  t.open = new Proxy(t.open, {
    apply(e, n, r) {
      const s = new Error(), i = q() * 1e3, o = j(r[0]) ? r[0].toUpperCase() : void 0, a = jc(r[1]);
      if (!o || !a)
        return e.apply(n, r);
      n[Te] = {
        method: o,
        url: a,
        request_headers: {}
      }, o === "POST" && a.match(/sentry_key/) && (n.__sentry_own_request__ = !0);
      const c = () => {
        const l = n[Te];
        if (l && n.readyState === 4) {
          try {
            l.status_code = n.status;
          } catch {
          }
          const d = {
            endTimestamp: q() * 1e3,
            startTimestamp: i,
            xhr: n,
            virtualError: s
          };
          F("xhr", d);
        }
      };
      return "onreadystatechange" in n && typeof n.onreadystatechange == "function" ? n.onreadystatechange = new Proxy(n.onreadystatechange, {
        apply(l, d, u) {
          return c(), l.apply(d, u);
        }
      }) : n.addEventListener("readystatechange", c), n.setRequestHeader = new Proxy(n.setRequestHeader, {
        apply(l, d, u) {
          const [p, h] = u, f = d[Te];
          return f && j(p) && j(h) && (f.request_headers[p.toLowerCase()] = h), l.apply(d, u);
        }
      }), e.apply(n, r);
    }
  }), t.send = new Proxy(t.send, {
    apply(e, n, r) {
      const s = n[Te];
      if (!s)
        return e.apply(n, r);
      r[0] !== void 0 && (s.body = r[0]);
      const i = {
        startTimestamp: q() * 1e3,
        xhr: n
      };
      return F("xhr", i), e.apply(n, r);
    }
  });
}
function jc(t) {
  if (j(t))
    return t;
  try {
    return t.toString();
  } catch {
  }
}
const qc = 40;
function Gc(t, e = Uc("fetch")) {
  let n = 0, r = 0;
  async function s(i) {
    const o = i.body.length;
    n += o, r++;
    const a = {
      body: i.body,
      method: "POST",
      referrerPolicy: "strict-origin",
      headers: t.headers,
      // Outgoing requests are usually cancelled when navigating to a different page, causing a "TypeError: Failed to
      // fetch" error and sending a "network_error" client-outcome - in Chrome, the request status shows "(cancelled)".
      // The `keepalive` flag keeps outgoing requests alive, even when switching pages. We want this since we're
      // frequently sending events right before the user is switching pages (eg. when finishing navigation transactions).
      // Gotchas:
      // - `keepalive` isn't supported by Firefox
      // - As per spec (https://fetch.spec.whatwg.org/#http-network-or-cache-fetch):
      //   If the sum of contentLength and inflightKeepaliveBytes is greater than 64 kibibytes, then return a network error.
      //   We will therefore only activate the flag when we're below that limit.
      // There is also a limit of requests that can be open at the same time, so we also limit this to 15
      // See https://github.com/getsentry/sentry-javascript/pull/7553 for details
      keepalive: n <= 6e4 && r < 15,
      ...t.fetchOptions
    };
    try {
      const c = await e(t.url, a);
      return {
        statusCode: c.status,
        headers: {
          "x-sentry-rate-limits": c.headers.get("X-Sentry-Rate-Limits"),
          "retry-after": c.headers.get("Retry-After")
        }
      };
    } catch (c) {
      throw Bc("fetch"), c;
    } finally {
      n -= o, r--;
    }
  }
  return _a(
    t,
    s,
    sn(t.bufferSize || qc)
  );
}
const ut = typeof __SENTRY_DEBUG__ > "u" || __SENTRY_DEBUG__, Vc = 30, Wc = 50;
function zt(t, e, n, r) {
  const s = {
    filename: t,
    function: e === "<anonymous>" ? oe : e,
    in_app: !0
    // All browser frames are considered in_app
  };
  return n !== void 0 && (s.lineno = n), r !== void 0 && (s.colno = r), s;
}
const Xc = /^\s*at (\S+?)(?::(\d+))(?::(\d+))\s*$/i, Kc = /^\s*at (?:(.+?\)(?: \[.+\])?|.*?) ?\((?:address at )?)?(?:async )?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, Yc = /\((\S*)(?::(\d+))(?::(\d+))\)/, Zc = /at (.+?) ?\(data:(.+?),/, Jc = (t) => {
  const e = t.match(Zc);
  if (e)
    return {
      filename: `<data:${e[2]}>`,
      function: e[1]
    };
  const n = Xc.exec(t);
  if (n) {
    const [, s, i, o] = n;
    return zt(s, oe, +i, +o);
  }
  const r = Kc.exec(t);
  if (r) {
    if (r[2] && r[2].indexOf("eval") === 0) {
      const a = Yc.exec(r[2]);
      a && (r[2] = a[1], r[3] = a[2], r[4] = a[3]);
    }
    const [i, o] = Ss(r[1] || oe, r[2]);
    return zt(o, i, r[3] ? +r[3] : void 0, r[4] ? +r[4] : void 0);
  }
}, Qc = [Vc, Jc], el = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i, tl = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i, nl = (t) => {
  const e = el.exec(t);
  if (e) {
    if (e[3] && e[3].indexOf(" > eval") > -1) {
      const i = tl.exec(e[3]);
      i && (e[1] = e[1] || "eval", e[3] = i[1], e[4] = i[2], e[5] = "");
    }
    let r = e[3], s = e[1] || oe;
    return [s, r] = Ss(s, r), zt(r, s, e[4] ? +e[4] : void 0, e[5] ? +e[5] : void 0);
  }
}, rl = [Wc, nl], sl = [Qc, rl], il = Dr(...sl), Ss = (t, e) => {
  const n = t.indexOf("safari-extension") !== -1, r = t.indexOf("safari-web-extension") !== -1;
  return n || r ? [
    t.indexOf("@") !== -1 ? t.split("@")[0] : oe,
    n ? `safari-extension:${e}` : `safari-web-extension:${e}`
  ] : [t, e];
}, Ue = 1024, ol = "Breadcrumbs", al = ((t = {}) => {
  const e = {
    console: !0,
    dom: !0,
    fetch: !0,
    history: !0,
    sentry: !0,
    xhr: !0,
    ...t
  };
  return {
    name: ol,
    setup(n) {
      e.console && Ka(dl(n)), e.dom && Nc(ul(n, e.dom)), e.xhr && Hc(pl(n)), e.fetch && uc(hl(n)), e.history && bs(fl(n)), e.sentry && n.on("beforeSendEvent", ll(n));
    }
  };
}), cl = al;
function ll(t) {
  return function(n) {
    C() === t && Z(
      {
        category: `sentry.${n.type === "transaction" ? "transaction" : "event"}`,
        event_id: n.event_id,
        level: n.level,
        message: re(n)
      },
      {
        event: n
      }
    );
  };
}
function ul(t, e) {
  return function(r) {
    if (C() !== t)
      return;
    let s, i, o = typeof e == "object" ? e.serializeAttribute : void 0, a = typeof e == "object" && typeof e.maxStringLength == "number" ? e.maxStringLength : void 0;
    a && a > Ue && (ut && m.warn(
      `\`dom.maxStringLength\` cannot exceed ${Ue}, but a value of ${a} was configured. Sentry will use ${Ue} instead.`
    ), a = Ue), typeof o == "string" && (o = [o]);
    try {
      const l = r.event, d = gl(l) ? l.target : l;
      s = Mr(d, { keyAttrs: o, maxStringLength: a }), i = hi(d);
    } catch {
      s = "<unknown>";
    }
    if (s.length === 0)
      return;
    const c = {
      category: `ui.${r.name}`,
      message: s
    };
    i && (c.data = { "ui.component_name": i }), Z(c, {
      event: r.event,
      name: r.name,
      global: r.global
    });
  };
}
function dl(t) {
  return function(n) {
    if (C() !== t)
      return;
    const r = {
      category: "console",
      data: {
        arguments: n.args,
        logger: "console"
      },
      level: Za(n.level),
      message: vn(n.args, " ")
    };
    if (n.level === "assert")
      if (n.args[0] === !1)
        r.message = `Assertion failed: ${vn(n.args.slice(1), " ") || "console.assert"}`, r.data.arguments = n.args.slice(1);
      else
        return;
    Z(r, {
      input: n.args,
      level: n.level
    });
  };
}
function pl(t) {
  return function(n) {
    if (C() !== t)
      return;
    const { startTimestamp: r, endTimestamp: s } = n, i = n.xhr[Te];
    if (!r || !s || !i)
      return;
    const { method: o, url: a, status_code: c, body: l } = i, d = {
      method: o,
      url: a,
      status_code: c
    }, u = {
      xhr: n.xhr,
      input: l,
      startTimestamp: r,
      endTimestamp: s
    }, p = {
      category: "xhr",
      data: d,
      type: "http",
      level: _s(c)
    };
    t.emit("beforeOutgoingRequestBreadcrumb", p, u), Z(p, u);
  };
}
function hl(t) {
  return function(n) {
    if (C() !== t)
      return;
    const { startTimestamp: r, endTimestamp: s } = n;
    if (s && !(n.fetchData.url.match(/sentry_key/) && n.fetchData.method === "POST"))
      if (n.fetchData.method, n.fetchData.url, n.error) {
        const i = n.fetchData, o = {
          data: n.error,
          input: n.args,
          startTimestamp: r,
          endTimestamp: s
        }, a = {
          category: "fetch",
          data: i,
          level: "error",
          type: "http"
        };
        t.emit("beforeOutgoingRequestBreadcrumb", a, o), Z(a, o);
      } else {
        const i = n.response, o = {
          ...n.fetchData,
          status_code: i?.status
        };
        n.fetchData.request_body_size, n.fetchData.response_body_size, i?.status;
        const a = {
          input: n.args,
          response: i,
          startTimestamp: r,
          endTimestamp: s
        }, c = {
          category: "fetch",
          data: o,
          type: "http",
          level: _s(o.status_code)
        };
        t.emit("beforeOutgoingRequestBreadcrumb", c, a), Z(c, a);
      }
  };
}
function fl(t) {
  return function(n) {
    if (C() !== t)
      return;
    let r = n.from, s = n.to;
    const i = St(T.location.href);
    let o = r ? St(r) : void 0;
    const a = St(s);
    o?.path || (o = i), i.protocol === a.protocol && i.host === a.host && (s = a.relative), i.protocol === o.protocol && i.host === o.host && (r = o.relative), Z({
      category: "navigation",
      data: {
        from: r,
        to: s
      }
    });
  };
}
function gl(t) {
  return !!t && !!t.target;
}
const ml = [
  "EventTarget",
  "Window",
  "Node",
  "ApplicationCache",
  "AudioTrackList",
  "BroadcastChannel",
  "ChannelMergerNode",
  "CryptoOperation",
  "EventSource",
  "FileReader",
  "HTMLUnknownElement",
  "IDBDatabase",
  "IDBRequest",
  "IDBTransaction",
  "KeyOperation",
  "MediaController",
  "MessagePort",
  "ModalWindow",
  "Notification",
  "SVGElementInstance",
  "Screen",
  "SharedWorker",
  "TextTrack",
  "TextTrackCue",
  "TextTrackList",
  "WebSocket",
  "WebSocketWorker",
  "Worker",
  "XMLHttpRequest",
  "XMLHttpRequestEventTarget",
  "XMLHttpRequestUpload"
], _l = "BrowserApiErrors", yl = ((t = {}) => {
  const e = {
    XMLHttpRequest: !0,
    eventTarget: !0,
    requestAnimationFrame: !0,
    setInterval: !0,
    setTimeout: !0,
    unregisterOriginalCallbacks: !1,
    ...t
  };
  return {
    name: _l,
    // TODO: This currently only works for the first client this is setup
    // We may want to adjust this to check for client etc.
    setupOnce() {
      e.setTimeout && $(T, "setTimeout", hr), e.setInterval && $(T, "setInterval", hr), e.requestAnimationFrame && $(T, "requestAnimationFrame", bl), e.XMLHttpRequest && "XMLHttpRequest" in T && $(XMLHttpRequest.prototype, "send", Sl);
      const n = e.eventTarget;
      n && (Array.isArray(n) ? n : ml).forEach((s) => kl(s, e));
    }
  };
}), El = yl;
function hr(t) {
  return function(...e) {
    const n = e[0];
    return e[0] = me(n, {
      mechanism: {
        handled: !1,
        type: `auto.browser.browserapierrors.${X(t)}`
      }
    }), t.apply(this, e);
  };
}
function bl(t) {
  return function(e) {
    return t.apply(this, [
      me(e, {
        mechanism: {
          data: {
            handler: X(t)
          },
          handled: !1,
          type: "auto.browser.browserapierrors.requestAnimationFrame"
        }
      })
    ]);
  };
}
function Sl(t) {
  return function(...e) {
    const n = this;
    return ["onload", "onerror", "onprogress", "onreadystatechange"].forEach((s) => {
      s in n && typeof n[s] == "function" && $(n, s, function(i) {
        const o = {
          mechanism: {
            data: {
              handler: X(i)
            },
            handled: !1,
            type: `auto.browser.browserapierrors.xhr.${s}`
          }
        }, a = Jt(i);
        return a && (o.mechanism.data.handler = X(a)), me(i, o);
      });
    }), t.apply(this, e);
  };
}
function kl(t, e) {
  const r = T[t]?.prototype;
  r?.hasOwnProperty?.("addEventListener") && ($(r, "addEventListener", function(s) {
    return function(i, o, a) {
      try {
        xl(o) && (o.handleEvent = me(o.handleEvent, {
          mechanism: {
            data: {
              handler: X(o),
              target: t
            },
            handled: !1,
            type: "auto.browser.browserapierrors.handleEvent"
          }
        }));
      } catch {
      }
      return e.unregisterOriginalCallbacks && Rl(this, i, o), s.apply(this, [
        i,
        me(o, {
          mechanism: {
            data: {
              handler: X(o),
              target: t
            },
            handled: !1,
            type: "auto.browser.browserapierrors.addEventListener"
          }
        }),
        a
      ]);
    };
  }), $(r, "removeEventListener", function(s) {
    return function(i, o, a) {
      try {
        const c = o.__sentry_wrapped__;
        c && s.call(this, i, c, a);
      } catch {
      }
      return s.call(this, i, o, a);
    };
  }));
}
function xl(t) {
  return typeof t.handleEvent == "function";
}
function Rl(t, e, n) {
  t && typeof t == "object" && "removeEventListener" in t && typeof t.removeEventListener == "function" && t.removeEventListener(e, n);
}
const wl = (t = {}) => {
  const e = t.lifecycle ?? "route";
  return {
    name: "BrowserSession",
    setupOnce() {
      if (typeof T.document > "u") {
        ut && m.warn("Using the `browserSessionIntegration` in non-browser environments is not supported.");
        return;
      }
      Wn({ ignoreDuration: !0 }), Et();
      const n = J();
      let r = n.getUser();
      n.addScopeListener((s) => {
        const i = s.getUser();
        (r?.id !== i?.id || r?.ip_address !== i?.ip_address) && (Et(), r = i);
      }), e === "route" && bs(({ from: s, to: i }) => {
        s !== i && (Wn({ ignoreDuration: !0 }), Et());
      });
    }
  };
}, Tl = "CultureContext", vl = (() => ({
  name: Tl,
  preprocessEvent(t) {
    const e = Cl();
    e && (t.contexts = {
      ...t.contexts,
      culture: { ...e, ...t.contexts?.culture }
    });
  }
})), Il = vl;
function Cl() {
  try {
    const t = T.Intl;
    if (!t)
      return;
    const e = t.DateTimeFormat().resolvedOptions();
    return {
      locale: e.locale,
      timezone: e.timeZone,
      calendar: e.calendar
    };
  } catch {
    return;
  }
}
const Al = "GlobalHandlers", Dl = ((t = {}) => {
  const e = {
    onerror: !0,
    onunhandledrejection: !0,
    ...t
  };
  return {
    name: Al,
    setupOnce() {
      Error.stackTraceLimit = 50;
    },
    setup(n) {
      e.onerror && (Ol(n), fr("onerror")), e.onunhandledrejection && ($l(n), fr("onunhandledrejection"));
    }
  };
}), Nl = Dl;
function Ol(t) {
  ri((e) => {
    const { stackParser: n, attachStacktrace: r } = ks();
    if (C() !== t || ys())
      return;
    const { msg: s, url: i, line: o, column: a, error: c } = e, l = Ml(
      cn(n, c || s, void 0, r, !1),
      i,
      o,
      a
    );
    l.level = "error", es(l, {
      originalException: c,
      mechanism: {
        handled: !1,
        type: "auto.browser.global_handlers.onerror"
      }
    });
  });
}
function $l(t) {
  ii((e) => {
    const { stackParser: n, attachStacktrace: r } = ks();
    if (C() !== t || ys())
      return;
    const s = Pl(e), i = it(s) ? Ll(s) : cn(n, s, void 0, r, !0);
    i.level = "error", es(i, {
      originalException: s,
      mechanism: {
        handled: !1,
        type: "auto.browser.global_handlers.onunhandledrejection"
      }
    });
  });
}
function Pl(t) {
  if (it(t))
    return t;
  try {
    if ("reason" in t)
      return t.reason;
    if ("detail" in t && "reason" in t.detail)
      return t.detail.reason;
  } catch {
  }
  return t;
}
function Ll(t) {
  return {
    exception: {
      values: [
        {
          type: "UnhandledRejection",
          // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
          value: `Non-Error promise rejection captured with value: ${String(t)}`
        }
      ]
    }
  };
}
function Ml(t, e, n, r) {
  const s = t.exception = t.exception || {}, i = s.values = s.values || [], o = i[0] = i[0] || {}, a = o.stacktrace = o.stacktrace || {}, c = a.frames = a.frames || [], l = r, d = n, u = Fl(e) ?? Zt();
  return c.length === 0 && c.push({
    colno: l,
    filename: u,
    function: oe,
    in_app: !0,
    lineno: d
  }), t;
}
function fr(t) {
  ut && m.log(`Global Handler attached: ${t}`);
}
function ks() {
  return C()?.getOptions() || {
    stackParser: () => [],
    attachStacktrace: !1
  };
}
function Fl(t) {
  if (!(!j(t) || t.length === 0))
    return t.startsWith("data:") ? `<${Aa(t, !1)}>` : t;
}
const Ul = () => ({
  name: "HttpContext",
  preprocessEvent(t) {
    if (!T.navigator && !T.location && !T.document)
      return;
    const e = mc(), n = {
      ...e.headers,
      ...t.request?.headers
    };
    t.request = {
      ...e,
      ...t.request,
      headers: n
    };
  }
}), Bl = "cause", Hl = 5, zl = "LinkedErrors", jl = ((t = {}) => {
  const e = t.limit || Hl, n = t.key || Bl;
  return {
    name: zl,
    preprocessEvent(r, s, i) {
      const o = i.getOptions();
      Xa(
        // This differs from the LinkedErrors integration in core by using a different exceptionFromError function
        on,
        o.stackParser,
        n,
        e,
        r,
        s
      );
    }
  };
}), ql = jl;
function Gl() {
  return Vl() ? (ut && ye(() => {
    console.error(
      "[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/"
    );
  }), !0) : !1;
}
function Vl() {
  if (typeof T.window > "u")
    return !1;
  const t = T;
  if (t.nw || !(t.chrome || t.browser)?.runtime?.id)
    return !1;
  const n = Zt(), r = ["chrome-extension", "moz-extension", "ms-browser-extension", "safari-web-extension"];
  return !(T === T.top && r.some((i) => n.startsWith(`${i}://`)));
}
function Wl(t) {
  return [
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    Ba(),
    La(),
    oc(),
    El(),
    cl(),
    Nl(),
    ql(),
    ec(),
    Ul(),
    Il(),
    wl()
  ];
}
function Xl(t = {}) {
  const e = !t.skipBrowserExtensionCheck && Gl();
  let n = t.defaultIntegrations == null ? Wl() : t.defaultIntegrations;
  const r = {
    ...t,
    enabled: e ? !1 : t.enabled,
    stackParser: ti(t.stackParser || il),
    integrations: sa({
      integrations: t.integrations,
      defaultIntegrations: n
    }),
    transport: t.transport || Gc
  };
  return Ia(Ic, r);
}
const Kl = "https://06451c8d861702902d2e6b2088fa9b62@o1128948.ingest.us.sentry.io/4509207135387648";
class Yl {
  constructor(e) {
    this.enabled = e;
  }
  init(e) {
    this.enabled && Xl({
      dsn: Kl,
      environment: e,
      defaultIntegrations: !1,
      tracesSampleRate: 0
    });
  }
  setUser(e) {
    !this.enabled || !e || (this.flavour = e, Zo({ id: e, username: e }));
  }
  setTransactionId(e) {
    this.txnId = e;
  }
  addBreadcrumb(e, n, r) {
    this.enabled && Z({ category: e, message: n, data: r, level: "info", timestamp: Date.now() / 1e3 });
  }
  captureEvent(e, n) {
    this.enabled && Yo(e, {
      level: "info",
      tags: { txn_id: this.txnId, flavour: this.flavour },
      extra: n,
      fingerprint: [e, this.txnId ?? ""]
    });
  }
  captureError(e, n) {
    this.enabled && Qr(e, {
      tags: { txn_id: this.txnId, flavour: this.flavour },
      extra: n
    });
  }
}
const b = {
  AUDIO_ERROR: 1001,
  SUCCESS: 200,
  TXN_ERROR: 1003,
  BAD_REQUEST: 1004,
  INTERNAL_SERVER_ERROR: 1005,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403
};
var Zl = /* @__PURE__ */ ((t) => (t.NOT_INITIALIZED = "na", t.INIT = "init", t.STOP = "stop", t.COMMIT = "commit", t))(Zl || {}), Jl = /* @__PURE__ */ ((t) => (t.START = "start", t.PAUSE = "pause", t.RESUME = "resume", t.STOP = "stop", t))(Jl || {}), Ql = /* @__PURE__ */ ((t) => (t.EKA_EMR_TEMPLATE = "eka_emr_template", t.CLINICAL_NOTE_TEMPLATE = "clinical_notes_template", t.TRANSCRIPT_TEMPLATE = "transcript_template", t.EKA_EMR_TO_FHIR_TEMPLATE = "eka_emr_to_fhir_template", t.NIC_TEMPLATE = "nic_template", t))(Ql || {}), eu = /* @__PURE__ */ ((t) => (t.SUCCESS = "success", t.FAILURE = "failure", t.PARTIAL_COMPLETE = "partial_complete", t.IN_PROGRESS = "in-progress", t))(eu || {}), y = /* @__PURE__ */ ((t) => (t.TXN_INIT_FAILED = "txn_init_failed", t.TXN_LIMIT_EXCEEDED = "txn_limit_exceeded", t.INTERNAL_SERVER_ERROR = "internal_server_error", t.END_RECORDING_FAILED = "end_recording_failed", t.AUDIO_UPLOAD_FAILED = "audio_upload_failed", t.TXN_COMMIT_FAILED = "txn_commit_failed", t.TXN_STATUS_MISMATCH = "txn_status_mismatch", t.NETWORK_ERROR = "network_error", t.UNKNOWN_ERROR = "unknown_error", t.UNAUTHORIZED = "unauthorized", t.FORBIDDEN = "forbidden", t.START_RECORDING_FAILED = "start_recording_failed", t.BAD_REQUEST = "bad_request", t.NOT_FOUND = "not_found", t))(y || {}), tu = /* @__PURE__ */ ((t) => (t.SUCCESS = "success", t.IN_PROGRESS = "in-progress", t.FAILED = "failed", t.CANCELLED = "cancelled", t))(tu || {}), nu = /* @__PURE__ */ ((t) => (t.AWS_CONFIGURE_STATUS = "aws_configure_status", t.FILE_UPLOAD_STATUS = "file_upload_status", t.TRANSACTION_STATUS = "transaction_status", t.TEMPLATE_OPERATION_STATUS = "template_operation_status", t.AUTHENTICATION_STATUS = "authentication_status", t.NETWORK_STATUS = "network_status", t.STORAGE_STATUS = "storage_status", t))(nu || {}), Ke = /* @__PURE__ */ ((t) => (t.JSON = "json", t.TRANSCRIPT = "transcript", t.MARKDOWN = "markdown", t))(Ke || {}), te = /* @__PURE__ */ ((t) => (t.INTERNET_CONNECTIVITY = "INTERNET_CONNECTIVITY", t.SYSTEM_INFO = "SYSTEM_INFO", t.MICROPHONE = "MICROPHONE", t.SHARED_WORKER = "SHARED_WORKER", t.NETWORK_API = "NETWORK_API", t))(te || {}), v = /* @__PURE__ */ ((t) => (t.SUCCESS = "success", t.ERROR = "error", t.WARNING = "warning", t))(v || {});
const ru = 404, su = 408, iu = {
  [b.UNAUTHORIZED]: {
    error_code: y.UNAUTHORIZED,
    detail: "Authentication failed. Token may be expired."
  },
  [b.FORBIDDEN]: {
    error_code: y.FORBIDDEN,
    detail: "Access forbidden."
  },
  [ru]: {
    error_code: y.NOT_FOUND,
    detail: "Requested resource not found."
  },
  [su]: {
    error_code: y.NETWORK_ERROR,
    detail: "Request timed out."
  }
};
function ou(t, e) {
  const n = iu[t];
  return n ? { error_code: n.error_code, message: n.detail } : {
    error_code: t >= 400 && t < 500 ? y.BAD_REQUEST : y.INTERNAL_SERVER_ERROR,
    message: e
  };
}
function au(t) {
  if (t instanceof W)
    return t.body?.error?.code;
}
function cu(t) {
  return t instanceof DOMException && t.name === "AbortError" ? "Request aborted (timeout)." : t instanceof TypeError && (t.message.includes("fetch") || t.message.includes("network")) ? "Network error." : null;
}
function S(t, e) {
  if (t instanceof W) {
    const { error_code: r, message: s } = ou(t.status, t.message);
    return { error_code: r, status_code: t.status, message: `${e} ${s}` };
  }
  const n = cu(t);
  return n ? {
    error_code: y.NETWORK_ERROR,
    status_code: b.INTERNAL_SERVER_ERROR,
    message: `${e} ${n}`
  } : {
    error_code: y.INTERNAL_SERVER_ERROR,
    status_code: b.INTERNAL_SERVER_ERROR,
    message: `${e} ${t}`
  };
}
class lu {
  constructor(e, n, r) {
    this.transport = e, this.hosts = n, this.allianceClient = r;
  }
  // --- Templates ---
  async getAllTemplates() {
    try {
      const e = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV1}/template`
      });
      return { ...e.data, status_code: e.status };
    } catch (e) {
      return { ...S(e, "Failed to fetch templates,"), items: [] };
    }
  }
  async createTemplate({
    title: e,
    desc: n,
    section_ids: r
  }) {
    try {
      const s = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/template`,
        body: { title: e, desc: n, section_ids: r }
      });
      return { ...s.data, status_code: s.status };
    } catch (s) {
      return { ...S(s, "Failed to create template,") };
    }
  }
  async updateTemplate({
    template_id: e,
    title: n,
    desc: r,
    section_ids: s
  }) {
    try {
      const i = await this.transport.request({
        method: "PATCH",
        url: `${this.hosts.voiceV1}/template/${e}`,
        body: { title: n, desc: r, section_ids: s }
      });
      return { ...i.data, status_code: i.status };
    } catch (i) {
      const o = S(i, "Failed to update template,");
      return { ...o, msg: o.message };
    }
  }
  async deleteTemplate(e) {
    try {
      const n = await this.transport.request({
        method: "DELETE",
        url: `${this.hosts.voiceV1}/template/${e}`
      });
      return { ...n.data, status_code: n.status };
    } catch (n) {
      const r = S(n, "Failed to delete template,");
      return { ...r, msg: r.message };
    }
  }
  async aiGenerateTemplate({
    file: e,
    instruction: n
  }) {
    try {
      const r = n?.trim();
      let s;
      if (e) {
        const o = new FormData();
        o.append("file", e), r && o.append("instruction", r), s = o;
      } else
        s = { instruction: r ?? "" };
      const i = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/template/ai-create-template`,
        body: s,
        timeout: 3e4
      });
      return { ...i.data, status_code: i.status };
    } catch (r) {
      return { ...S(r, "Failed to AI generate template,") };
    }
  }
  async convertToTemplate({
    txn_id: e,
    template_id: n
  }) {
    return this.allianceClient.processTemplate(n, e);
  }
  async convertTranscriptionToTemplate({
    txn_id: e,
    template_id: n,
    transcript: r,
    target_language: s
  }) {
    try {
      const i = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/transaction/${e}/convert-to-template`,
        body: {
          ...r && { transcript: r },
          ...n && { template_id: n },
          ...s && { target_language: s }
        },
        timeout: 6e4
      });
      return { ...i.data, status_code: i.status };
    } catch (i) {
      return { ...S(i, "Failed to convert transcription to template,") };
    }
  }
  // --- Template Sections ---
  async getAllTemplateSections() {
    try {
      const e = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV1}/template/section`
      });
      return { ...e.data, status_code: e.status };
    } catch (e) {
      return { ...S(e, "Failed to fetch template sections,"), items: [] };
    }
  }
  async createTemplateSection({
    title: e,
    desc: n,
    format: r,
    example: s
  }) {
    try {
      const i = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/template/section`,
        body: { title: e, desc: n, format: r, example: s }
      });
      return { ...i.data, status_code: i.status };
    } catch (i) {
      const o = S(i, "Failed to create template section,");
      return { ...o, msg: o.message, section_id: "" };
    }
  }
  async updateTemplateSection({
    section_id: e,
    title: n,
    desc: r,
    format: s,
    example: i
  }) {
    try {
      const o = await this.transport.request({
        method: "PATCH",
        url: `${this.hosts.voiceV1}/template/section/${e}`,
        body: { title: n, desc: r, format: s, example: i }
      });
      return { ...o.data, status_code: o.status };
    } catch (o) {
      const a = S(o, "Failed to update template section,");
      return {
        ...a,
        msg: a.message,
        section_id: e
      };
    }
  }
  async deleteTemplateSection(e) {
    try {
      const n = await this.transport.request({
        method: "DELETE",
        url: `${this.hosts.voiceV1}/template/section/${e}`
      });
      return { ...n.data, status_code: n.status };
    } catch (n) {
      const r = S(n, "Failed to delete template section,");
      return { ...r, msg: r.message, section_id: e };
    }
  }
  // --- Documents ---
  async getDocument({
    documentId: e,
    params: n
  }) {
    try {
      const r = n ? `?${n}` : "", s = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV1}/documents/${e}${r}`
      });
      return { ...s.data, status_code: s.status };
    } catch (r) {
      return { ...S(r, "Failed to fetch document,") };
    }
  }
  async createDocument({
    session_id: e,
    document_name: n,
    type: r,
    document_id: s,
    publish: i
  }) {
    try {
      const o = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/documents`,
        body: {
          session_id: e,
          type: r,
          ...n ? { document_name: n } : {},
          ...s ? { document_id: s } : {},
          ...i ? { publish: i } : {}
        }
      });
      return { ...o.data, status_code: o.status };
    } catch (o) {
      return { ...S(o, "Failed to create document,") };
    }
  }
  async updateDocument({
    session_id: e,
    document_name: n,
    type: r,
    document_id: s,
    publish: i,
    tiptap_json: o,
    params: a
  }) {
    try {
      const c = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/documents${a ? `?${a}` : ""}`,
        body: {
          session_id: e,
          type: r,
          ...n ? { document_name: n } : {},
          ...s ? { document_id: s } : {},
          ...i ? { publish: i } : {},
          ...o ? { tiptap_json: o } : {}
        }
      });
      return { ...c.data, status_code: c.status };
    } catch (c) {
      return { ...S(c, "Failed to update document,") };
    }
  }
  async deleteDocument(e) {
    try {
      const n = await this.transport.request({
        method: "DELETE",
        url: `${this.hosts.voiceV1}/documents/${e}`
      });
      return { ...n.data, status_code: n.status };
    } catch (n) {
      return { ...S(n, "Failed to delete document,") };
    }
  }
  async publishDocument({
    session_id: e,
    document_id: n
  }) {
    try {
      const r = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV1}/sessions/${e}/documents/${n}/publish`,
        body: {}
      });
      return { ...r.data, status_code: r.status };
    } catch (r) {
      return { ...S(r, "Failed to publish document,") };
    }
  }
}
const gr = "https://cdn.eka.care/vagus/cmlf0ip4a00000td1dmth2wk3.png", mr = "https://cdn.eka.care/vagus/cmlf0j9ea00010td1h3mi6zqk.png", xt = "3cm", Rt = "3.5cm";
class uu {
  constructor(e, n, r) {
    this.transport = e, this.hosts = n, this.allianceClient = r;
  }
  // --- Session CRUD ---
  async getSessionHistory({
    txn_count: e,
    oid: n
  }) {
    try {
      const r = `count=${e}${n ? `&oid=${n}` : ""}`, s = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV2}/transaction/history?${r}`
      });
      return {
        data: s.data.data,
        status_code: s.status,
        message: `Past ${e} transactions fetched successfully.`
      };
    } catch (r) {
      return { ...S(r, "Failed to fetch transactions,") };
    }
  }
  async deleteSession({ txn_id: e }) {
    try {
      const n = await this.transport.request({
        method: "DELETE",
        url: `${this.hosts.voiceV2}/transaction/${e}`
      });
      return { ...n.data, status_code: n.status };
    } catch (n) {
      return { ...S(n, "Failed to delete transaction,") };
    }
  }
  async patchSessionStatus(e, n) {
    return this.allianceClient.updateSession(e, n);
  }
  async getSessionDetails({
    session_id: e,
    presigned: n = !1,
    version: r
  }) {
    try {
      const s = new URLSearchParams({ presigned: String(n) });
      r && s.append("version", r);
      const i = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV1}/sessions/${e}?${s.toString()}`
      });
      return { ...i.data, status_code: i.status };
    } catch (s) {
      return { ...S(s, "Failed to fetch session details,") };
    }
  }
  async getSuggestedMedications(e) {
    try {
      const n = await this.transport.request({
        method: "GET",
        url: `${this.hosts.ekaHost}/voice/v1/session/${e}/suggested-medications`
      });
      return { ...n.data, status_code: n.status };
    } catch (n) {
      return { ...S(n, "Failed to fetch suggested medications,") };
    }
  }
  async addSessionContext({
    txn_id: e,
    context: n
  }) {
    try {
      const r = await this.transport.request({
        method: "PATCH",
        url: `${this.hosts.voiceV1}/sessions/${e}/context`,
        body: { context: n }
      });
      return { ...r.data, status_code: r.status };
    } catch (r) {
      return { ...S(r, "Failed to add session context,") };
    }
  }
  async removeSessionContext({
    txn_id: e,
    context: n
  }) {
    try {
      const r = await this.transport.request({
        method: "DELETE",
        url: `${this.hosts.voiceV1}/sessions/${e}/context`,
        body: { context: n }
      });
      return { ...r.data, status_code: r.status };
    } catch (r) {
      return { ...S(r, "Failed to remove session context,") };
    }
  }
  /** @deprecated Backward compatible */
  async updateResultSummary({
    txnId: e,
    data: n
  }) {
    try {
      const r = await this.transport.request({
        method: "PATCH",
        url: `${this.hosts.voiceV3}/status/${e}`,
        body: n,
        timeout: 3e4
      });
      return { ...r.data, status_code: r.status };
    } catch (r) {
      return { ...S(r, "Failed to update result summary,") };
    }
  }
  // --- Config ---
  async getConfig() {
    try {
      const e = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV2}/config/`
      });
      return { ...e.data, status_code: e.status };
    } catch (e) {
      return { ...S(e, "Failed to fetch configurations,") };
    }
  }
  async getConfigMyTemplates() {
    try {
      const e = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV2}/config/?my_templates=true`
      });
      return { ...e.data, status_code: e.status };
    } catch (e) {
      return { ...S(e, "Failed to fetch configurations,") };
    }
  }
  async updateConfig(e) {
    try {
      const n = e.query_params ? `?${e.query_params}` : "", r = await this.transport.request({
        method: "PUT",
        url: `${this.hosts.voiceV2}/config/${n}`,
        body: e
      });
      return { ...r.data, status_code: r.status };
    } catch (n) {
      const r = S(n, "Failed to update config,");
      return { ...r, msg: r.message, request_type: e.request_type, data: {} };
    }
  }
  // --- Profile ---
  async getDoctorHeaderFooter({
    doctor_oid: e,
    clinic_id: n
  }) {
    try {
      const r = await this.transport.request({
        method: "GET",
        url: `${this.hosts.parchiHost}/profile/get/doctorprofile/${e}`
      }), s = r.data, i = s?.profile?.professional?.templates_v2, o = s?.profile?.professional?.default_clinic;
      if (!i || i.length === 0)
        return {
          data: this.getDefaultHeaderFooterInfo(),
          status_code: r.status
        };
      const a = i.filter((c) => c.type === "PRINT");
      if (a.length === 0)
        return {
          data: this.getDefaultHeaderFooterInfo(),
          status_code: r.status
        };
      if (n) {
        const c = a.find((l) => l.clinicId === n);
        if (c)
          return {
            data: this.extractHeaderFooterInfo(c),
            status_code: r.status
          };
      }
      if (o) {
        const c = a.find((l) => l.clinicId === o);
        if (c)
          return {
            data: this.extractHeaderFooterInfo(c),
            status_code: r.status
          };
      }
      return {
        data: this.getDefaultHeaderFooterInfo(),
        status_code: r.status
      };
    } catch (r) {
      return {
        ...S(r, "Failed to fetch doctor header/footer,"),
        data: this.getDefaultHeaderFooterInfo()
      };
    }
  }
  async getDoctorClinics({
    doctor_id: e
  }) {
    try {
      const n = await this.transport.request({
        method: "GET",
        url: `${this.hosts.ekaHost}/dr/v1/business/entities`
      }), r = n.data;
      if (!r?.data?.clinics || r.data.clinics.length === 0)
        return {
          data: null,
          status_code: n.status,
          message: "No clinics found"
        };
      const s = r.data.clinics.filter((i) => i.doctors?.includes(e)).map((i) => ({
        clinic_id: i.clinic_id,
        name: i.name
      }));
      return s.length === 0 ? {
        data: null,
        status_code: n.status,
        message: "No clinics found for this doctor"
      } : {
        data: s,
        status_code: n.status
      };
    } catch (n) {
      return { ...S(n, "Failed to fetch doctor clinics,"), data: null };
    }
  }
  // --- Alliance SDK methods ---
  async createSession(e, n) {
    return this.allianceClient.createSession(e, n);
  }
  async endSession(e, n) {
    return this.allianceClient.endSession(e, n);
  }
  getDiscoveryDocument() {
    return this.allianceClient.getDiscoveryDocument();
  }
  getDiscoveryConfig() {
    return this.allianceClient.getDiscoveryConfig();
  }
  async refreshDiscovery() {
    return this.allianceClient.refreshDiscovery();
  }
  // --- Private helpers ---
  getDefaultHeaderFooterInfo() {
    return {
      _id: null,
      clinic_id: null,
      doctor_id: null,
      type: null,
      header_img: gr,
      header_height: xt,
      header_top_margin: null,
      footer_img: mr,
      footer_height: Rt,
      margin_left: null,
      margin_right: null,
      page_size: null,
      show_eka_logo: null,
      show_name_in_signature: null,
      show_not_valid_for_medical_legal_purpose_message: null,
      show_page_number: null,
      show_prescription_id: null,
      show_signature: null
    };
  }
  extractHeaderFooterInfo(e) {
    return {
      _id: e._id || null,
      clinic_id: e.clinicId || null,
      doctor_id: e.docid || null,
      type: e.type || null,
      header_img: e.header_img || gr,
      header_height: e.header_img && e.header_height || xt,
      header_top_margin: e.header_top_margin || null,
      footer_img: e.footer_img || mr,
      footer_height: e.footer_img && e.footer_height || Rt,
      margin_left: e.margin_left || null,
      margin_right: e.margin_right || null,
      page_size: e.page_size || null,
      show_eka_logo: e.show_eka_logo ?? null,
      show_name_in_signature: e.show_name_in_signature ?? null,
      show_not_valid_for_medical_legal_purpose_message: e.show_not_valid_for_medical_legal_purpose_message ?? null,
      show_page_number: e.show_page_number ?? null,
      show_prescription_id: e.show_prescription_id ?? null,
      show_signature: e.show_signature ?? null
    };
  }
}
function ee(t, e, n) {
  return {
    error_code: du(t, e),
    status_code: t.httpStatus ?? b.INTERNAL_SERVER_ERROR,
    message: t.message || n
  };
}
function ne(t) {
  return t.httpStatus ?? b.SUCCESS;
}
function _r(t) {
  return t.success ? ne(t) : t.error.httpStatus ?? b.INTERNAL_SERVER_ERROR;
}
function du(t, e) {
  return t.code === "txn_limit_exceeded" ? y.TXN_LIMIT_EXCEEDED : t.httpStatus === b.UNAUTHORIZED ? y.UNAUTHORIZED : t.httpStatus === b.FORBIDDEN ? y.FORBIDDEN : e;
}
class pu {
  constructor(e, n, r, s) {
    this.allianceClient = e, this.transport = n, this.hosts = r, this.tracker = s, this.txnID = "", this.storedSession = null, this.sessionEnded = !1;
  }
  get transactionId() {
    return this.txnID;
  }
  get currentSession() {
    return this.storedSession;
  }
  /** Uniform response for audio files that could not be uploaded. */
  failedUploadResponse(e) {
    return {
      error_code: y.AUDIO_UPLOAD_FAILED,
      status_code: b.AUDIO_ERROR,
      message: `${e.length} audio file(s) failed to upload.`,
      failed_files: e
    };
  }
  /** Adopt a newly created session and clear any previous session's end state. */
  beginSession(e) {
    this.storedSession = e, this.txnID = e.session_id, this.sessionEnded = !1, this.endedAudioFiles = void 0, this.tracker.setTransactionId(this.txnID);
  }
  // Backward compatible
  async initTransaction(e) {
    try {
      this.allianceClient.clearRecordingState(), this.tracker.addBreadcrumb("recording", "initTransaction", { txn_id: e.txn_id });
      const n = {
        templates: e.output_format_template.map((s) => s.template_id),
        model: e.model_type,
        language_hint: e.input_language,
        ...e.output_language ? { transcript_language: e.output_language } : {},
        upload_type: e.transfer || "chunked",
        communication_protocol: "http",
        session_mode: e.mode,
        session_id: e.txn_id,
        ...e.patient_details ? {
          patient_details: {
            name: e.patient_details.username,
            age: String(e.patient_details.age),
            gender: e.patient_details.biologicalSex,
            mobile: e.patient_details.mobile ? Number(e.patient_details.mobile) : void 0
          }
        } : {},
        additional_data: {
          system_info: e.system_info,
          auto_download: e.auto_download,
          model_training_consent: e.model_training_consent,
          version: e.version,
          encounter_id: e.encounter_id,
          ...e.additional_data || {}
        }
      }, r = await this.allianceClient.createSession(
        n,
        e.api_version
      );
      return r.success ? (this.beginSession(r.data), this.tracker.captureEvent("Session started", {
        txn_id: this.txnID,
        status_code: ne(r)
      }), {
        status_code: ne(r),
        message: "Transaction initialized successfully.",
        txn_id: r.data.session_id
      }) : ee(
        r.error,
        y.TXN_INIT_FAILED,
        "Transaction initialization failed."
      );
    } catch (n) {
      return {
        error_code: y.TXN_INIT_FAILED,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to initialize transaction. ${n}`
      };
    }
  }
  async startRecordingV2(e) {
    try {
      this.allianceClient.clearRecordingState(), this.tracker.addBreadcrumb("recording", "startRecordingV2", {
        sessionId: e.sessionId
      });
      const n = await this.allianceClient.startRecording(e);
      return n.success ? (this.beginSession(n.data), this.tracker.captureEvent("Session started (v2)", {
        txn_id: this.txnID,
        status_code: ne(n)
      }), {
        status_code: ne(n),
        message: "Recording started successfully.",
        txn_id: n.data.session_id
      }) : ee(
        n.error,
        y.TXN_INIT_FAILED,
        "Failed to start recording."
      );
    } catch (n) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to start recording. ${n}`
      };
    }
  }
  // Backward compatible - ideally it should call startRecording() of Alliance SDK directly
  async startRecording(e) {
    try {
      if (!this.storedSession)
        return {
          error_code: y.TXN_STATUS_MISMATCH,
          status_code: b.TXN_ERROR,
          message: "Transaction not initialized. Call initTransaction() first."
        };
      this.allianceClient.clearRecordingState();
      const n = await this.allianceClient.startRecordingWithSession(
        this.storedSession,
        {
          uploadType: "chunked",
          deviceId: e
        }
      );
      return n.success ? (this.sessionEnded = !1, this.endedAudioFiles = void 0, {
        status_code: b.SUCCESS,
        message: "Recording started successfully.",
        txn_id: this.txnID
      }) : ee(
        n.error,
        y.START_RECORDING_FAILED,
        "Failed to start recording."
      );
    } catch (n) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to start recording. ${n}`
      };
    }
  }
  async startRecordingForExistingSession(e) {
    try {
      this.allianceClient.clearRecordingState();
      const n = {
        session_id: e.txn_id,
        status: Ms.CREATED,
        created_at: new Date(e.created_at * 1e3).toISOString(),
        expires_at: e.expires_at,
        upload_url: e.upload_url
      }, r = await this.allianceClient.startRecordingWithSession(
        n,
        {
          uploadType: "chunked",
          deviceId: e.microphoneID,
          version: e.version
        }
      );
      return r.success ? (this.beginSession(n), {
        status_code: b.SUCCESS,
        message: "Recording started for existing session.",
        txn_id: this.txnID
      }) : ee(
        r.error,
        y.START_RECORDING_FAILED,
        "Failed to start recording for existing session."
      );
    } catch (n) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to start recording for existing session. ${n}`
      };
    }
  }
  pauseRecording() {
    try {
      return this.allianceClient.pauseRecording(), {
        status_code: b.SUCCESS,
        message: "Recording paused.",
        is_paused: this.allianceClient.isRecordingPaused()
      };
    } catch (e) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to pause recording. ${e}`
      };
    }
  }
  forceAllowMoreChunks() {
    this.allianceClient.forceAllowMoreChunks();
  }
  resumeRecording() {
    try {
      return this.allianceClient.resumeRecording(), {
        status_code: b.SUCCESS,
        message: "Recording resumed.",
        is_paused: this.allianceClient.isRecordingPaused()
      };
    } catch (e) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to resume recording. ${e}`
      };
    }
  }
  async endRecording() {
    try {
      if (this.tracker.addBreadcrumb("recording", "endRecording", { txn_id: this.txnID }), !this.allianceClient.isRecording())
        return this.sessionEnded ? {
          status_code: b.SUCCESS,
          message: "Recording already ended.",
          total_audio_files: this.endedAudioFiles
        } : {
          error_code: y.TXN_STATUS_MISMATCH,
          status_code: b.TXN_ERROR,
          message: "No active recording to end. Call startRecording() first."
        };
      const e = await this.allianceClient.endRecording();
      return e.success ? (this.tracker.captureEvent("Session ended", {
        txn_id: this.txnID,
        total_files: e.data.totalFiles,
        failed_files: e.data.failedUploads.length,
        session_ended: e.data.sessionEnded
      }), e.data.failedUploads.length > 0 ? {
        error_code: y.AUDIO_UPLOAD_FAILED,
        status_code: b.AUDIO_ERROR,
        message: `Recording ended but ${e.data.failedUploads.length} audio file(s) failed to upload.`,
        failed_files: e.data.failedUploads,
        total_audio_files: e.data.endSessionResponse?.audio_files
      } : e.data.sessionEnded ? (this.storedSession = null, this.sessionEnded = !0, this.endedAudioFiles = e.data.endSessionResponse?.audio_files, {
        status_code: ne(e),
        message: "Recording ended successfully.",
        total_audio_files: this.endedAudioFiles
      }) : {
        error_code: y.END_RECORDING_FAILED,
        status_code: e.httpStatus ?? b.INTERNAL_SERVER_ERROR,
        message: "Recording stopped but the session could not be finalized."
      }) : (this.tracker.captureEvent("Session end failed", {
        txn_id: this.txnID,
        error: e.error.message
      }), ee(
        e.error,
        y.END_RECORDING_FAILED,
        "Failed to end recording."
      ));
    } catch (e) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to end recording. ${e}`
      };
    }
  }
  async getSessionStatus(e, n) {
    const r = e || this.txnID;
    if (!r)
      return {
        success: !1,
        status_code: b.TXN_ERROR,
        error: new yn(
          "No session ID available. Call initTransaction() first or pass a sessionId.",
          y.TXN_STATUS_MISMATCH
        )
      };
    const s = await this.allianceClient.getSessionStatus(r, n);
    return {
      ...s,
      status_code: _r(s)
    };
  }
  async retryUploadRecording() {
    try {
      const e = await this.allianceClient.retryFailedUploads();
      if (!e.success)
        return e.error instanceof Fs ? this.failedUploadResponse(e.error.failedFiles) : ee(
          e.error,
          y.AUDIO_UPLOAD_FAILED,
          "Retry upload failed."
        );
      const { retried: n, succeeded: r, stillFailed: s } = e.data;
      return s.length > 0 ? this.failedUploadResponse(s) : {
        status_code: b.SUCCESS,
        message: `Retried ${n} files. ${r} succeeded.`
      };
    } catch (e) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to retry upload. ${e}`
      };
    }
  }
  async cancelSession(e) {
    const n = e || this.txnID;
    if (!n)
      return {
        success: !1,
        status_code: b.TXN_ERROR,
        error: new yn(
          "No session ID available. Call initTransaction() first or pass a sessionId.",
          y.TXN_STATUS_MISMATCH
        )
      };
    const r = await this.allianceClient.cancelSession(n);
    return this.storedSession = null, this.txnID = "", this.sessionEnded = !1, this.endedAudioFiles = void 0, {
      ...r,
      status_code: _r(r)
    };
  }
  async processPreRecordedAudio({
    upload: e,
    audioFile: n,
    audioFileName: r = "audio_1.mp3"
  }) {
    try {
      const s = await this.allianceClient.uploadAudioFile(n, r, e);
      return s.success ? {
        status_code: ne(s),
        message: "Audio file uploaded successfully."
      } : ee(
        s.error,
        y.AUDIO_UPLOAD_FAILED,
        "Audio upload failed."
      );
    } catch (s) {
      return {
        error_code: y.INTERNAL_SERVER_ERROR,
        status_code: b.INTERNAL_SERVER_ERROR,
        message: `Failed to upload audio file. ${s}`
      };
    }
  }
  async commitTransactionCall() {
    try {
      if (!this.txnID)
        return {
          error_code: y.TXN_STATUS_MISMATCH,
          status_code: b.TXN_ERROR,
          message: "Transaction not initialized."
        };
      const e = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV2}/transaction/commit/${this.txnID}`,
        body: { audio_files: [] }
      });
      return {
        status_code: e.status,
        message: e.data.message || "Transaction committed successfully."
      };
    } catch (e) {
      return S(e, "Failed to commit transaction,");
    }
  }
  async stopTransactionCall() {
    try {
      if (!this.txnID)
        return {
          error_code: y.TXN_STATUS_MISMATCH,
          status_code: b.TXN_ERROR,
          message: "Transaction not initialized."
        };
      const e = await this.transport.request({
        method: "POST",
        url: `${this.hosts.voiceV2}/transaction/stop/${this.txnID}`,
        body: { audio_files: [] }
      });
      return {
        status_code: e.status,
        message: e.data.message || "Transaction stopped."
      };
    } catch (e) {
      return S(e, "Failed to stop transaction,");
    }
  }
  async reset() {
    await this.allianceClient.reset(), this.txnID = "", this.storedSession = null, this.sessionEnded = !1, this.endedAudioFiles = void 0;
  }
}
const yr = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}, hu = (t) => {
  try {
    const e = atob(t), n = new Uint8Array(e.length);
    for (let s = 0; s < e.length; s++)
      n[s] = e.charCodeAt(s);
    return new TextDecoder("utf-8").decode(n);
  } catch (e) {
    return console.error("Error decoding base64 string:", e), "";
  }
}, fu = (t, e) => {
  if (!e || e.trim() === "") return null;
  const n = hu(e);
  switch (t) {
    case Ke.JSON:
      return yr(n);
    case Ke.TRANSCRIPT:
    case Ke.MARKDOWN:
      return n;
    default:
      return yr(n);
  }
}, Be = (t) => t?.length ? t.map((e) => {
  const { value: n } = e;
  return typeof n != "string" ? { ...e, value: n ?? null } : {
    ...e,
    value: fu(e.type, n)
  };
}) : [];
class gu {
  constructor(e, n) {
    this.transport = e, this.hosts = n;
  }
  async getTemplateOutput({ txn_id: e }) {
    try {
      return await this.fetchV3Status(e);
    } catch (n) {
      return { ...S(n, "Failed to fetch output templates,") };
    }
  }
  async getOutputTranscription({ txn_id: e }) {
    try {
      return await this.fetchV3Status(e, "transcript=true", 15e3);
    } catch (n) {
      return { ...S(n, "Failed to fetch output transcription,") };
    }
  }
  async getChunkTranscript(e, n) {
    try {
      return { success: !0, data: (await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV3}/transcript/${e}/${n}`,
        timeout: 1e4
      })).data };
    } catch (r) {
      const s = S(r, "Failed to fetch chunk transcript,");
      return { success: !1, error: au(r) ?? s.error_code };
    }
  }
  async pollSessionOutput(e) {
    const {
      txn_id: n,
      max_polling_time: r = 120 * 1e3,
      template_id: s,
      document_id: i,
      dlp: o,
      onPartialResultCb: a
    } = e, c = (l, d, u, p) => (a?.({
      txn_id: n,
      response: d ?? null,
      status_code: l,
      message: u,
      poll_status: p
    }), {
      response: d ?? null,
      status_code: l,
      errorMessage: p === "success" || p === "in-progress" ? void 0 : u
    });
    try {
      const l = Date.now() + r;
      let d = 0;
      a?.({
        txn_id: n,
        response: null,
        status_code: 202,
        message: "Polling for session output summary started",
        poll_status: "in-progress"
      });
      const u = () => {
        const h = [];
        return s && h.push(`template_id=${s}`), i && h.push(`document_id=${i}`), o && h.push("dlp=true"), h.join("&");
      }, p = async () => {
        try {
          const h = u(), f = await this.fetchV3Status(n, h, 2e4), { status_code: k, response: N } = f;
          if (Date.now() >= l)
            return c(500, null, "Timeout while fetching analysis results.", "timeout");
          if (k === 401 || k === 403)
            return c(
              k,
              N ?? null,
              "Unauthorized or Forbidden",
              "failed"
            );
          if (k === 202 || k === 400 || k >= 500) {
            if (k === 202 && N && a?.({
              txn_id: n,
              response: N,
              status_code: k,
              message: "Partial result received",
              poll_status: "in-progress"
            }), k >= 400) {
              if (d++, d >= 3)
                return c(
                  k,
                  null,
                  N?.error?.message || f.message || "Backend error while fetching results.",
                  "failed"
                );
            } else
              d = 0;
            return await new Promise((A) => setTimeout(A, 1e3)), p();
          }
          return c(
            k,
            N ?? null,
            "Template results generated successfully.",
            "success"
          );
        } catch (h) {
          return c(-1, null, `Polling error: ${h}`, "failed");
        }
      };
      return p();
    } catch (l) {
      return { response: null, status_code: -1, errorMessage: `Polling failed: ${l}` };
    }
  }
  async fetchV3Status(e, n, r = 2e4) {
    try {
      const s = `${this.hosts.voiceV3}/status/${e}${n ? `?${n}` : ""}`, i = await this.transport.request({
        method: "GET",
        url: s,
        timeout: r
      });
      return {
        response: this.decodeStatusResponse(i.data),
        status_code: i.status
      };
    } catch (s) {
      return { ...S(s, "Failed to fetch status,") };
    }
  }
  decodeStatusResponse(e) {
    if (!e?.data) return e;
    const { data: n } = e;
    return {
      ...e,
      data: {
        ...n,
        output: Be(n.output),
        template_results: {
          ...n.template_results ?? {},
          integration: Be(n.template_results?.integration),
          custom: Be(n.template_results?.custom),
          transcript: Be(n.template_results?.transcript)
        }
      }
    };
  }
}
const mu = 5e3;
class _u {
  constructor(e, n) {
    this.transport = e, this.hosts = n, this.microphoneStream = null;
  }
  async runCompatibilityTest(e) {
    const n = [], r = [
      this.checkInternetConnectivity,
      this.checkSystemInfo,
      this.checkMicrophonePermission,
      this.checkSharedWorkerSupport,
      this.checkNetworkAndApiAccess
    ];
    try {
      for (const s of r) {
        const i = await s.call(this);
        n.push(i), e(i);
      }
      return this.createSummary(n);
    } catch (s) {
      return console.error("Error in runCompatibilityTest:", s), this.createSummary(n);
    } finally {
      this.cleanup();
    }
  }
  cleanup() {
    try {
      this.microphoneStream && (this.microphoneStream.getTracks().forEach((e) => e.stop()), this.microphoneStream = null);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
  }
  // --- Test 1: Internet Connectivity ---
  async checkInternetConnectivity() {
    const e = Date.now(), n = te.INTERNET_CONNECTIVITY;
    try {
      if (!navigator.onLine)
        return this.createTestResult(
          n,
          v.ERROR,
          "No internet connection detected",
          { isOnline: !1 }
        );
      const r = new AbortController(), s = setTimeout(() => r.abort(), mu);
      try {
        await fetch("https://www.google.com/favicon.ico", {
          mode: "no-cors",
          cache: "no-cache",
          signal: r.signal
        }), clearTimeout(s);
        const i = Date.now() - e;
        return this.createTestResult(
          n,
          v.SUCCESS,
          "Internet connection is working properly.",
          { isOnline: !0, pingTime: i }
        );
      } catch (i) {
        return clearTimeout(s), this.createTestResult(
          n,
          v.ERROR,
          "Unable to reach internet",
          { isOnline: !1 },
          i instanceof Error ? i.message : "Fetch failed"
        );
      }
    } catch (r) {
      return this.createTestResult(
        n,
        v.ERROR,
        "Error checking internet connectivity",
        { isOnline: !1 },
        r instanceof Error ? r.message : "Unknown error"
      );
    }
  }
  // --- Test 2: System Info ---
  async checkSystemInfo() {
    const e = te.SYSTEM_INFO;
    try {
      const { browser: n, version: r } = this.detectBrowser(), s = navigator.deviceMemory, i = Intl.DateTimeFormat().resolvedOptions().timeZone, a = (/* @__PURE__ */ new Date()).toISOString(), c = await this.validateTimezone();
      return c ? this.createTestResult(e, v.ERROR, c, {
        browser: n,
        version: r,
        ram: s,
        timezone: i,
        systemTime: a
      }) : this.createTestResult(
        e,
        v.SUCCESS,
        "Your browser and device meet the required specifications.",
        { browser: n, version: r, ram: s, timezone: i, systemTime: a }
      );
    } catch (n) {
      return this.createTestResult(
        e,
        v.ERROR,
        "Error collecting system information",
        void 0,
        n instanceof Error ? n.message : "Unknown error"
      );
    }
  }
  async validateTimezone() {
    try {
      const e = Intl.DateTimeFormat().resolvedOptions().timeZone, n = await this.transport.request({
        method: "GET",
        url: `${this.hosts.voiceV2}/config/?timezone=${e}`
      });
      if (n.status >= 400)
        return "Failed to validate timezone against system time";
      const r = n.data.current_time_utc;
      if (!r)
        return "Failed to validate timezone against system time";
      const s = new Date(r), i = /* @__PURE__ */ new Date(), o = Math.abs(s.getTime() - i.getTime()), a = 600 * 1e3;
      return o > a ? `System time is invalid. It differs from server time by ${Math.round(o / 6e4)} minutes.` : null;
    } catch {
      return "Failed to validate timezone against system time";
    }
  }
  detectBrowser() {
    const e = navigator.userAgent, n = [
      { name: "Firefox", pattern: /Firefox\/(\d+\.\d+)/ },
      { name: "Opera", pattern: /(?:Opera|OPR)\/(\d+\.\d+)/ },
      { name: "Internet Explorer", pattern: /rv:(\d+\.\d+)/, check: () => e.includes("Trident") },
      { name: "Edge", pattern: /(?:Edge|Edg)\/(\d+\.\d+)/ },
      { name: "Chrome", pattern: /Chrome\/(\d+\.\d+)/ },
      {
        name: "Safari",
        pattern: /Version\/(\d+\.\d+)/,
        check: () => e.includes("Safari") && !e.includes("Chrome")
      }
    ];
    for (const { name: r, pattern: s, check: i } of n)
      if (i ? i() : e.includes(r) || s.test(e)) {
        const o = e.match(s);
        return { browser: r, version: o?.[1] || "Unknown" };
      }
    return { browser: "Unknown", version: "Unknown" };
  }
  // --- Test 3: Microphone Permission ---
  async checkMicrophonePermission() {
    const e = te.MICROPHONE;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        return this.createTestResult(
          e,
          v.ERROR,
          "getUserMedia is not supported in this browser",
          { permission: "denied" }
        );
      try {
        const n = await navigator.mediaDevices.getUserMedia({ audio: !0 }), r = n.getAudioTracks()[0]?.getSettings()?.deviceId;
        return n.getTracks().forEach((s) => s.stop()), this.createTestResult(
          e,
          v.SUCCESS,
          "Microphone access is enabled and working.",
          { permission: "granted", deviceId: r }
        );
      } catch (n) {
        return this.handleMicrophoneError(n);
      }
    } catch (n) {
      return this.createTestResult(
        e,
        v.ERROR,
        "Error checking microphone permission",
        { permission: "denied" },
        n instanceof Error ? n.message : "Unknown error"
      );
    }
  }
  handleMicrophoneError(e) {
    const n = te.MICROPHONE, r = {
      NotAllowedError: { message: "Microphone permission denied", permission: "denied" },
      PermissionDeniedError: { message: "Microphone permission denied", permission: "denied" },
      NotFoundError: { message: "No microphone found", permission: "denied" }
    }, s = e instanceof DOMException ? e.name : "", i = e instanceof Error ? e.message : String(e), o = r[s] || {
      message: "Error accessing microphone",
      permission: "prompt"
    };
    return this.createTestResult(
      n,
      v.ERROR,
      o.message,
      { permission: o.permission },
      i
    );
  }
  // --- Test 4: Shared Worker Support ---
  async checkSharedWorkerSupport() {
    const e = te.SHARED_WORKER;
    try {
      return this.createTestResult(
        e,
        v.SUCCESS,
        "Your browser supports smooth background performance.",
        { supported: !0 }
      );
    } catch (n) {
      return this.createTestResult(
        e,
        v.ERROR,
        "Error checking SharedWorker support",
        { supported: !1 },
        n instanceof Error ? n.message : "Unknown error"
      );
    }
  }
  // --- Test 5: Network & API Access (ping-only) ---
  async checkNetworkAndApiAccess() {
    const e = Date.now(), n = te.NETWORK_API;
    try {
      const r = await this.pingApi(), s = Date.now() - e;
      return r ? this.createTestResult(
        n,
        v.SUCCESS,
        "Secure network access is confirmed.",
        { pingSuccess: !0, responseTime: s }
      ) : this.createTestResult(
        n,
        v.ERROR,
        "Unable to access API",
        { pingSuccess: !1, responseTime: s }
      );
    } catch (r) {
      const s = Date.now() - e;
      return this.createTestResult(
        n,
        v.ERROR,
        "Error checking network and API access",
        { pingSuccess: !1, responseTime: s },
        r instanceof Error ? r.message : "Unknown error"
      );
    }
  }
  async pingApi() {
    try {
      const e = await this.transport.request({
        method: "GET",
        url: `${this.hosts.ekaHost}/voice/ping`
      });
      return e.status >= 200 && e.status < 400;
    } catch (e) {
      return console.error("Ping failed:", e), !1;
    }
  }
  // --- Helpers ---
  createTestResult(e, n, r, s, i) {
    const o = {
      test_type: e,
      status: n,
      message: r,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return s && (o.data = s), i && (o.error = i), o;
  }
  createSummary(e) {
    let n = 0, r = 0, s = 0;
    for (const i of e)
      i.status === v.SUCCESS ? n++ : i.status === v.ERROR ? r++ : i.status === v.WARNING && s++;
    return {
      allPassed: n === e.length,
      results: e,
      totalTests: e.length,
      passedTests: n,
      failedTests: r,
      warningTests: s
    };
  }
}
function ln() {
  return { async: !1, breaks: !1, extensions: null, gfm: !0, hooks: null, pedantic: !1, renderer: null, silent: !1, tokenizer: null, walkTokens: null };
}
var ue = ln();
function xs(t) {
  ue = t;
}
var se = { exec: () => null };
function pe(t) {
  let e = [];
  return (n) => {
    let r = Math.max(0, Math.min(3, n - 1)), s = e[r];
    return s || (s = t(r), e[r] = s), s;
  };
}
function E(t, e = "") {
  let n = typeof t == "string" ? t : t.source, r = { replace: (s, i) => {
    let o = typeof i == "string" ? i : i.source;
    return o = o.replace(I.caret, "$1"), n = n.replace(s, o), r;
  }, getRegex: () => new RegExp(n, e) };
  return r;
}
var yu = ((t = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + t);
  } catch {
    return !1;
  }
})(), I = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (t) => new RegExp(`^( {0,3}${t})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: pe((t) => new RegExp(`^ {0,${t}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: pe((t) => new RegExp(`^ {0,${t}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: pe((t) => new RegExp(`^ {0,${t}}(?:\`\`\`|~~~)`)), headingBeginRegex: pe((t) => new RegExp(`^ {0,${t}}#`)), htmlBeginRegex: pe((t) => new RegExp(`^ {0,${t}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: pe((t) => new RegExp(`^ {0,${t}}>`)) }, Eu = /^(?:[ \t]*(?:\n|$))+/, bu = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, Su = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, Le = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, ku = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, un = / {0,3}(?:[*+-]|\d{1,9}[.)])/, Rs = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, ws = E(Rs).replace(/bull/g, un).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), xu = E(Rs).replace(/bull/g, un).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), dn = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/, Ru = /^[^\n]+/, pn = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, wu = E(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", pn).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), Tu = E(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, un).getRegex(), dt = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", hn = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, vu = E("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", hn).replace("tag", dt).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), Ts = E(dn).replace("hr", Le).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", dt).getRegex(), Iu = E(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", Ts).getRegex(), fn = { blockquote: Iu, code: bu, def: wu, fences: Su, heading: ku, hr: Le, html: vu, lheading: ws, list: Tu, newline: Eu, paragraph: Ts, table: se, text: Ru }, Er = E("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", Le).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", dt).getRegex(), Cu = { ...fn, lheading: xu, table: Er, paragraph: E(dn).replace("hr", Le).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", Er).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", dt).getRegex() }, Au = { ...fn, html: E(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", hn).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: se, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: E(dn).replace("hr", Le).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ws).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() }, Du = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, Nu = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, vs = /^( {2,}|\\)\n(?!\s*$)/, Ou = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, Se = /[\p{P}\p{S}]/u, pt = /[\s\p{P}\p{S}]/u, gn = /[^\s\p{P}\p{S}]/u, $u = E(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, pt).getRegex(), Is = /(?!~)[\p{P}\p{S}]/u, Pu = /(?!~)[\s\p{P}\p{S}]/u, Lu = /(?:[^\s\p{P}\p{S}]|~)/u, Mu = E(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", yu ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), Cs = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, Fu = E(Cs, "u").replace(/punct/g, Se).getRegex(), Uu = E(Cs, "u").replace(/punct/g, Is).getRegex(), As = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", Bu = E(As, "gu").replace(/notPunctSpace/g, gn).replace(/punctSpace/g, pt).replace(/punct/g, Se).getRegex(), Hu = E(As, "gu").replace(/notPunctSpace/g, Lu).replace(/punctSpace/g, Pu).replace(/punct/g, Is).getRegex(), zu = E("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, gn).replace(/punctSpace/g, pt).replace(/punct/g, Se).getRegex(), ju = E(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, Se).getRegex(), qu = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", Gu = E(qu, "gu").replace(/notPunctSpace/g, gn).replace(/punctSpace/g, pt).replace(/punct/g, Se).getRegex(), Vu = E(/\\(punct)/, "gu").replace(/punct/g, Se).getRegex(), Wu = E(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), Xu = E(hn).replace("(?:-->|$)", "-->").getRegex(), Ku = E("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Xu).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), Qe = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/, Yu = E(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", Qe).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), Ds = E(/^!?\[(label)\]\[(ref)\]/).replace("label", Qe).replace("ref", pn).getRegex(), Ns = E(/^!?\[(ref)\](?:\[\])?/).replace("ref", pn).getRegex(), Zu = E("reflink|nolink(?!\\()", "g").replace("reflink", Ds).replace("nolink", Ns).getRegex(), br = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, mn = { _backpedal: se, anyPunctuation: Vu, autolink: Wu, blockSkip: Mu, br: vs, code: Nu, del: se, delLDelim: se, delRDelim: se, emStrongLDelim: Fu, emStrongRDelimAst: Bu, emStrongRDelimUnd: zu, escape: Du, link: Yu, nolink: Ns, punctuation: $u, reflink: Ds, reflinkSearch: Zu, tag: Ku, text: Ou, url: se }, Ju = { ...mn, link: E(/^!?\[(label)\]\((.*?)\)/).replace("label", Qe).getRegex(), reflink: E(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", Qe).getRegex() }, jt = { ...mn, emStrongRDelimAst: Hu, emStrongLDelim: Uu, delLDelim: ju, delRDelim: Gu, url: E(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", br).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: E(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", br).getRegex() }, Qu = { ...jt, br: E(vs).replace("{2,}", "*").getRegex(), text: E(jt.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() }, He = { normal: fn, gfm: Cu, pedantic: Au }, we = { normal: mn, gfm: jt, breaks: Qu, pedantic: Ju }, ed = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }, Sr = (t) => ed[t];
function U(t, e) {
  if (e) {
    if (I.escapeTest.test(t)) return t.replace(I.escapeReplace, Sr);
  } else if (I.escapeTestNoEncode.test(t)) return t.replace(I.escapeReplaceNoEncode, Sr);
  return t;
}
function kr(t) {
  try {
    t = encodeURI(t).replace(I.percentDecode, "%");
  } catch {
    return null;
  }
  return t;
}
function xr(t, e) {
  let n = t.replace(I.findPipe, (i, o, a) => {
    let c = !1, l = o;
    for (; --l >= 0 && a[l] === "\\"; ) c = !c;
    return c ? "|" : " |";
  }), r = n.split(I.splitPipe), s = 0;
  if (r[0].trim() || r.shift(), r.length > 0 && !r.at(-1)?.trim() && r.pop(), e) if (r.length > e) r.splice(e);
  else for (; r.length < e; ) r.push("");
  for (; s < r.length; s++) r[s] = r[s].trim().replace(I.slashPipe, "|");
  return r;
}
function V(t, e, n) {
  let r = t.length;
  if (r === 0) return "";
  let s = 0;
  for (; s < r && t.charAt(r - s - 1) === e; )
    s++;
  return t.slice(0, r - s);
}
function Rr(t) {
  let e = t.split(`
`), n = e.length - 1;
  for (; n >= 0 && I.blankLine.test(e[n]); ) n--;
  return e.length - n <= 2 ? t : e.slice(0, n + 1).join(`
`);
}
function td(t, e) {
  if (t.indexOf(e[1]) === -1) return -1;
  let n = 0;
  for (let r = 0; r < t.length; r++) if (t[r] === "\\") r++;
  else if (t[r] === e[0]) n++;
  else if (t[r] === e[1] && (n--, n < 0)) return r;
  return n > 0 ? -2 : -1;
}
function nd(t, e = 0) {
  let n = e, r = "";
  for (let s of t) if (s === "	") {
    let i = 4 - n % 4;
    r += " ".repeat(i), n += i;
  } else r += s, n++;
  return r;
}
function wr(t, e, n, r, s) {
  let i = e.href, o = e.title || null, a = t[1].replace(s.other.outputLinkReplace, "$1");
  r.state.inLink = !0;
  let c = { type: t[0].charAt(0) === "!" ? "image" : "link", raw: n, href: i, title: o, text: a, tokens: r.inlineTokens(a) };
  return r.state.inLink = !1, c;
}
function rd(t, e, n) {
  let r = t.match(n.other.indentCodeCompensation);
  if (r === null) return e;
  let s = r[1];
  return e.split(`
`).map((i) => {
    let o = i.match(n.other.beginningSpace);
    if (o === null) return i;
    let [a] = o;
    return a.length >= s.length ? i.slice(s.length) : i;
  }).join(`
`);
}
var et = class {
  constructor(t) {
    w(this, "options");
    w(this, "rules");
    w(this, "lexer");
    this.options = t || ue;
  }
  space(t) {
    let e = this.rules.block.newline.exec(t);
    if (e && e[0].length > 0) return { type: "space", raw: e[0] };
  }
  code(t) {
    let e = this.rules.block.code.exec(t);
    if (e) {
      let n = this.options.pedantic ? e[0] : Rr(e[0]), r = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: r };
    }
  }
  fences(t) {
    let e = this.rules.block.fences.exec(t);
    if (e) {
      let n = e[0], r = rd(n, e[3] || "", this.rules);
      return { type: "code", raw: n, lang: e[2] ? e[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : e[2], text: r };
    }
  }
  heading(t) {
    let e = this.rules.block.heading.exec(t);
    if (e) {
      let n = e[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let r = V(n, "#");
        (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
      }
      return { type: "heading", raw: V(e[0], `
`), depth: e[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(t) {
    let e = this.rules.block.hr.exec(t);
    if (e) return { type: "hr", raw: V(e[0], `
`) };
  }
  blockquote(t) {
    let e = this.rules.block.blockquote.exec(t);
    if (e) {
      let n = V(e[0], `
`).split(`
`), r = "", s = "", i = [];
      for (; n.length > 0; ) {
        let o = !1, a = [], c;
        for (c = 0; c < n.length; c++) if (this.rules.other.blockquoteStart.test(n[c])) a.push(n[c]), o = !0;
        else if (!o) a.push(n[c]);
        else break;
        n = n.slice(c);
        let l = a.join(`
`), d = l.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        r = r ? `${r}
${l}` : l, s = s ? `${s}
${d}` : d;
        let u = this.lexer.state.top;
        if (this.lexer.state.top = !0, this.lexer.blockTokens(d, i, !0), this.lexer.state.top = u, n.length === 0) break;
        let p = i.at(-1);
        if (p?.type === "code") break;
        if (p?.type === "blockquote") {
          let h = p, f = h.raw + `
` + n.join(`
`), k = this.blockquote(f);
          i[i.length - 1] = k, r = r.substring(0, r.length - h.raw.length) + k.raw, s = s.substring(0, s.length - h.text.length) + k.text;
          break;
        } else if (p?.type === "list") {
          let h = p, f = h.raw + `
` + n.join(`
`), k = this.list(f);
          i[i.length - 1] = k, r = r.substring(0, r.length - p.raw.length) + k.raw, s = s.substring(0, s.length - h.raw.length) + k.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: r, tokens: i, text: s };
    }
  }
  list(t) {
    let e = this.rules.block.list.exec(t);
    if (e) {
      let n = e[1].trim(), r = n.length > 1, s = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: !1, items: [] };
      n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
      let i = this.rules.other.listItemRegex(n), o = !1;
      for (; t; ) {
        let c = !1, l = "", d = "";
        if (!(e = i.exec(t)) || this.rules.block.hr.test(t)) break;
        l = e[0], t = t.substring(l.length);
        let u = nd(e[2].split(`
`, 1)[0], e[1].length), p = t.split(`
`, 1)[0], h = !u.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, d = u.trimStart()) : h ? f = e[1].length + 1 : (f = u.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, d = u.slice(f), f += e[1].length), h && this.rules.other.blankLine.test(p) && (l += p + `
`, t = t.substring(p.length + 1), c = !0), !c) {
          let k = this.rules.other.nextBulletRegex(f), N = this.rules.other.hrRegex(f), A = this.rules.other.fencesBeginRegex(f), ke = this.rules.other.headingBeginRegex(f), Os = this.rules.other.htmlBeginRegex(f), $s = this.rules.other.blockquoteBeginRegex(f);
          for (; t; ) {
            let ht = t.split(`
`, 1)[0], xe;
            if (p = ht, this.options.pedantic ? (p = p.replace(this.rules.other.listReplaceNesting, "  "), xe = p) : xe = p.replace(this.rules.other.tabCharGlobal, "    "), A.test(p) || ke.test(p) || Os.test(p) || $s.test(p) || k.test(p) || N.test(p)) break;
            if (xe.search(this.rules.other.nonSpaceChar) >= f || !p.trim()) d += `
` + xe.slice(f);
            else {
              if (h || u.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || A.test(u) || ke.test(u) || N.test(u)) break;
              d += `
` + p;
            }
            h = !p.trim(), l += ht + `
`, t = t.substring(ht.length + 1), u = xe.slice(f);
          }
        }
        s.loose || (o ? s.loose = !0 : this.rules.other.doubleBlankLine.test(l) && (o = !0)), s.items.push({ type: "list_item", raw: l, task: !!this.options.gfm && this.rules.other.listIsTask.test(d), loose: !1, text: d, tokens: [] }), s.raw += l;
      }
      let a = s.items.at(-1);
      if (a) a.raw = a.raw.trimEnd(), a.text = a.text.trimEnd();
      else return;
      s.raw = s.raw.trimEnd();
      for (let c of s.items) {
        this.lexer.state.top = !1, c.tokens = this.lexer.blockTokens(c.text, []);
        let l = c.tokens[0];
        if (c.task && (l?.type === "text" || l?.type === "paragraph")) {
          c.text = c.text.replace(this.rules.other.listReplaceTask, ""), l.raw = l.raw.replace(this.rules.other.listReplaceTask, ""), l.text = l.text.replace(this.rules.other.listReplaceTask, "");
          for (let u = this.lexer.inlineQueue.length - 1; u >= 0; u--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[u].src)) {
            this.lexer.inlineQueue[u].src = this.lexer.inlineQueue[u].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let d = this.rules.other.listTaskCheckbox.exec(c.raw);
          if (d) {
            let u = { type: "checkbox", raw: d[0] + " ", checked: d[0] !== "[ ]" };
            c.checked = u.checked, s.loose ? c.tokens[0] && ["paragraph", "text"].includes(c.tokens[0].type) && "tokens" in c.tokens[0] && c.tokens[0].tokens ? (c.tokens[0].raw = u.raw + c.tokens[0].raw, c.tokens[0].text = u.raw + c.tokens[0].text, c.tokens[0].tokens.unshift(u)) : c.tokens.unshift({ type: "paragraph", raw: u.raw, text: u.raw, tokens: [u] }) : c.tokens.unshift(u);
          }
        } else c.task && (c.task = !1);
        if (!s.loose) {
          let d = c.tokens.filter((p) => p.type === "space"), u = d.length > 0 && d.some((p) => this.rules.other.anyLine.test(p.raw));
          s.loose = u;
        }
      }
      if (s.loose) for (let c of s.items) {
        c.loose = !0;
        for (let l of c.tokens) l.type === "text" && (l.type = "paragraph");
      }
      return s;
    }
  }
  html(t) {
    let e = this.rules.block.html.exec(t);
    if (e) {
      let n = Rr(e[0]);
      return { type: "html", block: !0, raw: n, pre: e[1] === "pre" || e[1] === "script" || e[1] === "style", text: n };
    }
  }
  def(t) {
    let e = this.rules.block.def.exec(t);
    if (e) {
      let n = e[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = e[2] ? e[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", s = e[3] ? e[3].substring(1, e[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : e[3];
      return { type: "def", tag: n, raw: V(e[0], `
`), href: r, title: s };
    }
  }
  table(t) {
    let e = this.rules.block.table.exec(t);
    if (!e || !this.rules.other.tableDelimiter.test(e[2])) return;
    let n = xr(e[1]), r = e[2].replace(this.rules.other.tableAlignChars, "").split("|"), s = e[3]?.trim() ? e[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: V(e[0], `
`), header: [], align: [], rows: [] };
    if (n.length === r.length) {
      for (let o of r) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
      for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: !0, align: i.align[o] });
      for (let o of s) i.rows.push(xr(o, i.header.length).map((a, c) => ({ text: a, tokens: this.lexer.inline(a), header: !1, align: i.align[c] })));
      return i;
    }
  }
  lheading(t) {
    let e = this.rules.block.lheading.exec(t);
    if (e) {
      let n = e[1].trim();
      return { type: "heading", raw: V(e[0], `
`), depth: e[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(t) {
    let e = this.rules.block.paragraph.exec(t);
    if (e) {
      let n = e[1].charAt(e[1].length - 1) === `
` ? e[1].slice(0, -1) : e[1];
      return { type: "paragraph", raw: e[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(t) {
    let e = this.rules.block.text.exec(t);
    if (e) return { type: "text", raw: e[0], text: e[0], tokens: this.lexer.inline(e[0]) };
  }
  escape(t) {
    let e = this.rules.inline.escape.exec(t);
    if (e) return { type: "escape", raw: e[0], text: e[1] };
  }
  tag(t) {
    let e = this.rules.inline.tag.exec(t);
    if (e) return !this.lexer.state.inLink && this.rules.other.startATag.test(e[0]) ? this.lexer.state.inLink = !0 : this.lexer.state.inLink && this.rules.other.endATag.test(e[0]) && (this.lexer.state.inLink = !1), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(e[0]) ? this.lexer.state.inRawBlock = !0 : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(e[0]) && (this.lexer.state.inRawBlock = !1), { type: "html", raw: e[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: !1, text: e[0] };
  }
  link(t) {
    let e = this.rules.inline.link.exec(t);
    if (e) {
      let n = e[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let i = V(n.slice(0, -1), "\\");
        if ((n.length - i.length) % 2 === 0) return;
      } else {
        let i = td(e[2], "()");
        if (i === -2) return;
        if (i > -1) {
          let o = (e[0].indexOf("!") === 0 ? 5 : 4) + e[1].length + i;
          e[2] = e[2].substring(0, i), e[0] = e[0].substring(0, o).trim(), e[3] = "";
        }
      }
      let r = e[2], s = "";
      if (this.options.pedantic) {
        let i = this.rules.other.pedanticHrefTitle.exec(r);
        i && (r = i[1], s = i[3]);
      } else s = e[3] ? e[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), wr(e, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: s && s.replace(this.rules.inline.anyPunctuation, "$1") }, e[0], this.lexer, this.rules);
    }
  }
  reflink(t, e) {
    let n;
    if ((n = this.rules.inline.reflink.exec(t)) || (n = this.rules.inline.nolink.exec(t))) {
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), s = e[r.toLowerCase()];
      if (!s) {
        let i = n[0].charAt(0);
        return { type: "text", raw: i, text: i };
      }
      return wr(n, s, n[0], this.lexer, this.rules);
    }
  }
  emStrong(t, e, n = "") {
    let r = this.rules.inline.emStrongLDelim.exec(t);
    if (!(!r || !r[1] && !r[2] && !r[3] && !r[4] || r[4] && n.match(this.rules.other.unicodeAlphaNumeric)) && (!(r[1] || r[3]) || !n || this.rules.inline.punctuation.exec(n))) {
      let s = [...r[0]].length - 1, i, o, a = s, c = 0, l = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (l.lastIndex = 0, e = e.slice(-1 * t.length + s); (r = l.exec(e)) !== null; ) {
        if (i = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !i) continue;
        if (o = [...i].length, r[3] || r[4]) {
          a += o;
          continue;
        } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
          c += o;
          continue;
        }
        if (a -= o, a > 0) continue;
        o = Math.min(o, o + a + c);
        let d = [...r[0]][0].length, u = t.slice(0, s + r.index + d + o);
        if (Math.min(s, o) % 2) {
          let h = u.slice(1, -1);
          return { type: "em", raw: u, text: h, tokens: this.lexer.inlineTokens(h) };
        }
        let p = u.slice(2, -2);
        return { type: "strong", raw: u, text: p, tokens: this.lexer.inlineTokens(p) };
      }
    }
  }
  codespan(t) {
    let e = this.rules.inline.code.exec(t);
    if (e) {
      let n = e[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), s = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return r && s && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: e[0], text: n };
    }
  }
  br(t) {
    let e = this.rules.inline.br.exec(t);
    if (e) return { type: "br", raw: e[0] };
  }
  del(t, e, n = "") {
    let r = this.rules.inline.delLDelim.exec(t);
    if (r && (!r[1] || !n || this.rules.inline.punctuation.exec(n))) {
      let s = [...r[0]].length - 1, i, o, a = s, c = this.rules.inline.delRDelim;
      for (c.lastIndex = 0, e = e.slice(-1 * t.length + s); (r = c.exec(e)) !== null; ) {
        if (i = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !i || (o = [...i].length, o !== s)) continue;
        if (r[3] || r[4]) {
          a += o;
          continue;
        }
        if (a -= o, a > 0) continue;
        o = Math.min(o, o + a);
        let l = [...r[0]][0].length, d = t.slice(0, s + r.index + l + o), u = d.slice(s, -s);
        return { type: "del", raw: d, text: u, tokens: this.lexer.inlineTokens(u) };
      }
    }
  }
  autolink(t) {
    let e = this.rules.inline.autolink.exec(t);
    if (e) {
      let n, r;
      return e[2] === "@" ? (n = e[1], r = "mailto:" + n) : (n = e[1], r = n), { type: "link", raw: e[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(t) {
    let e;
    if (e = this.rules.inline.url.exec(t)) {
      let n, r;
      if (e[2] === "@") n = e[0], r = "mailto:" + n;
      else {
        let s;
        do
          s = e[0], e[0] = this.rules.inline._backpedal.exec(e[0])?.[0] ?? "";
        while (s !== e[0]);
        n = e[0], e[1] === "www." ? r = "http://" + e[0] : r = e[0];
      }
      return { type: "link", raw: e[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(t) {
    let e = this.rules.inline.text.exec(t);
    if (e) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: e[0], text: e[0], escaped: n };
    }
  }
}, L = class qt {
  constructor(e) {
    w(this, "tokens");
    w(this, "options");
    w(this, "state");
    w(this, "inlineQueue");
    w(this, "tokenizer");
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || ue, this.options.tokenizer = this.options.tokenizer || new et(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: !1, inRawBlock: !1, top: !0 };
    let n = { other: I, block: He.normal, inline: we.normal };
    this.options.pedantic ? (n.block = He.pedantic, n.inline = we.pedantic) : this.options.gfm && (n.block = He.gfm, this.options.breaks ? n.inline = we.breaks : n.inline = we.gfm), this.tokenizer.rules = n;
  }
  static get rules() {
    return { block: He, inline: we };
  }
  static lex(e, n) {
    return new qt(n).lex(e);
  }
  static lexInline(e, n) {
    return new qt(n).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(I.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let n = 0; n < this.inlineQueue.length; n++) {
      let r = this.inlineQueue[n];
      this.inlineTokens(r.src, r.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, n = [], r = !1) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(I.tabCharGlobal, "    ").replace(I.spaceLine, ""));
    let s = 1 / 0;
    for (; e; ) {
      if (e.length < s) s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let i;
      if (this.options.extensions?.block?.some((a) => (i = a.call({ lexer: this }, e, n)) ? (e = e.substring(i.raw.length), n.push(i), !0) : !1)) continue;
      if (i = this.tokenizer.space(e)) {
        e = e.substring(i.raw.length);
        let a = n.at(-1);
        i.raw.length === 1 && a !== void 0 ? a.raw += `
` : n.push(i);
        continue;
      }
      if (i = this.tokenizer.code(e)) {
        e = e.substring(i.raw.length);
        let a = n.at(-1);
        a?.type === "paragraph" || a?.type === "text" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + i.raw, a.text += `
` + i.text, this.inlineQueue.at(-1).src = a.text) : n.push(i);
        continue;
      }
      if (i = this.tokenizer.fences(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.heading(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.hr(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.blockquote(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.list(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.html(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.def(e)) {
        e = e.substring(i.raw.length);
        let a = n.at(-1);
        a?.type === "paragraph" || a?.type === "text" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + i.raw, a.text += `
` + i.raw, this.inlineQueue.at(-1).src = a.text) : this.tokens.links[i.tag] || (this.tokens.links[i.tag] = { href: i.href, title: i.title }, n.push(i));
        continue;
      }
      if (i = this.tokenizer.table(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      if (i = this.tokenizer.lheading(e)) {
        e = e.substring(i.raw.length), n.push(i);
        continue;
      }
      let o = e;
      if (this.options.extensions?.startBlock) {
        let a = 1 / 0, c = e.slice(1), l;
        this.options.extensions.startBlock.forEach((d) => {
          l = d.call({ lexer: this }, c), typeof l == "number" && l >= 0 && (a = Math.min(a, l));
        }), a < 1 / 0 && a >= 0 && (o = e.substring(0, a + 1));
      }
      if (this.state.top && (i = this.tokenizer.paragraph(o))) {
        let a = n.at(-1);
        r && a?.type === "paragraph" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + i.raw, a.text += `
` + i.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = a.text) : n.push(i), r = o.length !== e.length, e = e.substring(i.raw.length);
        continue;
      }
      if (i = this.tokenizer.text(e)) {
        e = e.substring(i.raw.length);
        let a = n.at(-1);
        a?.type === "text" ? (a.raw += (a.raw.endsWith(`
`) ? "" : `
`) + i.raw, a.text += `
` + i.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = a.text) : n.push(i);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = !0, n;
  }
  inline(e, n = []) {
    return this.inlineQueue.push({ src: e, tokens: n }), n;
  }
  inlineTokens(e, n = []) {
    this.tokenizer.lexer = this;
    let r = e, s = null;
    if (this.tokens.links) {
      let l = Object.keys(this.tokens.links);
      if (l.length > 0) for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(r)) !== null; ) l.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (r = r.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + r.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(r)) !== null; ) r = r.slice(0, s.index) + "++" + r.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let i;
    for (; (s = this.tokenizer.rules.inline.blockSkip.exec(r)) !== null; ) i = s[2] ? s[2].length : 0, r = r.slice(0, s.index + i) + "[" + "a".repeat(s[0].length - i - 2) + "]" + r.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    r = this.options.hooks?.emStrongMask?.call({ lexer: this }, r) ?? r;
    let o = !1, a = "", c = 1 / 0;
    for (; e; ) {
      if (e.length < c) c = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      o || (a = ""), o = !1;
      let l;
      if (this.options.extensions?.inline?.some((u) => (l = u.call({ lexer: this }, e, n)) ? (e = e.substring(l.raw.length), n.push(l), !0) : !1)) continue;
      if (l = this.tokenizer.escape(e)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.tag(e)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.link(e)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(l.raw.length);
        let u = n.at(-1);
        l.type === "text" && u?.type === "text" ? (u.raw += l.raw, u.text += l.text) : n.push(l);
        continue;
      }
      if (l = this.tokenizer.emStrong(e, r, a)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.codespan(e)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.br(e)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.del(e, r, a)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (l = this.tokenizer.autolink(e)) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      if (!this.state.inLink && (l = this.tokenizer.url(e))) {
        e = e.substring(l.raw.length), n.push(l);
        continue;
      }
      let d = e;
      if (this.options.extensions?.startInline) {
        let u = 1 / 0, p = e.slice(1), h;
        this.options.extensions.startInline.forEach((f) => {
          h = f.call({ lexer: this }, p), typeof h == "number" && h >= 0 && (u = Math.min(u, h));
        }), u < 1 / 0 && u >= 0 && (d = e.substring(0, u + 1));
      }
      if (l = this.tokenizer.inlineText(d)) {
        e = e.substring(l.raw.length), l.raw.slice(-1) !== "_" && (a = l.raw.slice(-1)), o = !0;
        let u = n.at(-1);
        u?.type === "text" ? (u.raw += l.raw, u.text += l.text) : n.push(l);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return n;
  }
  infiniteLoopError(e) {
    let n = "Infinite loop on byte: " + e;
    if (this.options.silent) console.error(n);
    else throw new Error(n);
  }
}, tt = class {
  constructor(t) {
    w(this, "options");
    w(this, "parser");
    this.options = t || ue;
  }
  space(t) {
    return "";
  }
  code({ text: t, lang: e, escaped: n }) {
    let r = (e || "").match(I.notSpaceStart)?.[0], s = t.replace(I.endingNewline, "") + `
`;
    return r ? '<pre><code class="language-' + U(r) + '">' + (n ? s : U(s, !0)) + `</code></pre>
` : "<pre><code>" + (n ? s : U(s, !0)) + `</code></pre>
`;
  }
  blockquote({ tokens: t }) {
    return `<blockquote>
${this.parser.parse(t)}</blockquote>
`;
  }
  html({ text: t }) {
    return t;
  }
  def(t) {
    return "";
  }
  heading({ tokens: t, depth: e }) {
    return `<h${e}>${this.parser.parseInline(t)}</h${e}>
`;
  }
  hr(t) {
    return `<hr>
`;
  }
  list(t) {
    let e = t.ordered, n = t.start, r = "";
    for (let o = 0; o < t.items.length; o++) {
      let a = t.items[o];
      r += this.listitem(a);
    }
    let s = e ? "ol" : "ul", i = e && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + s + i + `>
` + r + "</" + s + `>
`;
  }
  listitem(t) {
    return `<li>${this.parser.parse(t.tokens)}</li>
`;
  }
  checkbox({ checked: t }) {
    return "<input " + (t ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: t }) {
    return `<p>${this.parser.parseInline(t)}</p>
`;
  }
  table(t) {
    let e = "", n = "";
    for (let s = 0; s < t.header.length; s++) n += this.tablecell(t.header[s]);
    e += this.tablerow({ text: n });
    let r = "";
    for (let s = 0; s < t.rows.length; s++) {
      let i = t.rows[s];
      n = "";
      for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
      r += this.tablerow({ text: n });
    }
    return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + e + `</thead>
` + r + `</table>
`;
  }
  tablerow({ text: t }) {
    return `<tr>
${t}</tr>
`;
  }
  tablecell(t) {
    let e = this.parser.parseInline(t.tokens), n = t.header ? "th" : "td";
    return (t.align ? `<${n} align="${t.align}">` : `<${n}>`) + e + `</${n}>
`;
  }
  strong({ tokens: t }) {
    return `<strong>${this.parser.parseInline(t)}</strong>`;
  }
  em({ tokens: t }) {
    return `<em>${this.parser.parseInline(t)}</em>`;
  }
  codespan({ text: t }) {
    return `<code>${U(t, !0)}</code>`;
  }
  br(t) {
    return "<br>";
  }
  del({ tokens: t }) {
    return `<del>${this.parser.parseInline(t)}</del>`;
  }
  link({ href: t, title: e, tokens: n }) {
    let r = this.parser.parseInline(n), s = kr(t);
    if (s === null) return r;
    t = s;
    let i = '<a href="' + t + '"';
    return e && (i += ' title="' + U(e) + '"'), i += ">" + r + "</a>", i;
  }
  image({ href: t, title: e, text: n, tokens: r }) {
    r && (n = this.parser.parseInline(r, this.parser.textRenderer));
    let s = kr(t);
    if (s === null) return U(n);
    t = s;
    let i = `<img src="${t}" alt="${U(n)}"`;
    return e && (i += ` title="${U(e)}"`), i += ">", i;
  }
  text(t) {
    return "tokens" in t && t.tokens ? this.parser.parseInline(t.tokens) : "escaped" in t && t.escaped ? t.text : U(t.text);
  }
}, _n = class {
  strong({ text: t }) {
    return t;
  }
  em({ text: t }) {
    return t;
  }
  codespan({ text: t }) {
    return t;
  }
  del({ text: t }) {
    return t;
  }
  html({ text: t }) {
    return t;
  }
  text({ text: t }) {
    return t;
  }
  link({ text: t }) {
    return "" + t;
  }
  image({ text: t }) {
    return "" + t;
  }
  br() {
    return "";
  }
  checkbox({ raw: t }) {
    return t;
  }
}, M = class Gt {
  constructor(e) {
    w(this, "options");
    w(this, "renderer");
    w(this, "textRenderer");
    this.options = e || ue, this.options.renderer = this.options.renderer || new tt(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new _n();
  }
  static parse(e, n) {
    return new Gt(n).parse(e);
  }
  static parseInline(e, n) {
    return new Gt(n).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let s = e[r];
      if (this.options.extensions?.renderers?.[s.type]) {
        let o = s, a = this.options.extensions.renderers[o.type].call({ parser: this }, o);
        if (a !== !1 || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(o.type)) {
          n += a || "";
          continue;
        }
      }
      let i = s;
      switch (i.type) {
        case "space": {
          n += this.renderer.space(i);
          break;
        }
        case "hr": {
          n += this.renderer.hr(i);
          break;
        }
        case "heading": {
          n += this.renderer.heading(i);
          break;
        }
        case "code": {
          n += this.renderer.code(i);
          break;
        }
        case "table": {
          n += this.renderer.table(i);
          break;
        }
        case "blockquote": {
          n += this.renderer.blockquote(i);
          break;
        }
        case "list": {
          n += this.renderer.list(i);
          break;
        }
        case "checkbox": {
          n += this.renderer.checkbox(i);
          break;
        }
        case "html": {
          n += this.renderer.html(i);
          break;
        }
        case "def": {
          n += this.renderer.def(i);
          break;
        }
        case "paragraph": {
          n += this.renderer.paragraph(i);
          break;
        }
        case "text": {
          n += this.renderer.text(i);
          break;
        }
        default: {
          let o = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return n;
  }
  parseInline(e, n = this.renderer) {
    this.renderer.parser = this;
    let r = "";
    for (let s = 0; s < e.length; s++) {
      let i = e[s];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (a !== !1 || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
          r += a || "";
          continue;
        }
      }
      let o = i;
      switch (o.type) {
        case "escape": {
          r += n.text(o);
          break;
        }
        case "html": {
          r += n.html(o);
          break;
        }
        case "link": {
          r += n.link(o);
          break;
        }
        case "image": {
          r += n.image(o);
          break;
        }
        case "checkbox": {
          r += n.checkbox(o);
          break;
        }
        case "strong": {
          r += n.strong(o);
          break;
        }
        case "em": {
          r += n.em(o);
          break;
        }
        case "codespan": {
          r += n.codespan(o);
          break;
        }
        case "br": {
          r += n.br(o);
          break;
        }
        case "del": {
          r += n.del(o);
          break;
        }
        case "text": {
          r += n.text(o);
          break;
        }
        default: {
          let a = 'Token with "' + o.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return r;
  }
}, je, ve = (je = class {
  constructor(t) {
    w(this, "options");
    w(this, "block");
    this.options = t || ue;
  }
  preprocess(t) {
    return t;
  }
  postprocess(t) {
    return t;
  }
  processAllTokens(t) {
    return t;
  }
  emStrongMask(t) {
    return t;
  }
  provideLexer(t = this.block) {
    return t ? L.lex : L.lexInline;
  }
  provideParser(t = this.block) {
    return t ? M.parse : M.parseInline;
  }
}, w(je, "passThroughHooks", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"])), w(je, "passThroughHooksRespectAsync", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"])), je), sd = class {
  constructor(...t) {
    w(this, "defaults", ln());
    w(this, "options", this.setOptions);
    w(this, "parse", this.parseMarkdown(!0));
    w(this, "parseInline", this.parseMarkdown(!1));
    w(this, "Parser", M);
    w(this, "Renderer", tt);
    w(this, "TextRenderer", _n);
    w(this, "Lexer", L);
    w(this, "Tokenizer", et);
    w(this, "Hooks", ve);
    this.use(...t);
  }
  walkTokens(t, e) {
    let n = [];
    for (let r of t) switch (n = n.concat(e.call(this, r)), r.type) {
      case "table": {
        let s = r;
        for (let i of s.header) n = n.concat(this.walkTokens(i.tokens, e));
        for (let i of s.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, e));
        break;
      }
      case "list": {
        let s = r;
        n = n.concat(this.walkTokens(s.items, e));
        break;
      }
      default: {
        let s = r;
        this.defaults.extensions?.childTokens?.[s.type] ? this.defaults.extensions.childTokens[s.type].forEach((i) => {
          let o = s[i].flat(1 / 0);
          n = n.concat(this.walkTokens(o, e));
        }) : s.tokens && (n = n.concat(this.walkTokens(s.tokens, e)));
      }
    }
    return n;
  }
  use(...t) {
    let e = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return t.forEach((n) => {
      let r = { ...n };
      if (r.async = this.defaults.async || r.async || !1, n.extensions && (n.extensions.forEach((s) => {
        if (!s.name) throw new Error("extension name required");
        if ("renderer" in s) {
          let i = e.renderers[s.name];
          i ? e.renderers[s.name] = function(...o) {
            let a = s.renderer.apply(this, o);
            return a === !1 && (a = i.apply(this, o)), a;
          } : e.renderers[s.name] = s.renderer;
        }
        if ("tokenizer" in s) {
          if (!s.level || s.level !== "block" && s.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i = e[s.level];
          i ? i.unshift(s.tokenizer) : e[s.level] = [s.tokenizer], s.start && (s.level === "block" ? e.startBlock ? e.startBlock.push(s.start) : e.startBlock = [s.start] : s.level === "inline" && (e.startInline ? e.startInline.push(s.start) : e.startInline = [s.start]));
        }
        "childTokens" in s && s.childTokens && (e.childTokens[s.name] = s.childTokens);
      }), r.extensions = e), n.renderer) {
        let s = this.defaults.renderer || new tt(this.defaults);
        for (let i in n.renderer) {
          if (!(i in s)) throw new Error(`renderer '${i}' does not exist`);
          if (["options", "parser"].includes(i)) continue;
          let o = i, a = n.renderer[o], c = s[o];
          s[o] = (...l) => {
            let d = a.apply(s, l);
            return d === !1 && (d = c.apply(s, l)), d || "";
          };
        }
        r.renderer = s;
      }
      if (n.tokenizer) {
        let s = this.defaults.tokenizer || new et(this.defaults);
        for (let i in n.tokenizer) {
          if (!(i in s)) throw new Error(`tokenizer '${i}' does not exist`);
          if (["options", "rules", "lexer"].includes(i)) continue;
          let o = i, a = n.tokenizer[o], c = s[o];
          s[o] = (...l) => {
            let d = a.apply(s, l);
            return d === !1 && (d = c.apply(s, l)), d;
          };
        }
        r.tokenizer = s;
      }
      if (n.hooks) {
        let s = this.defaults.hooks || new ve();
        for (let i in n.hooks) {
          if (!(i in s)) throw new Error(`hook '${i}' does not exist`);
          if (["options", "block"].includes(i)) continue;
          let o = i, a = n.hooks[o], c = s[o];
          ve.passThroughHooks.has(i) ? s[o] = (l) => {
            if (this.defaults.async && ve.passThroughHooksRespectAsync.has(i)) return (async () => {
              let u = await a.call(s, l);
              return c.call(s, u);
            })();
            let d = a.call(s, l);
            return c.call(s, d);
          } : s[o] = (...l) => {
            if (this.defaults.async) return (async () => {
              let u = await a.apply(s, l);
              return u === !1 && (u = await c.apply(s, l)), u;
            })();
            let d = a.apply(s, l);
            return d === !1 && (d = c.apply(s, l)), d;
          };
        }
        r.hooks = s;
      }
      if (n.walkTokens) {
        let s = this.defaults.walkTokens, i = n.walkTokens;
        r.walkTokens = function(o) {
          let a = [];
          return a.push(i.call(this, o)), s && (a = a.concat(s.call(this, o))), a;
        };
      }
      this.defaults = { ...this.defaults, ...r };
    }), this;
  }
  setOptions(t) {
    return this.defaults = { ...this.defaults, ...t }, this;
  }
  lexer(t, e) {
    return L.lex(t, e ?? this.defaults);
  }
  parser(t, e) {
    return M.parse(t, e ?? this.defaults);
  }
  parseMarkdown(t) {
    return (e, n) => {
      let r = { ...n }, s = { ...this.defaults, ...r }, i = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === !0 && r.async === !1) return i(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof e > "u" || e === null) return i(new Error("marked(): input parameter is undefined or null"));
      if (typeof e != "string") return i(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(e) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = t), s.async) return (async () => {
        let o = s.hooks ? await s.hooks.preprocess(e) : e, a = await (s.hooks ? await s.hooks.provideLexer(t) : t ? L.lex : L.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(a) : a;
        s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
        let l = await (s.hooks ? await s.hooks.provideParser(t) : t ? M.parse : M.parseInline)(c, s);
        return s.hooks ? await s.hooks.postprocess(l) : l;
      })().catch(i);
      try {
        s.hooks && (e = s.hooks.preprocess(e));
        let o = (s.hooks ? s.hooks.provideLexer(t) : t ? L.lex : L.lexInline)(e, s);
        s.hooks && (o = s.hooks.processAllTokens(o)), s.walkTokens && this.walkTokens(o, s.walkTokens);
        let a = (s.hooks ? s.hooks.provideParser(t) : t ? M.parse : M.parseInline)(o, s);
        return s.hooks && (a = s.hooks.postprocess(a)), a;
      } catch (o) {
        return i(o);
      }
    };
  }
  onError(t, e) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, t) {
        let r = "<p>An error occurred:</p><pre>" + U(n.message + "", !0) + "</pre>";
        return e ? Promise.resolve(r) : r;
      }
      if (e) return Promise.reject(n);
      throw n;
    };
  }
}, ae = new sd();
function x(t, e) {
  return ae.parse(t, e);
}
x.options = x.setOptions = function(t) {
  return ae.setOptions(t), x.defaults = ae.defaults, xs(x.defaults), x;
};
x.getDefaults = ln;
x.defaults = ue;
x.use = function(...t) {
  return ae.use(...t), x.defaults = ae.defaults, xs(x.defaults), x;
};
x.walkTokens = function(t, e) {
  return ae.walkTokens(t, e);
};
x.parseInline = ae.parseInline;
x.Parser = M;
x.parser = M.parse;
x.Renderer = tt;
x.TextRenderer = _n;
x.Lexer = L;
x.lexer = L.lex;
x.Tokenizer = et;
x.Hooks = ve;
x.parse = x;
x.options;
x.setOptions;
x.use;
x.walkTokens;
x.parseInline;
M.parse;
L.lex;
var g = /* @__PURE__ */ ((t) => (t.COLLAPSED = "collapsed", t.RECORDING = "recording", t.PAUSED = "paused", t.PROCESSING = "processing", t.DONE = "done", t.ERROR = "error", t))(g || {});
const id = {
  [g.COLLAPSED]: [g.RECORDING, g.ERROR],
  [g.RECORDING]: [
    g.PAUSED,
    g.PROCESSING,
    g.ERROR
  ],
  [g.PAUSED]: [
    g.RECORDING,
    g.PROCESSING,
    g.ERROR
  ],
  [g.PROCESSING]: [g.DONE, g.ERROR],
  [g.DONE]: [g.COLLAPSED],
  [g.ERROR]: [g.COLLAPSED, g.RECORDING]
};
class od {
  constructor() {
    this.state = g.COLLAPSED, this.listeners = /* @__PURE__ */ new Set();
  }
  get current() {
    return this.state;
  }
  canTransition(e) {
    return id[this.state].includes(e);
  }
  transition(e) {
    if (!this.canTransition(e))
      throw new Error(
        `[EkaScribe Widget] Invalid state transition: ${this.state} → ${e}`
      );
    const n = this.state;
    this.state = e;
    for (const r of this.listeners)
      r(n, e);
  }
  onChange(e) {
    this.listeners.add(e);
  }
  offChange(e) {
    this.listeners.delete(e);
  }
  reset() {
    this.state = g.COLLAPSED;
  }
}
class ad {
  constructor(e) {
    this.startTime = 0, this.elapsed = 0, this.intervalId = null, this.tickCallback = e;
  }
  start() {
    this.elapsed = 0, this.startTime = Date.now(), this.tick(), this.intervalId = setInterval(() => this.tick(), 1e3);
  }
  pause() {
    this.clearInterval(), this.elapsed = Date.now() - this.startTime;
  }
  resume() {
    this.startTime = Date.now() - this.elapsed, this.tick(), this.intervalId = setInterval(() => this.tick(), 1e3);
  }
  stop() {
    return this.clearInterval(), this.elapsed = Date.now() - this.startTime, this.getDurationSeconds();
  }
  getDurationSeconds() {
    return Math.floor(this.elapsed / 1e3);
  }
  getFormatted() {
    return this.format();
  }
  tick() {
    this.elapsed = Date.now() - this.startTime, this.tickCallback(this.format());
  }
  format() {
    const e = this.getDurationSeconds(), n = String(Math.floor(e / 60)), r = String(e % 60).padStart(2, "0");
    return `${n}:${r}`;
  }
  clearInterval() {
    this.intervalId !== null && (clearInterval(this.intervalId), this.intervalId = null);
  }
}
function cd() {
  return `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      max-height: calc(100vh - 40px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
    }

    .widget.hidden {
      display: none;
    }

    /* ── Pill Container ── */

    .pill {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #F8F9FF;
      border: 1.5px solid #C7D2F6;
      border-radius: 999px;
      padding: 8px 16px;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
      cursor: grab;
    }

    .pill:active {
      cursor: grabbing;
    }

    .pill.vertical {
      flex-direction: column;
      border-radius: 28px;
      padding: 16px 12px;
      gap: 10px;
    }

    /* ── Buttons ── */

    .btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 0.15s ease;
    }

    .btn:hover {
      transform: scale(1.08);
    }

    .btn-play-pause {
      background: #2563EB;
    }

    .btn-play-pause svg {
      width: 14px;
      height: 14px;
      fill: #fff;
    }

    .btn-stop {
      background: #DC2626;
    }

    .btn-stop svg {
      width: 12px;
      height: 12px;
      fill: #fff;
    }

    /* ── Timer ── */

    .timer {
      font-size: 16px;
      font-weight: 600;
      font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
      color: #1A1A1A;
      flex-shrink: 0;
      min-width: 36px;
      text-align: center;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinner {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      border: 3px solid #E0E7FF;
      border-top-color: #2563EB;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .status-text {
      font-size: 11px;
      color: #6B7280;
    }

    /* ── Done ── */

    .done-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #16A34A;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .done-icon svg {
      width: 14px;
      height: 14px;
      stroke: #fff;
      fill: none;
      stroke-width: 3;
    }

    .done-text {
      font-size: 12px;
      font-weight: 600;
      color: #16A34A;
    }

    .btn-x {
      width: 28px;
      height: 28px;
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .btn-x svg {
      width: 16px;
      height: 16px;
      stroke: #9CA3AF;
      stroke-width: 2.5;
    }

    .btn-x:hover svg {
      stroke: #4B5563;
    }

    /* ── Error ── */

    .error-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #DC2626;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .error-icon svg {
      width: 14px;
      height: 14px;
      stroke: #fff;
      fill: none;
      stroke-width: 3;
    }

    .error-text {
      font-size: 10px;
      color: #DC2626;
      text-align: center;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .btn-retry {
      background: none;
      border: 1px solid #DC2626;
      color: #DC2626;
      font-size: 10px;
      padding: 4px 12px;
      border-radius: 999px;
      cursor: pointer;
      font-family: inherit;
    }

    .btn-retry:hover {
      background: #DC2626;
      color: #fff;
    }

    /* ── Expanded Done State ── */

    .content-expanded {
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 8px;
      cursor: grab;
    }

    .content-expanded:active {
      cursor: grabbing;
    }

    .panel {
      background: #F8F9FF;
      border: 1.5px solid #C7D2F6;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
      overflow: hidden;
      width: 340px;
    }

    .drag-bar {
      display: flex;
      justify-content: center;
      padding: 6px 0 2px;
      cursor: grab;
    }

    .drag-bar:active {
      cursor: grabbing;
    }

    .drag-bar span {
      width: 32px;
      height: 4px;
      background: #C7D2F6;
      border-radius: 2px;
    }

    .tab-bar {
      display: flex;
      border-bottom: 1px solid #C7D2F6;
    }

    .tab {
      flex: 1;
      padding: 8px 0;
      border: none;
      background: none;
      font-size: 12px;
      font-weight: 600;
      color: #9CA3AF;
      cursor: pointer;
      font-family: inherit;
      border-bottom: 2px solid transparent;
    }

    .tab.active {
      color: #2563EB;
      border-bottom-color: #2563EB;
    }

    .tab:hover:not(.active) {
      color: #6B7280;
    }

    .tab-body {
      padding: 12px 16px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.6;
      color: #374151;
      white-space: pre-wrap;
      word-wrap: break-word;
      cursor: auto;
      user-select: text;
    }

    .tab-body::-webkit-scrollbar {
      width: 4px;
    }

    .tab-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .tab-body::-webkit-scrollbar-thumb {
      background: #C7D2F6;
      border-radius: 2px;
    }

    /* ── Markdown content ── */

    .md-content {
      white-space: normal;
    }

    .md-content h1,
    .md-content h2,
    .md-content h3,
    .md-content h4,
    .md-content h5,
    .md-content h6 {
      margin: 12px 0 6px;
      color: #1F2937;
      line-height: 1.3;
    }

    .md-content h1 { font-size: 18px; }
    .md-content h2 { font-size: 16px; }
    .md-content h3 { font-size: 14px; }
    .md-content h4 { font-size: 13px; }

    .md-content p {
      margin: 6px 0;
    }

    .md-content ul,
    .md-content ol {
      padding-left: 20px;
      margin: 6px 0;
    }

    .md-content li {
      margin: 2px 0;
    }

    .md-content code {
      background: #E0E7FF;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 12px;
    }

    .md-content pre {
      background: #1F2937;
      color: #E5E7EB;
      padding: 10px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
      font-size: 12px;
    }

    .md-content pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    .md-content strong {
      font-weight: 600;
    }

    .md-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 12px;
    }

    .md-content th,
    .md-content td {
      border: 1px solid #C7D2F6;
      padding: 6px 8px;
      text-align: left;
    }

    .md-content th {
      background: #E0E7FF;
      font-weight: 600;
    }
  `;
}
function ld(t, e) {
  let n = 0, r = 0, s = !1;
  function i(c) {
    if (c.target.closest("button")) return;
    s = !0;
    const d = "touches" in c ? c.touches[0].clientX : c.clientX, u = "touches" in c ? c.touches[0].clientY : c.clientY, p = t.getBoundingClientRect();
    n = d - p.left, r = u - p.top, t.style.bottom = "auto", t.style.right = "auto", t.style.left = `${p.left}px`, t.style.top = `${p.top}px`, document.addEventListener("mousemove", o), document.addEventListener("mouseup", a), document.addEventListener("touchmove", o, { passive: !1 }), document.addEventListener("touchend", a), c.preventDefault();
  }
  function o(c) {
    if (!s) return;
    const l = "touches" in c ? c.touches[0].clientX : c.clientX, d = "touches" in c ? c.touches[0].clientY : c.clientY, u = window.innerWidth - t.offsetWidth, p = window.innerHeight - t.offsetHeight, h = Math.min(Math.max(0, l - n), u), f = Math.min(Math.max(0, d - r), p);
    t.style.left = `${h}px`, t.style.top = `${f}px`, c.preventDefault();
  }
  function a() {
    s = !1, document.removeEventListener("mousemove", o), document.removeEventListener("mouseup", a), document.removeEventListener("touchmove", o), document.removeEventListener("touchend", a);
  }
  return e.addEventListener("mousedown", i), e.addEventListener("touchstart", i, { passive: !1 }), () => {
    e.removeEventListener("mousedown", i), e.removeEventListener("touchstart", i), a();
  };
}
const ud = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>', dd = '<svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg>', Tr = '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>', vr = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>', ze = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>', pd = 20, hd = 14, wt = 3, Tt = 2;
class fd {
  constructor(e, n, r, s) {
    this.cleanupDrag = null, this.animationId = null, this.waveformBars = [], this.actions = s, this.orientation = r, this.host = document.createElement("eka-scribe-widget"), this.shadow = this.host.attachShadow({ mode: "closed" });
    const i = document.createElement("style");
    i.textContent = cd(), this.shadow.appendChild(i), this.widgetEl = document.createElement("div"), this.widgetEl.className = "widget hidden", this.widgetEl.style.zIndex = String(e), this.applyPosition(n), this.shadow.appendChild(this.widgetEl), this.contentEl = document.createElement("div"), this.widgetEl.appendChild(this.contentEl), document.body.appendChild(this.host);
  }
  renderState(e, n) {
    switch (this.stopAnimation(), this.contentEl.className = "", e) {
      case g.COLLAPSED:
        this.renderCollapsed();
        break;
      case g.RECORDING:
        this.renderRecording(n?.time || "0:00");
        break;
      case g.PAUSED:
        this.renderPaused(n?.time || "0:00");
        break;
      case g.PROCESSING:
        this.renderProcessing();
        break;
      case g.DONE:
        this.renderDone();
        break;
      case g.ERROR:
        this.renderError(n?.error || "Something went wrong");
        break;
    }
  }
  updateTimer(e) {
    const n = this.shadow.querySelector(".timer");
    n && (n.textContent = e);
  }
  destroy() {
    this.stopAnimation(), this.cleanupDrag && (this.cleanupDrag(), this.cleanupDrag = null), this.host.remove();
  }
  // ─── State renderers ──────────────────────────────────────────────────────
  renderCollapsed() {
    this.widgetEl.classList.add("hidden"), this.contentEl.innerHTML = "";
  }
  renderRecording(e) {
    this.widgetEl.classList.remove("hidden"), this.contentEl.innerHTML = "";
    const n = this.createPill(), { svg: r, bars: s } = this.createWaveform();
    this.waveformBars = s, n.appendChild(r);
    const i = document.createElement("span");
    i.className = "timer", i.textContent = e, n.appendChild(i);
    const o = this.createButton("btn btn-play-pause", ud);
    o.addEventListener("click", this.actions.onPause), n.appendChild(o);
    const a = this.createButton("btn btn-stop", Tr);
    a.addEventListener("click", this.actions.onStop), n.appendChild(a), this.contentEl.appendChild(n), this.bindDrag(n), this.startAnimation();
  }
  renderPaused(e) {
    this.widgetEl.classList.remove("hidden"), this.contentEl.innerHTML = "";
    const n = this.createPill(), { svg: r, bars: s } = this.createWaveform();
    this.waveformBars = s;
    for (const c of s)
      c.style.opacity = "0.55";
    n.appendChild(r);
    const i = document.createElement("span");
    i.className = "timer", i.textContent = e, n.appendChild(i);
    const o = this.createButton("btn btn-play-pause", dd);
    o.addEventListener("click", this.actions.onResume), n.appendChild(o);
    const a = this.createButton("btn btn-stop", Tr);
    a.addEventListener("click", this.actions.onStop), n.appendChild(a), this.contentEl.appendChild(n), this.bindDrag(n);
  }
  renderProcessing() {
    this.widgetEl.classList.remove("hidden"), this.contentEl.innerHTML = "";
    const e = this.createPill();
    e.innerHTML = `
      <div class="spinner"></div>
      <span class="status-text">Processing notes...</span>
    `, this.contentEl.appendChild(e), this.bindDrag(e);
  }
  renderDone() {
    this.widgetEl.classList.remove("hidden"), this.contentEl.innerHTML = "";
    const e = document.createElement("div");
    e.className = "pill", e.innerHTML = `
      <div class="done-icon">${vr}</div>
      <span class="done-text">Notes ready</span>
    `;
    const n = document.createElement("button");
    n.className = "btn-x", n.innerHTML = ze, n.addEventListener("click", this.actions.onClose), e.appendChild(n), this.contentEl.appendChild(e), this.bindDrag(e);
  }
  renderError(e) {
    this.widgetEl.classList.remove("hidden"), this.contentEl.innerHTML = "";
    const n = document.createElement("div");
    n.className = "pill", n.innerHTML = `
      <div class="error-icon">${ze}</div>
      <span class="error-text">${this.escapeHtml(e)}</span>
    `;
    const r = document.createElement("button");
    r.className = "btn-retry", r.textContent = "Retry", r.addEventListener("click", this.actions.onRetry), n.appendChild(r);
    const s = document.createElement("button");
    s.className = "btn-x", s.innerHTML = ze, s.addEventListener("click", this.actions.onClose), n.appendChild(s), this.contentEl.appendChild(n), this.bindDrag(n);
  }
  renderDoneExpanded(e) {
    this.stopAnimation(), this.widgetEl.classList.remove("hidden"), this.contentEl.innerHTML = "", this.contentEl.className = "content-expanded";
    const n = document.createElement("div");
    n.className = "pill", n.innerHTML = `
      <div class="done-icon">${vr}</div>
      <span class="done-text">Notes ready</span>
    `;
    const r = document.createElement("button");
    r.className = "btn-x", r.innerHTML = ze, r.addEventListener("click", this.actions.onClose), n.appendChild(r), this.contentEl.appendChild(n);
    const s = !!e.transcript, i = !!e.notesHtml;
    if (s || i) {
      const o = document.createElement("div");
      o.className = "panel";
      const a = document.createElement("div");
      a.className = "drag-bar", a.innerHTML = "<span></span>", o.appendChild(a);
      const c = document.createElement("div");
      c.className = "tab-body", c.textContent = e.transcript || "";
      const l = document.createElement("div");
      if (l.className = "tab-body md-content", l.innerHTML = e.notesHtml || "", s && i) {
        const d = document.createElement("div");
        d.className = "tab-bar";
        const u = document.createElement("button");
        u.className = "tab active", u.textContent = "Transcript";
        const p = document.createElement("button");
        p.className = "tab", p.textContent = "Notes", l.style.display = "none", u.addEventListener("click", () => {
          u.classList.add("active"), p.classList.remove("active"), c.style.display = "", l.style.display = "none";
        }), p.addEventListener("click", () => {
          p.classList.add("active"), u.classList.remove("active"), l.style.display = "", c.style.display = "none";
        }), d.appendChild(u), d.appendChild(p), o.appendChild(d), o.appendChild(c), o.appendChild(l);
      } else s ? o.appendChild(c) : o.appendChild(l);
      this.contentEl.appendChild(o);
    }
    this.bindDrag(this.contentEl);
  }
  // ─── Waveform ─────────────────────────────────────────────────────────────
  createWaveform() {
    const e = this.orientation === "vertical" ? hd : pd, n = 28, r = e * (wt + Tt) - Tt, s = n, i = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    i.setAttribute("width", String(r)), i.setAttribute("height", String(s)), i.setAttribute("viewBox", `0 0 ${r} ${s}`);
    const o = [], a = n * 0.4;
    for (let c = 0; c < e; c++) {
      const l = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      l.setAttribute("fill", "#2563EB"), l.setAttribute("rx", "1.5");
      const d = c * (wt + Tt);
      l.setAttribute("x", String(d)), l.setAttribute("y", String((n - a) / 2)), l.setAttribute("width", String(wt)), l.setAttribute("height", String(a)), l.style.opacity = "0.35", i.appendChild(l), o.push(l);
    }
    return { svg: i, bars: o };
  }
  startAnimation() {
    const n = this.waveformBars.length, r = () => {
      const s = Date.now() / 1e3;
      for (let i = 0; i < n; i++) {
        const o = this.waveformBars[i], a = Math.sin(s * 4 + i * 0.4) * 0.3 + 0.5, c = Math.min(1, Math.max(0.15, a)), l = 28 * c;
        o.setAttribute("height", String(l)), o.setAttribute("y", String((28 - l) / 2)), o.style.opacity = String(0.5 + c * 0.5);
      }
      this.animationId = requestAnimationFrame(r);
    };
    this.animationId = requestAnimationFrame(r);
  }
  stopAnimation() {
    this.animationId !== null && (cancelAnimationFrame(this.animationId), this.animationId = null), this.waveformBars = [];
  }
  // ─── Helpers ──────────────────────────────────────────────────────────────
  createPill() {
    const e = document.createElement("div");
    return e.className = this.orientation === "vertical" ? "pill vertical" : "pill", e;
  }
  createButton(e, n) {
    const r = document.createElement("button");
    return r.className = e, r.innerHTML = n, r;
  }
  bindDrag(e) {
    this.cleanupDrag && this.cleanupDrag(), this.cleanupDrag = ld(this.widgetEl, e);
  }
  applyPosition(e) {
    e && (e.top != null && (this.widgetEl.style.top = `${e.top}px`, this.widgetEl.style.bottom = "auto"), e.bottom != null && (this.widgetEl.style.bottom = `${e.bottom}px`), e.left != null && (this.widgetEl.style.left = `${e.left}px`, this.widgetEl.style.right = "auto"), e.right != null && (this.widgetEl.style.right = `${e.right}px`));
  }
  escapeHtml(e) {
    const n = document.createElement("span");
    return n.textContent = e, n.innerHTML;
  }
}
class gd {
  constructor(e, n) {
    this.currentTxnId = "", this.isProcessing = !1, this.isStarting = !1, this.sdk = e, this.config = n, this.callbacks = n.callbacks || {}, this.stateMachine = new od(), this.timer = new ad((r) => this.renderer.updateTimer(r)), this.renderer = new fd(
      n.zIndex ?? 9999,
      n.position,
      n.orientation || "horizontal",
      {
        onPause: () => this.handlePause(),
        onResume: () => this.handleResume(),
        onStop: () => void this.handleStop(),
        onClose: () => this.handleClose(),
        onRetry: () => this.handleRetry()
      }
    ), this.renderer.renderState(g.COLLAPSED);
  }
  async startForPatient(e) {
    if (this.isStarting) {
      this.callbacks.onError?.({
        error_code: "session_starting",
        message: "A session is already being started."
      });
      return;
    }
    const n = this.stateMachine.current;
    if ((n === g.DONE || n === g.ERROR) && this.resetWidget(), this.stateMachine.current !== g.COLLAPSED) {
      const r = `Cannot start: a recording session is already active (txn_id: ${this.currentTxnId}).`;
      this.callbacks.onError?.({ error_code: "session_active", message: r });
      return;
    }
    this.isStarting = !0;
    try {
      const r = this.config.sessionDefaults, s = await this.sdk.startRecordingV2({
        templates: r.output_format_template.map((i) => i.template_id),
        sessionMode: r.mode,
        languageHint: r.input_language,
        model: r.model_type,
        sessionId: e.txn_id,
        patientDetails: e.patient_details ? {
          name: e.patient_details.username,
          age: e.patient_details.age != null ? String(e.patient_details.age) : void 0,
          gender: e.patient_details.biologicalSex
        } : void 0,
        additionalData: e.additional_data
      });
      if (s.error_code) {
        this.showError(s.error_code, s.message);
        return;
      }
      this.currentTxnId = s.txn_id || e.txn_id, this.stateMachine.transition(g.RECORDING), this.renderer.renderState(g.RECORDING), this.timer.start(), this.callbacks.onRecordingStart?.({ txn_id: this.currentTxnId });
    } catch (r) {
      this.showError(
        "unexpected_error",
        r instanceof Error ? r.message : "Failed to start recording"
      );
    } finally {
      this.isStarting = !1;
    }
  }
  destroy() {
    this.timer.stop(), this.renderer.destroy(), this.stateMachine.reset(), this.currentTxnId = "", this.isProcessing = !1;
  }
  // ─── Private action handlers ────────────────────────────────────────────────
  handlePause() {
    if (!this.stateMachine.canTransition(g.PAUSED)) return;
    const e = this.sdk.pauseRecording();
    if (e.error_code) {
      this.showError(e.error_code, e.message);
      return;
    }
    this.timer.pause(), this.stateMachine.transition(g.PAUSED), this.renderer.renderState(g.PAUSED, {
      time: this.timer.getFormatted()
    }), this.callbacks.onRecordingPause?.({
      txn_id: this.currentTxnId,
      duration: this.timer.getDurationSeconds()
    });
  }
  handleResume() {
    if (!this.stateMachine.canTransition(g.RECORDING)) return;
    const e = this.sdk.resumeRecording();
    if (e.error_code) {
      this.showError(e.error_code, e.message);
      return;
    }
    this.timer.resume(), this.stateMachine.transition(g.RECORDING), this.renderer.renderState(g.RECORDING, {
      time: this.timer.getFormatted()
    }), this.callbacks.onRecordingResume?.({ txn_id: this.currentTxnId });
  }
  async handleStop() {
    if (!this.stateMachine.canTransition(g.PROCESSING) || this.isProcessing) return;
    this.isProcessing = !0;
    const e = this.timer.stop();
    this.stateMachine.transition(g.PROCESSING), this.renderer.renderState(g.PROCESSING), this.callbacks.onRecordingStop?.({
      txn_id: this.currentTxnId,
      duration: e
    });
    try {
      const n = await this.sdk.endRecording();
      if (n.error_code) {
        this.isProcessing = !1, this.showError(n.error_code, n.message);
        return;
      }
      this.callbacks.onProcessingStart?.({ txn_id: this.currentTxnId });
      const r = await this.sdk.getSessionStatus(this.currentTxnId, {
        poll: { intervalMs: 3e3, timeoutMs: 12e4 }
      });
      if (this.isProcessing = !1, r.success) {
        this.stateMachine.transition(g.DONE);
        const s = this.parseSessionData(r.data);
        s.transcript || s.notesHtml ? this.renderer.renderDoneExpanded(s) : this.renderer.renderState(g.DONE), this.callbacks.onProcessingComplete?.({
          txn_id: this.currentTxnId,
          sessionData: r.data
        });
      } else {
        const s = r.error;
        this.showError(s.code || "processing_failed", s.message || "Processing failed");
      }
    } catch (n) {
      this.isProcessing = !1, this.showError("processing_error", n instanceof Error ? n.message : "Processing failed");
    }
  }
  handleClose() {
    if (!this.stateMachine.canTransition(g.COLLAPSED)) return;
    const e = this.currentTxnId;
    this.resetWidget(), this.callbacks.onWidgetClose?.({ txn_id: e });
  }
  handleRetry() {
    this.stateMachine.canTransition(g.COLLAPSED) && this.resetWidget();
  }
  // ─── Private helpers ────────────────────────────────────────────────────────
  resetWidget() {
    this.timer.stop(), this.stateMachine.transition(g.COLLAPSED), this.renderer.renderState(g.COLLAPSED), this.currentTxnId = "", this.isProcessing = !1, this.isStarting = !1;
  }
  showError(e, n) {
    this.timer.stop(), this.stateMachine.transition(g.ERROR), this.renderer.renderState(g.ERROR, { error: n }), this.callbacks.onError?.({ error_code: e, message: n });
  }
  parseSessionData(e, n) {
    const r = { transcript: null, notesHtml: null };
    if (e.transcript && (r.transcript = e.transcript), e.templates) {
      let s;
      for (const i of e.templates) {
        for (const [o, a] of Object.entries(i)) {
          const c = a;
          if (!(!c.data || c.status === "failure")) {
            if (n) {
              if (o === n) {
                s = c.data;
                break;
              }
            } else if (c.document_type === "custom" || c.document_type === "notes") {
              s = c.data;
              break;
            }
          }
        }
        if (s) break;
      }
      if (s) {
        const i = typeof s == "string" ? s : JSON.stringify(s, null, 2);
        r.notesHtml = x.parse(i);
      }
    }
    return r;
  }
}
const O = class O {
  constructor(e) {
    this.widgetManager = null, this.config = e, this.hosts = Vs(e.env), this.callbackRegistry = new Ws(), this.tracker = new Yl(e.enableTracking ?? !1);
    const n = {
      access_token: e.access_token,
      clientId: e.clientId,
      flavour: e.flavour,
      onUnauthorized: () => this.handleUnauthorized()
    };
    if (e.mode === "ipc" && e.ipcBridge ? this.transport = new js(n, e.ipcBridge) : this.transport = new Hs(n), e.enableTracking && (this.tracker.init(e.env), e.flavour && this.tracker.setUser(e.flavour)), !e.allianceConfig?.baseUrl)
      throw new Error("[EkaScribe] allianceConfig.baseUrl is required.");
    this.allianceClient = new Us({
      baseUrl: e.allianceConfig.baseUrl,
      accessToken: e.access_token,
      mode: e.mode === "ipc" ? En.IPC : En.DIRECT,
      ipcTransport: e.ipcBridge,
      useWorker: e.allianceConfig?.useWorker ?? "auto",
      workerScriptUrl: e.sharedWorkerUrl,
      debug: e.allianceConfig?.debug ?? !1,
      autoDiscovery: !0,
      flavour: e.flavour
    }), this.allianceClient.init().catch((r) => {
      console.error("[EkaScribe] Alliance SDK init failed:", r);
    }), this.documents = new lu(this.transport, this.hosts, this.allianceClient), this.sessions = new uu(this.transport, this.hosts, this.allianceClient), this.output = new gu(this.transport, this.hosts), this.recording = new pu(
      this.allianceClient,
      this.transport,
      this.hosts,
      this.tracker
    ), e.widget?.enabled && (this.widgetManager = new gd(this, e.widget)), this.allianceClient.registerCallback("onTokenRequired", (r) => {
      this.handleUnauthorized().then((s) => {
        s ? r.resolve(s) : (console.error("[EkaScribe] Token refresh returned empty token."), r.resolve(""));
      }).catch((s) => {
        console.error("[EkaScribe] Token refresh failed:", s), r.resolve("");
      });
    });
  }
  static getInstance(e) {
    if (O.instance) {
      const n = O.instance.config, r = e.env && n.env !== e.env, s = e.clientId && n.clientId !== e.clientId;
      if (r || s)
        console.warn(
          `[EkaScribe] Configuration changed${r ? ` (env: ${n.env} → ${e.env})` : ""}${s ? ` (clientId: ${n.clientId} → ${e.clientId})` : ""}. Resetting instance.`
        ), O.instance.resetInstance().catch((i) => {
          console.error("[EkaScribe] Error during instance reset:", i);
        });
      else
        return e.access_token && O.instance.updateAuthTokens({ access_token: e.access_token }), e.flavour && e.flavour !== n.flavour && (n.flavour = e.flavour, e.enableTracking && O.instance.tracker.setUser(e.flavour)), O.instance;
    }
    return O.instance = new O(e), O.instance;
  }
  // ─── Recording ─────────────────────────────────────────────────────────────
  /** @deprecated Backward compatible */
  initTransaction(e) {
    return this.recording.initTransaction(e);
  }
  /** @deprecated Backward compatible */
  startRecording(e) {
    return this.recording.startRecording(e);
  }
  /**
   * Creates a session and starts recording in one step.
   * This is the recommended method for new integrations.
   */
  startRecordingV2(e) {
    return this.recording.startRecordingV2(e);
  }
  startRecordingForExistingSession(e) {
    return this.recording.startRecordingForExistingSession(e);
  }
  pauseRecording() {
    return this.recording.pauseRecording();
  }
  resumeRecording() {
    return this.recording.resumeRecording();
  }
  /**
   * Lifts the maximum chunk limit so recording can continue uploading audio
   * chunks beyond the default cap.
   */
  forceAllowMoreChunks() {
    return this.recording.forceAllowMoreChunks();
  }
  endRecording() {
    return this.recording.endRecording();
  }
  getSessionStatus(e, n) {
    return this.recording.getSessionStatus(e, n);
  }
  retryUploadRecording() {
    return this.recording.retryUploadRecording();
  }
  cancelSession(e) {
    return this.recording.cancelSession(e);
  }
  /**
   * Upload a pre-recorded audio file to an existing session's upload URL.
   *
   * Client flow:
   * 1. createSession() — via sessions.createSession()
   * 2. processPreRecordedAudio(upload, audioFile, audioFileName) — this method
   * 3. endSession — via sessions.endSession()
   */
  processPreRecordedAudio(e) {
    return this.recording.processPreRecordedAudio(e);
  }
  /** @deprecated Backward compatible */
  commitTransactionCall() {
    return this.recording.commitTransactionCall();
  }
  /** @deprecated Backward compatible */
  stopTransactionCall() {
    return this.recording.stopTransactionCall();
  }
  // ─── Widget ───────────────────────────────────────────────────────────────
  startForPatient(e) {
    return this.widgetManager ? this.widgetManager.startForPatient(e) : Promise.reject(
      new Error("[EkaScribe] Widget is not enabled. Set widget.enabled: true in config.")
    );
  }
  // ─── Output ────────────────────────────────────────────────────────────────
  /** @deprecated Backward compatible */
  getTemplateOutput(e) {
    return this.output.getTemplateOutput(e);
  }
  /** @deprecated Backward compatible */
  getOutputTranscription(e) {
    return this.output.getOutputTranscription(e);
  }
  getChunkTranscript(e, n) {
    return this.output.getChunkTranscript(e, n);
  }
  /** @deprecated Backward compatible */
  pollSessionOutput(e) {
    return this.output.pollSessionOutput(e);
  }
  // ─── Callbacks ─────────────────────────────────────────────────────────────
  registerCallback(e, n) {
    this.callbackRegistry.register(e, n), e !== "onTokenRequired" && this.allianceClient.registerCallback(e, n);
  }
  removeCallback(e, n) {
    this.callbackRegistry.remove(e, n), e !== "onTokenRequired" && this.allianceClient.removeCallback(e, n);
  }
  // ─── Auth ──────────────────────────────────────────────────────────────────
  /** @future Rename to setAccessToken(token: string) once existing clients migrate */
  updateAuthTokens({ access_token: e }) {
    this.config.access_token = e, this.transport.setAuthToken(e), this.allianceClient.setAccessToken(e);
  }
  // ─── Compatibility ─────────────────────────────────────────────────────────
  async runSystemCompatibilityTest(e) {
    return new _u(this.transport, this.hosts).runCompatibilityTest(e);
  }
  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  async resetInstance() {
    this.widgetManager && (this.widgetManager.destroy(), this.widgetManager = null), await this.recording.reset(), this.callbackRegistry.removeAll(), O.instance = null;
  }
  // ─── Private ───────────────────────────────────────────────────────────────
  async handleUnauthorized() {
    const n = this.callbackRegistry.dispatch("onTokenRequired"), r = new Promise(
      (i, o) => setTimeout(
        () => o(new Error("[EkaScribe] Token refresh timed out after 10s.")),
        1e4
      )
    ), s = await Promise.race([n, r]);
    return s && this.updateAuthTokens({ access_token: s }), s;
  }
};
O.instance = null;
let Vt = O;
const yd = (t) => Vt.getInstance(t);
export {
  Zl as API_STATUS,
  nu as CALLBACK_TYPE,
  v as COMPATIBILITY_TEST_STATUS,
  te as COMPATIBILITY_TEST_TYPE,
  y as ERROR_CODE,
  tu as PROCESSING_STATUS,
  eu as RESULT_STATUS,
  Ql as TEMPLATE_ID,
  Ke as TEMPLATE_TYPE,
  Jl as VAD_STATUS,
  g as WidgetState,
  Sd as createWorkerBlobUrl,
  yd as getEkaScribeInstance,
  kd as getWorkerUrl
};
