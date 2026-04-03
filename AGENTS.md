# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a Node.js/Express web app (Aviation Realism Network) for VTOL VR ATC lobbies. It includes a Discord bot, MongoDB-backed data, and EJS-rendered pages.

### Running the dev server

```bash
npm start        # or: node server.js
```

The server listens on port 3000 by default (`PORT` env var overrides).

### Services and external dependencies

- **MongoDB** (`MONGODB_URI`): Required for user accounts, applications, and events. Without it the server starts but DB-dependent routes will error.
- **Discord bot** (`Discord_TOKEN`): Logs in inside `app.listen()`. Without a valid token the bot login fails (caught & logged) but the web server still runs.
- **SendGrid** (`SENDGRID_API_KEY`): Optional — only needed for password-reset emails.

The web UI renders and serves pages even without MongoDB or Discord configured; routes that need DB access will return errors but won't crash the process.

### Warnings on startup

`express-rate-limit` emits `ERR_ERL_KEY_GEN_IPV6` validation warnings at startup. These are non-fatal and do not block the server.

### Linting & tests

There is no linter or test suite configured in this repo (`npm test` echoes an error stub). The `devDependencies` only include `conventional-changelog-cli`.

### Gotchas

- The project uses CommonJS modules (`"type": "commonjs"` in `package.json`).
- `canvas` (node-canvas) is a native addon dependency; `npm install` compiles it. System build tools (`build-essential`, `pkg-config`, `libcairo2-dev`, `libjpeg-dev`, `libpango1.0-dev`, `libgif-dev`, `librsvg2-dev`) must be present. The Cloud Agent VM already has these.
- No `.env` file is committed. Create one or export env vars as needed. The server uses `dotenv` and gracefully handles missing vars.
