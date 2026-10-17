# Journal — setup guide

A private, password-protected journal at
**https://khalidbench.github.io/galaga/journal/**

- **Salima's password** opens the journal (reading view).
- **Your password** opens the same journal **plus** the admin desk
  (write posts, read receipts, login log).

All content — posts, photos, passwords, logs — lives in **your Google
account** (a Google Sheet + Drive folder managed by an Apps Script).
The public GitHub repo contains only this shell page. Nothing private.

---

## One-time setup (about 5 minutes)

### 1. Create the Apps Script

1. Go to **https://script.google.com** (logged in to your Google account)
   and click **+ New project**.
2. Name the project **Journal** (top-left, click "Untitled project").
3. Delete the sample code and paste in the entire contents of
   [`apps-script/Code.gs`](apps-script/Code.gs).

### 2. Set the two passwords

1. At the top of the pasted code, fill in:
   ```
   var SETUP = {
     ADMIN_PASSWORD: "your-secret-password",
     SALIMA_PASSWORD: "her-secret-password"
   };
   ```
   Pick two *different*, decent passwords (a short phrase works well).
2. Save (⌘S), then in the toolbar choose the function **setup** and
   click **Run**. Approve the permissions Google asks for
   (it needs Sheets + Drive in *your* account only).
3. When the log says *"Setup done"*: **erase both passwords** from the
   SETUP block (leave the empty quotes) and save again.
   From now on only salted SHA-256 hashes exist, stored in the script's
   private properties. The passwords are nowhere on disk.

> To change a password later: fill the SETUP block in again, run
> **setup**, erase. Old logins stay valid until their token expires.

### 3. Deploy as a web app

1. Click **Deploy ▸ New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Settings — these two matter:
   - **Execute as: Me**
   - **Who has access: Anyone**
4. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

*"Anyone" only means anyone may knock on the door — every request is
still checked against the passwords/tokens inside the script.*

### 4. Connect the page

In `journal/index.html`, near the bottom, paste the URL:

```js
const CONFIG = {
  SCRIPT_URL: "https://script.google.com/macros/s/XXXX/exec",
  ...
};
```

Commit and push. Done — open
https://khalidbench.github.io/galaga/journal/ and log in.

---

## Everyday use

- **Write a post:** open the journal with your password → pencil button
  (bottom-right) → write, *Add photos*, *Publish*. Works great from the
  phone; photos are compressed automatically.
- **Read receipts:** desk → **Reads** — each entry shows
  ✓ read (when, which device) or ○ not yet read.
- **Login log:** desk → **Logins** — every successful *and failed*
  login with time, country/city, IP and device.
- Salima just opens the link, types her password once, and stays
  logged in on her device (~6 months).

## Updating the script later

If you ever change `Code.gs`: paste the new code, then
**Deploy ▸ Manage deployments ▸ ✎ (edit) ▸ Version: New version ▸ Deploy**.
(Creating a *new* deployment would change the URL — editing keeps it.)

## Honest limitations

- IP location is approximate (country is reliable, city less so;
  VPNs and mobile networks can be off).
- "Device" is what the browser reports: *iPhone · Safari* — model
  class, not a specific phone.
- A read receipt means the entry was on screen for a couple of
  seconds — the honest maximum any read receipt can promise.
- First load of the day can take a second or two while Google wakes
  the script up. Normal.
