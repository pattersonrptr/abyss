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

Everything is stored encrypted. The server never sees the plaintext — only the browser does, using a client-side XOR cipher. The `.bin` files on disk are unreadable without the key.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | HTML 4.01 · CSS2 · Vanilla JS (ES5, no frameworks) |
| HTTP | `XMLHttpRequest` (the original, pre-`fetch`) |
| Backend | Perl 5 CGI script |
| Storage | Fixed-size binary records (`pack`/`unpack`/`seek`) — like `fread`/`fwrite`/`fseek` in C |
| Crypto | XOR stream cipher + Base64, client-side only |
| Web server | Apache 2.4 with `mod_cgi` |

**This is intentionally simple and deliberately old-fashioned.** The older approaches — CGI scripts, binary flat files, XOR ciphers, ES5 JavaScript, HTML 4.01 — are used on purpose, partly out of nostalgia for the early web, and partly as a personal experiment: *how far can you go with the bare minimum?* There is no framework, no build step, no dependency manager. Just files.

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

### Encryption

Each message is encrypted in the browser before being sent:

1. A **nonce** is generated: `ts` = current Unix timestamp (milliseconds → seconds)
2. The keystream is `KEY + String(nonce)` — unique per message, prevents keystream reuse
3. Each byte is XOR'd with the corresponding keystream byte
4. The result is Base64-encoded and sent to the server

The server stores the ciphertext as-is. On display, the browser decrypts using the same key + the stored `ts`.

The key is visible in `script.js` by design — client-side JavaScript cannot hide secrets from the browser. Its purpose is to protect the `.bin` files from someone who gains direct filesystem access to the server (FTP breach, etc.), not from the browser user.

### The `ts` field dual role

The `ts` (Unix timestamp) stored in each record serves two purposes:
- **Nonce** — makes the keystream unique, preventing the XOR reuse attack
- **Date** — the frontend formats it as `dd/mm/yyyy` for display

---

## Resetting data

To wipe all questions and answers and start fresh:

```powershell
Remove-Item data\*.bin
perl seed.pl
```

---

## License

No rights reserved. Copy freely. B-)
