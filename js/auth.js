/* Firebase Authentication. The web config in BETHANY_FIREBASE is public. */
(function () {
  var user = null;
  var ready = false;
  var fb = null;
  var auth = null;
  var ERR = {
    en: {
      "auth/invalid-email": "That email doesn't look right.",
      "auth/missing-email": "Enter your email.",
      "auth/missing-password": "Enter a password.",
      "auth/user-disabled": "This account is turned off. Ask Daniel.",
      "auth/user-not-found": "No account uses that email yet.",
      "auth/wrong-password": "That password isn't right.",
      "auth/invalid-credential": "That email or password isn't right.",
      "auth/email-already-in-use": "An account already uses that email. Sign in instead.",
      "auth/weak-password": "Use at least 8 characters.",
      "auth/too-many-requests": "Too many tries. Wait a moment and try again.",
      "auth/popup-closed-by-user": "The Google window was closed before signing in.",
      "auth/popup-blocked": "The browser blocked the Google window. Allow popups and try again.",
      "auth/network-request-failed": "Couldn't reach Google. Check your connection.",
      "auth/invalid-api-key": "Sign-in isn't connected yet.",
      "auth/operation-not-allowed": "That sign-in method isn't turned on yet.",
      "config": "Sign-in isn't connected yet."
    },
    ko: {
      "auth/invalid-email": "이메일 형식이 맞지 않습니다.",
      "auth/missing-email": "이메일을 입력해 주세요.",
      "auth/missing-password": "비밀번호를 입력해 주세요.",
      "auth/user-disabled": "이 계정은 꺼져 있습니다. Daniel에게 문의하세요.",
      "auth/user-not-found": "그 이메일로 된 계정이 없습니다.",
      "auth/wrong-password": "비밀번호가 맞지 않습니다.",
      "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않습니다.",
      "auth/email-already-in-use": "이미 그 이메일의 계정이 있습니다. 로그인해 주세요.",
      "auth/weak-password": "8자 이상 사용해 주세요.",
      "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 해 주세요.",
      "auth/popup-closed-by-user": "로그인 전에 Google 창이 닫혔습니다.",
      "auth/popup-blocked": "브라우저가 Google 창을 막았습니다. 팝업을 허용해 주세요.",
      "auth/network-request-failed": "Google에 연결하지 못했습니다. 인터넷을 확인해 주세요.",
      "auth/invalid-api-key": "로그인이 아직 연결되지 않았습니다.",
      "auth/operation-not-allowed": "그 로그인 방법은 아직 켜지지 않았습니다.",
      "config": "로그인이 아직 연결되지 않았습니다."
    }
  };
  function lang() { return (typeof appLang === "function" && appLang() === "ko") ? "ko" : "en"; }
  window.bethanyAuthMessage = function (code) {
    var table = ERR[lang()] || ERR.en;
    return table[code] || table["auth/invalid-credential"] || code;
  };
  window.bethanyUser = function () { return user; };
  window.bethanyAuthReady = function () { return ready; };
  window.bethanyIdToken = function () {
    if (Object.prototype.hasOwnProperty.call(window, "BETHANY_MOCK_AUTH")) return Promise.resolve(user ? "mock-token" : "");
    if (auth && auth.currentUser) return auth.currentUser.getIdToken();
    return Promise.resolve("");
  };
  function finish() {
    ready = true;
    if (typeof window.bethanyOnAuth === "function") window.bethanyOnAuth();
  }
  function setUser(next) { user = next; finish(); }
  function providerList(u) {
    var list = [];
    if (u && u.providers && u.providers.length) return u.providers.slice();
    if (u && u.providerData) {
      u.providerData.forEach(function (p) { if (p && p.providerId && list.indexOf(p.providerId) < 0) list.push(p.providerId); });
    }
    if (!list.length && u && u.provider) list.push(u.provider);
    if (!list.length) list.push("password");
    return list;
  }
  function fromFirebase(u) {
    if (!u) return null;
    var providers = providerList(u);
    return { uid: u.uid, email: u.email || "", displayName: u.displayName || "", provider: providers[0], providers: providers };
  }
  function useMock() { return Object.prototype.hasOwnProperty.call(window, "BETHANY_MOCK_AUTH"); }
  function mockReject() {
    var code = window.BETHANY_MOCK_AUTH_ERROR;
    if (!code) return null;
    window.BETHANY_MOCK_AUTH_ERROR = "";
    return code;
  }
  var pendingLink = "";
  function fail(err) {
    var code = err && err.code ? err.code : "config";
    return Promise.reject(code);
  }
  window.bethanySignInGoogle = function () {
    if (!fb || !auth) return Promise.reject("config");
    var provider = new fb.GoogleAuthProvider();
    return fb.signInWithPopup(auth, provider).then(function (res) { return fromFirebase(res.user); }).catch(fail);
  };
  window.bethanySignInEmail = function (email, password) {
    if (!fb || !auth) return Promise.reject("config");
    return fb.signInWithEmailAndPassword(auth, email, password).then(function (res) { return fromFirebase(res.user); }).catch(fail);
  };
  window.bethanyCreateEmail = function (email, password) {
    if (!fb || !auth) return Promise.reject("config");
    return fb.createUserWithEmailAndPassword(auth, email, password).then(function (res) { return fromFirebase(res.user); }).catch(fail);
  };
  window.bethanyReset = function (email) {
    if (useMock()) {
      var code = mockReject();
      if (code) return Promise.reject(code);
      return Promise.resolve();
    }
    if (!fb || !auth) return Promise.reject("config");
    return fb.sendPasswordResetEmail(auth, email).catch(fail);
  };
  window.bethanySetPendingPassword = function (pw) { pendingLink = pw || ""; };
  window.bethanyTakePendingPassword = function () { var pw = pendingLink; pendingLink = ""; return pw; };
  window.bethanyLinkPassword = function (password) {
    if (useMock()) {
      var code = mockReject();
      if (code) return Promise.reject(code);
      if (!user.providers) user.providers = [];
      if (user.providers.indexOf("password") < 0) user.providers.push("password");
      if (window.BETHANY_MOCK_AUTH) window.BETHANY_MOCK_AUTH.providers = user.providers.slice();
      return Promise.resolve(user);
    }
    if (!fb || !auth || !auth.currentUser) return Promise.reject("config");
    if (!password || String(password).length < 8) return Promise.reject("auth/weak-password");
    var cred = fb.EmailAuthProvider.credential(auth.currentUser.email, password);
    return fb.linkWithCredential(auth.currentUser, cred).then(function () {
      return auth.currentUser.reload().then(function () { setUser(fromFirebase(auth.currentUser)); return user; });
    }).catch(fail);
  };
  window.bethanyChangePassword = function (current, next) {
    if (useMock()) {
      var code = mockReject();
      if (code) return Promise.reject(code);
      return Promise.resolve();
    }
    if (!fb || !auth || !auth.currentUser) return Promise.reject("config");
    if (!next || String(next).length < 8) return Promise.reject("auth/weak-password");
    var cred = fb.EmailAuthProvider.credential(auth.currentUser.email, current);
    return fb.reauthenticateWithCredential(auth.currentUser, cred).then(function () {
      return fb.updatePassword(auth.currentUser, next);
    }).catch(fail);
  };
  window.bethanyReauthGoogle = function () {
    if (useMock()) {
      var code = mockReject();
      if (code) return Promise.reject(code);
      return Promise.resolve(user);
    }
    if (!fb || !auth || !auth.currentUser) return Promise.reject("config");
    var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    var provider = new fb.GoogleAuthProvider();
    if (standalone) return fb.reauthenticateWithRedirect(auth, provider);
    return fb.reauthenticateWithPopup(auth, provider).then(function () {
      return auth.currentUser.reload().then(function () { setUser(fromFirebase(auth.currentUser)); return user; });
    }).catch(fail);
  };
  window.bethanySignOut = function () {
    if (Object.prototype.hasOwnProperty.call(window, "BETHANY_MOCK_AUTH")) {
      user = null;
      window.BETHANY_MOCK_AUTH = null;
      finish();
      return Promise.resolve();
    }
    if (!fb || !auth) { user = null; finish(); return Promise.resolve(); }
    return fb.signOut(auth);
  };
  window.bethanyUpdateName = function (name) {
    if (useMock()) {
      if (user) user.displayName = name;
      if (window.BETHANY_MOCK_AUTH) window.BETHANY_MOCK_AUTH.displayName = name;
      return Promise.resolve();
    }
    if (!fb || !auth || !auth.currentUser) return Promise.resolve();
    return fb.updateProfile(auth.currentUser, { displayName: name }).then(function () {
      if (user) user.displayName = name;
    }).catch(function () {});
  };

  if (Object.prototype.hasOwnProperty.call(window, "BETHANY_MOCK_AUTH")) {
    user = fromFirebase(window.BETHANY_MOCK_AUTH);
    ready = true;
    return;
  }
  var cfg = window.BETHANY_FIREBASE || {};
  if (!cfg.apiKey) { ready = true; return; }
  Promise.all([
    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js")
  ]).then(function (mods) {
    fb = mods[1];
    auth = fb.getAuth(mods[0].initializeApp(cfg));
    return fb.setPersistence(auth, fb.browserLocalPersistence).then(function () {
      fb.onAuthStateChanged(auth, function (u) { setUser(fromFirebase(u)); });
    });
  }).catch(function () { ready = true; finish(); });
})();
