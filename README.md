# Code-Pilot

A scoped-down cloud IDE backend: on-demand, isolated Docker containers with a real, interactive terminal in the browser, connected over WebSocket.

## Status

**Core complete and verified live.** This is a deliberately scoped reconstruction, not a full production cloud IDE — see [Scope](#scope) below for exactly what's in and out.

## What it actually does

1. A browser connects to the server over WebSocket
2. The server spins up a fresh, isolated Docker container for that connection
3. An interactive shell inside that container is attached to the WebSocket
4. Keystrokes typed in the browser go into the container; output streams back in real time
5. When the browser disconnects (or the server shuts down), the container is destroyed

Every connection gets its own completely separate container — verified live by running two simultaneous browser tabs and confirming each has its own isolated filesystem (a file created in one session's `/tmp` is genuinely invisible to the other).

## Scope

**In scope:**
- Docker container orchestration via `dockerode` (create, exec, destroy)
- A real, live, bidirectional terminal over WebSocket using `@xterm/xterm`
- Per-session resource limits (256MB memory, 0.5 CPU)
- Clean session teardown on disconnect and on server shutdown (SIGINT/SIGTERM)

**Explicitly out of scope for this version:**
- Kubernetes orchestration (this uses local Docker directly)
- AWS / cloud deployment
- Authentication or multi-tenant access control
- Persistent storage across sessions
- LLM integration
- A full file-management UI (terminal-only for now)

This is a deliberate trade-off: building a genuinely working, well-tested core (orchestration + live terminal) rather than a shallow surface over many unfinished features.

## Tech Stack

- **Node.js 26** / Express
- **dockerode** — Docker Remote API client (pure JS, no native compilation)
- **ws** — WebSocket server
- **@xterm/xterm** + **@xterm/addon-attach** — browser terminal UI

## A deliberate dependency decision

The original design for this kind of project typically uses `node-pty` to allocate a pseudo-terminal on the host. This rebuild deliberately avoids it.

In June 2026, a live npm supply-chain attack ("Phantom Gyp" / Miasma worm) began specifically targeting packages that trigger native builds via `binding.gyp`/`node-gyp` during `npm install` — exactly the category `node-pty` falls into, since it requires C++ compilation. Rather than add that exposure, this project uses `dockerode`'s own `container.exec()` with `Tty: true`, which lets the **Docker daemon itself** allocate the PTY inside the container. The result: every dependency in this project (`express`, `ws`, `dockerode`) is pure JavaScript, with zero native compilation step on the host.

This is also architecturally cleaner, not just safer — the PTY lives where it logically belongs (inside the sandboxed container), not on the host machine.

## Setup

### Prerequisites

```bash
brew install node
brew install --cask docker-desktop
open -a "Docker"
```

Wait for Docker Desktop to fully start (whale icon appears steady in the menu bar), then verify:

```bash
docker ps
```

### Run

```bash
git clone https://github.com/VirajReddy10/code-pilot.git
cd code-pilot
npm install
npm start
```

Open `http://localhost:3000` in a browser. The first run will pull the `node:22-alpine` sandbox image, which may take a minute.

## Try it

Once the page loads, click into the terminal and try:


node --version

whoami

cat /etc/os-release

You're running these commands genuinely inside an isolated Alpine Linux container, not your host machine.

## Architecture Notes

**Why `node:22-alpine` as the sandbox image**: small, fast to pull, and gives a real Node.js environment to experiment in — fitting the "cloud IDE" framing without needing a heavier base image.

**Why `AutoRemove: true`**: Docker cleans up each container automatically the moment it stops, so the server doesn't need to separately track and garbage-collect dead containers.

**Why explicit memory/CPU limits**: without them, a single session could exhaust the host's resources. This is the scoped-down version of the "isolated dev environment" safety property the original, fuller design handled via Kubernetes resource quotas.

## Real bugs found and fixed during development

- **Garbled terminal output**: status/error messages were initially sent as JSON over the same WebSocket `@xterm/addon-attach` uses for raw terminal bytes. The addon has no way to distinguish a control message from terminal output, so the JSON printed directly into the terminal as garbage. Fixed by removing those messages entirely — the shell prompt itself is sufficient readiness signal.
- **Wrong import paths**: `@xterm` packages ship both a UMD (`.js`) and ES module (`.mjs`) build. Browsers don't read `package.json`'s `"module"` field (that's a bundler-only convention) — had to reference the `.mjs` files explicitly to get native ES module imports working.
- **Orphaned containers on hard shutdown**: cleanup originally only ran on a graceful WebSocket close. Killing the server process (Ctrl+C) left containers running indefinitely, discovered via `docker ps -a` showing a 5-hour-old leftover container. Fixed with `SIGINT`/`SIGTERM` handlers that destroy all active sessions before the process exits — verified live, not just reviewed, including catching and fixing a double-fire bug in the shutdown handler itself.

## Known Limitations / Future Work

- [ ] Explicit "start session" UI action (currently a container is created the instant the page loads)
- [ ] Basic file operations (list/read files) to round out the IDE framing
- [ ] Tests for the container lifecycle functions
- [ ] Kubernetes orchestration, AWS deployment, auth, and LLM integration — all deliberately deferred (see [Scope](#scope))

## License

MIT
