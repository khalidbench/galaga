/**
 * Journal backend — Google Apps Script
 *
 * Holds: posts, photos (in Drive), read receipts, login log, password hashes.
 * The GitHub page is only a shell; nothing private lives there.
 *
 * SETUP (one time):
 *   1. Fill in both passwords below.
 *   2. Run the function  setup  once (Run ▸ setup). Approve the permissions.
 *   3. DELETE both passwords from this file again and save. Only salted
 *      SHA-256 hashes are kept, in Script Properties.
 *   4. Deploy ▸ New deployment ▸ Web app:
 *        Execute as: Me       Who has access: Anyone
 *      Copy the /exec URL into CONFIG.SCRIPT_URL in index.html.
 */

var SETUP = {
  ADMIN_PASSWORD: "",   // your password  — fill in, run setup(), then erase
  SALIMA_PASSWORD: ""   // her password   — fill in, run setup(), then erase
};

var TOKEN_DAYS = 180;   // how long a login stays valid on a device

/* ---------------------------------------------------------------- setup */

function setup() {
  if (!SETUP.ADMIN_PASSWORD || !SETUP.SALIMA_PASSWORD) {
    throw new Error("Fill in ADMIN_PASSWORD and SALIMA_PASSWORD in SETUP first, then run setup again.");
  }
  if (SETUP.ADMIN_PASSWORD === SETUP.SALIMA_PASSWORD) {
    throw new Error("The two passwords must be different.");
  }
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty("salt");
  if (!salt) { salt = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("salt", salt); }
  props.setProperty("hash_admin", hash_(SETUP.ADMIN_PASSWORD, salt));
  props.setProperty("hash_salima", hash_(SETUP.SALIMA_PASSWORD, salt));
  ensureStorage_();
  Logger.log("Setup done. Now ERASE both passwords from the SETUP block and save the file.");
}

/** Optional: run this any time to change a password. Fill SETUP first, run, erase. */
function changePasswords() { setup(); }

function hash_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "::" + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("");
}

function ensureStorage_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty("ssId");
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create("Journal Data (do not share)");
    props.setProperty("ssId", ss.getId());
  }
  ["Posts", "Reads", "Logins"].forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  var def = ss.getSheetByName("Sheet1");
  if (def && ss.getSheets().length > 3) ss.deleteSheet(def);

  var folderId = props.getProperty("folderId");
  var ok = false;
  if (folderId) { try { DriveApp.getFolderById(folderId); ok = true; } catch (e) {} }
  if (!ok) {
    var folder = DriveApp.createFolder("Journal Photos (do not share)");
    props.setProperty("folderId", folder.getId());
  }
}

/* ---------------------------------------------------------------- http */

function doGet() {
  return out_({ ok: true, service: "journal", time: new Date().toISOString() });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return out_({ ok: false, error: "bad request" }); }

  try {
    switch (req.action) {
      case "login":      return out_(login_(req));
      case "logout":     return out_(logout_(req));
      case "getPosts":   return out_(requireAuth_(req) && getPosts_());
      case "getPhoto":   return out_(requireAuth_(req) && getPhoto_(req));
      case "markRead":   return out_(markRead_(req));
      case "addPost":    return out_(requireAdmin_(req) && addPost_(req));
      case "updatePost": return out_(requireAdmin_(req) && updatePost_(req));
      case "deletePost": return out_(requireAdmin_(req) && deletePost_(req));
      case "adminData":  return out_(requireAdmin_(req) && adminData_());
      default:           return out_({ ok: false, error: "unknown action" });
    }
  } catch (err) {
    var msg = String(err && err.message || err);
    if (msg === "auth") return out_({ ok: false, error: "auth" });
    if (msg === "wrong") return out_({ ok: false, error: "wrong" });
    return out_({ ok: false, error: "server: " + msg });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------- auth */

function login_(req) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty("salt");
  if (!salt) throw new Error("setup has not been run");
  var h = hash_(String(req.password || ""), salt);
  var account = null;
  if (h === props.getProperty("hash_admin")) account = "admin";
  else if (h === props.getProperty("hash_salima")) account = "salima";

  logLogin_(account, req);

  if (!account) { Utilities.sleep(800); throw new Error("wrong"); }

  var token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  props.setProperty("tok_" + token, JSON.stringify({ account: account, created: Date.now() }));
  return { ok: true, token: token, account: account };
}

function logout_(req) {
  if (req.token) PropertiesService.getScriptProperties().deleteProperty("tok_" + req.token);
  return { ok: true };
}

function tokenAccount_(req) {
  if (!req.token) return null;
  var raw = PropertiesService.getScriptProperties().getProperty("tok_" + req.token);
  if (!raw) return null;
  var t = JSON.parse(raw);
  if (Date.now() - t.created > TOKEN_DAYS * 86400000) {
    PropertiesService.getScriptProperties().deleteProperty("tok_" + req.token);
    return null;
  }
  return t.account;
}

