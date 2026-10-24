![Perl](https://img.shields.io/badge/Perl-39457E?style=flat&logo=perl&logoColor=white)
![CGI](https://img.shields.io/badge/CGI-backend-blue?style=flat)
![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)
![Status](https://img.shields.io/badge/status-experimental-orange?style=flat)

# Looking into the Abyss

> *"If you gaze long into an abyss, the abyss also gazes into you."*  
> — Friedrich Nietzsche

An anonymous social experiment. Ask a philosophical, existential, or ethical question. Other people answer. No names. No profiles. No algorithm. No likes.

Just questions and answers floating in the void.

---

## What it is

A single-page web app with a Perl CGI backend. Visitors can:

- Browse questions posted by others
- Click into a question and read answers
- Post their own question anonymously
- Answer any question anonymously
- Pick a random question (the abyss chooses for you)

Messages are stored obfuscated with a 90s-style XOR cipher applied in the browser, so the `.bin` files on disk are not plain text. This is **obfuscation, not real encryption** — see [Obfuscation](#obfuscation-not-encryption).

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | HTML 4.01 · CSS2 · Vanilla JS (ES5, no frameworks) |
| HTTP | `XMLHttpRequest` (the original, pre-`fetch`) |
| Backend | Perl 5 CGI script |
| Storage | Fixed-size binary records (`pack`/`unpack`/`seek`) — like `fread`/`fwrite`/`fseek` in C |
| Obfuscation | XOR cipher + Base64, client-side only (not secure — by design) |
| Web server | Apache 2.4 with `mod_cgi` |

**This is intentionally simple and deliberately old-fashioned.** The older approaches — CGI scripts, binary flat files, XOR ciphers, ES5 JavaScript, HTML 4.01 — are used on purpose, partly out of nostalgia for the early web, and partly as a personal experiment: *how far can you go with the bare minimum?* There is no framework, no build step, no dependency manager. Just files.

It started as an experiment in AI-assisted coding: recreating how people built websites at the end of the 90s, with the tools of the time.

---

## Project structure

```
.
├── index.html          # SPA shell — all views live here
├── style.css           # Dark/light theme, full layout
├── script.js           # All frontend logic: XHR, crypto, rendering
├── .htaccess           # Disables browser caching for JS/CSS
├── cgi-bin/
│   └── api.pl          # Perl CGI backend (actions: list, view, question, answer)
├── seed.pl             # CLI script to populate initial data
└── data/               # Binary data files (git-ignored, recreated by seed.pl)
    ├── questions.bin
    └── answers.bin
```

---

## How to run locally (Windows + XAMPP)

### 1. Install dependencies

- [XAMPP](https://www.apachefriends.org/) — provides Apache 2.4
- [Strawberry Perl](https://strawberryperl.com/) — `winget install StrawberryPerl.StrawberryPerl`

### 2. Clone the repo

```powershell
git clone <repo-url> C:\xampp\htdocs\abyss
cd C:\xampp\htdocs\abyss
```

Or copy the folder manually into `C:\xampp\htdocs\`.

### 3. Enable CGI in Apache

In `C:\xampp\apache\conf\httpd.conf`, make sure these lines are present and uncommented:

```apache
LoadModule cgi_module modules/mod_cgi.so

<Directory "C:/xampp/htdocs">
    Options Indexes FollowSymLinks ExecCGI
    AllowOverride All
    Require all granted
</Directory>

AddHandler cgi-script .pl
```

Restart Apache after any `httpd.conf` changes.

### 4. Set the Perl shebang

The first line of `cgi-bin/api.pl` must point to your Perl binary:

```perl
#!C:/Strawberry/perl/bin/perl.exe
```

Verify the path with: `Get-Command perl | Select-Object -ExpandProperty Source`

### 5. Create the data directory and seed initial content

```powershell
mkdir data
perl seed.pl
```

This creates `data/questions.bin` and `data/answers.bin` with 5 sample questions and 7 answers.

### 6. Open in browser

```
http://localhost/
```

If the project is in a subfolder (`htdocs/abyss/`), use `http://localhost/abyss/`.

---

## How it works internally

### Binary storage

Records are fixed-size, seekable by ID — identical in concept to a C struct array written to disk:

```c
// Question: 1012 bytes
struct Question { uint32_t id; uint32_t ts; char text[1004]; };

// Answer: 1016 bytes  
struct Answer   { uint32_t id; uint32_t q_id; uint32_t ts; char text[1004]; };
```

Reading record N is a single `seek((N-1) * sizeof, SEEK_SET)` — O(1), no scanning.

### Obfuscation (not encryption)

Each message is XOR-obfuscated in the browser before being sent:

1. A **nonce** is generated: `ts` = current Unix timestamp (milliseconds → seconds)
2. The keystream is `KEY + String(nonce)` — unique per message, prevents keystream reuse
3. Each byte is XOR'd with the corresponding keystream byte
4. The result is Base64-encoded and sent to the server

The server stores the ciphertext as-is. On display, the browser decrypts using the same key + the stored `ts`.

**This provides no real confidentiality.** The key is hardcoded in `script.js`, which is public in this repo and served to every visitor, and the nonce (`ts`) is stored in plain next to each record. Anyone with the files can decrypt everything. Repeating-key XOR is also breakable by frequency analysis even without the key. It is kept as a deliberate 90s-style touch: it only keeps the `.bin` files from being read as plain text at a glance. Real protection would need server-side encryption with a secret key that never leaves the server, or proper end-to-end crypto (e.g. Web Crypto AES-GCM).

### The `ts` field dual role

The `ts` (Unix timestamp) stored in each record serves two purposes:
- **Nonce** — varies the keystream per message (but it is public, so it adds no secrecy)
- **Date** — the frontend formats it as `dd/mm/yyyy` for display

---

## Resetting data

To wipe all questions and answers and start fresh:

```powershell
Remove-Item data\*.bin
perl seed.pl
```

---

## Before going live (Tor hidden service)

The plan is to publish the Abyss as a `.onion` site. Anonymous posting with no accounts attracts spam and illegal content, and the operator is responsible for what is hosted. These must exist **before** it goes public:

### 1. Moderation queue (required)

- New questions and answers go to a `pending` state and are **not shown** until approved.
- An admin page (protected, not linked from the public UI) lists pending items with approve / reject.
- Rejected items are deleted from disk, not just hidden.
- Storage idea, keeping the fixed-record style: a `status` byte in each record (`0 = pending`, `1 = approved`, `2 = rejected`), or a separate `pending.bin`.
- Open question: there are no identities, so "trusted posters" can't be auto-approved. Start with **manual approval for everything**; revisit if volume grows.

### 2. Abuse limits

- Rate limit per circuit/time window (no IPs on Tor — limit globally per minute, and cap pending queue size).
- Max length for questions and answers (already fixed-size records — enforce on the server, not just the UI).
- Simple word/regex blocklist that sends matches straight to rejected.

### 3. Operator safety

- Run the onion service isolated (container or VM), no other services on the same host.
- No logs that could identify visitors; no third-party resources (fonts, CDNs) in the page.
- Decide what to do with reported illegal content (delete + keep no copy) and write a short public rules page.

### 4. Real confidentiality (optional)

The current XOR is only obfuscation (see above). If the stored data needs real protection, encrypt server-side with a key kept outside the web root, or drop the pretence and store plain text behind proper filesystem permissions.

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

You are free to use, modify, and distribute this software, provided that any modified version that is run over a network also makes its source code available to users under the same license.