function requireAuth_(req) {
  var a = tokenAccount_(req);
  if (!a) throw new Error("auth");
  return true;
}

function requireAdmin_(req) {
  if (tokenAccount_(req) !== "admin") throw new Error("auth");
  return true;
}

function logLogin_(account, req) {
  try {
    ensureStorage_();
    var sh = sheet_("Logins");
    sh.appendRow([
      new Date().toISOString(),
      account || "",
      account ? "yes" : "no",
      String(req.ip || "").slice(0, 60),
      String(req.city || "").slice(0, 80),
      String(req.country || "").slice(0, 80),
      String(req.device || "").slice(0, 80),
      String(req.userAgent || "").slice(0, 300)
    ]);
    var extra = sh.getLastRow() - 1000;
    if (extra > 0) sh.deleteRows(2, extra); // keep the latest ~1000
  } catch (e) { /* logging must never block login */ }
}

/* ---------------------------------------------------------------- data */

function sheet_(name) {
  var ssId = PropertiesService.getScriptProperties().getProperty("ssId");
  return SpreadsheetApp.openById(ssId).getSheetByName(name);
}

function getPosts_() {
  var rows = sheet_("Posts").getDataRange().getValues();
  var posts = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    posts.push({
      id: String(rows[i][0]),
      created: String(rows[i][1]),
      updated: String(rows[i][2] || ""),
      text: String(rows[i][3] || ""),
      photos: rows[i][4] ? JSON.parse(rows[i][4]) : []
    });
  }
  posts.sort(function (a, b) { return new Date(b.created) - new Date(a.created); });
  return { ok: true, posts: posts };
}

function savePhoto_(dataUrl) {
  var m = String(dataUrl).match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) throw new Error("bad photo");
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], "journal-" + Utilities.getUuid() + ".jpg");
  var folderId = PropertiesService.getScriptProperties().getProperty("folderId");
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  return file.getId();
}

function getPhoto_(req) {
  var file = DriveApp.getFileById(String(req.photoId));
  var blob = file.getBlob();
  var data = "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
  return { ok: true, data: data };
}

function normalizePhotos_(photos) {
  var list = [];
  (photos || []).forEach(function (p) {
    if (p.id) list.push({ id: String(p.id), caption: String(p.caption || "").slice(0, 300) });
    else if (p.data) list.push({ id: savePhoto_(p.data), caption: String(p.caption || "").slice(0, 300) });
  });
  return list;
}

function addPost_(req) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    ensureStorage_();
    var photos = normalizePhotos_(req.photos);
    sheet_("Posts").appendRow([
      Utilities.getUuid(),
      new Date().toISOString(),
      "",
      String(req.text || ""),
      JSON.stringify(photos)
    ]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function updatePost_(req) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_("Posts");
    var rows = sh.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(req.id)) {
        var oldPhotos = rows[i][4] ? JSON.parse(rows[i][4]) : [];
        var photos = normalizePhotos_(req.photos);
        var keep = {};
        photos.forEach(function (p) { keep[p.id] = true; });
        oldPhotos.forEach(function (p) {
          if (!keep[p.id]) { try { DriveApp.getFileById(p.id).setTrashed(true); } catch (e) {} }
        });
        sh.getRange(i + 1, 3).setValue(new Date().toISOString());
        sh.getRange(i + 1, 4).setValue(String(req.text || ""));
        sh.getRange(i + 1, 5).setValue(JSON.stringify(photos));
        return { ok: true };
      }
    }
    throw new Error("post not found");
  } finally { lock.releaseLock(); }
}

function deletePost_(req) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_("Posts");
    var rows = sh.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(req.id)) {
        var photos = rows[i][4] ? JSON.parse(rows[i][4]) : [];
        photos.forEach(function (p) { try { DriveApp.getFileById(p.id).setTrashed(true); } catch (e) {} });
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function markRead_(req) {
  var account = tokenAccount_(req);
  if (!account) throw new Error("auth");
  if (account !== "salima") return { ok: true }; // only her reads are recorded
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_("Reads");
    var rows = sh.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(req.postId) && String(rows[i][1]) === account) return { ok: true };
    }
    sh.appendRow([
      String(req.postId),
      account,
      new Date().toISOString(),
      String(req.device || "").slice(0, 80)
    ]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function adminData_() {
  var reads = sheet_("Reads").getDataRange().getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { postId: String(r[0]), account: String(r[1]), time: String(r[2]), device: String(r[3] || "") }; });

  var lrows = sheet_("Logins").getDataRange().getValues().filter(function (r) { return r[0]; });
  if (lrows.length > 300) lrows = lrows.slice(lrows.length - 300);
  var logins = lrows.map(function (r) {
    return {
      time: String(r[0]), account: String(r[1] || ""), success: String(r[2]) === "yes",
      ip: String(r[3] || ""), city: String(r[4] || ""), country: String(r[5] || ""),
      device: String(r[6] || "")
    };
  });

  return { ok: true, reads: reads, logins: logins };
}
