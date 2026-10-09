# Deploying to Railway

Two services from this one repository: the **server** (Node + Socket.IO, runs the
matches) and the **client** (the static web app). This guide is the checklist.

```
 Player's browser ──loads the app──▶  client  (static files, Railway service #1)
        │
        └────── wss:// WebSocket ───▶  server  (Node, Railway service #2)
```

Both are built from the repository root (it is a pnpm workspace that shares the
`game-core` package), so neither service uses a "Root Directory". Each gets its
own build and start command instead. Railway calls this a *shared monorepo*.

> **About Railway's config files.** I did not add a `railway.json`. Railway's
> docs say Config as Code (`railway.json` / `railway.toml`) is deprecated, that
> new services cannot use it, and that existing files stop being read on
> 2026-12-01. Its replacement is Infrastructure as Code (`.railway/railway.ts`),
> which needs the Railway CLI and a real project to check against, so it is not
> something I can write and test from here. The settings below are small enough
> to enter once in the dashboard; afterwards `railway config pull` (see the
> [Infrastructure as Code docs](https://docs.railway.com/infrastructure-as-code))
> can capture them as code if you want that.

## Before you start

- The repository is on GitHub and pushed.
- Node 22 or newer is used (`.node-version` and `engines` say so), and `pnpm` is
  pinned by the `packageManager` field in `package.json`.
- Nothing needs a database. Matches live in the server's memory.

## 1. Create the project and the two services

1. In Railway: **New Project → Deploy from GitHub repo**, pick this repo.
2. Railway may auto-create one service per package. Keep two services, named
   exactly **`server`** and **`client`** (the names are used in the variables
   below). Delete any extra one it created for `game-core`: it is a library, not
   something to run.
3. Leave **Root Directory** empty on both.

## 2. Server service (`server`)

**Settings**

| Setting | Value |
| --- | --- |
| Build command | `pnpm build:server` |
| Start command | `pnpm start:server` |
| Healthcheck path | `/health` |
| Watch paths | `/apps/server/**`, `/packages/game-core/**`, `/package.json`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/tsconfig.base.json` |
| Replicas | **1** (see "One instance only") |
| Networking | **Generate Domain** (public) |

The server listens on `PORT`. Set `PORT` yourself (for example `3001`) and enter
the same number in the **Target port** box when you generate the domain; if the
two disagree the domain answers 502. The deploy log prints the real one:
`Game server listening on 0.0.0.0:<port>`.

**Variables**

| Variable | Value | Notes |
| --- | --- | --- |
| `CLIENT_ORIGIN` | `https://${{client.RAILWAY_PUBLIC_DOMAIN}}` | Required. The client's public address, with `https://`. Only this origin may open sockets. |
| `NODE_ENV` | `production` | Turns on the startup warnings below. |
| `AWAY_GRACE_SECONDS` | `15` | Optional. How long a player may be away before an AI sails their ship. |
| `MAX_ROOMS` | `100` | Optional. |
| `IDLE_ROOM_MINUTES` | `10` | Optional. How long an empty room is kept. |

## 3. Client service (`client`)

**Settings**

| Setting | Value |
| --- | --- |
| Build command | `pnpm build:client` |
| Start command | `pnpm start:client` |
| Healthcheck path | `/` |
| Watch paths | `/apps/client/**`, `/packages/game-core/**`, `/package.json`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/tsconfig.base.json` |
| Networking | **Generate Domain** (public) |

The client listens on `PORT` too (it falls back to 4173 if unset). Set `PORT`
yourself (for example `8080`) and use the same number as the **Target port**
when generating the domain. The deploy log prints it:
`Serving ... on http://0.0.0.0:<port>`.

**Variables**

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_SERVER_URL` | `https://${{server.RAILWAY_PUBLIC_DOMAIN}}` | Required for online play. The server's public address, with `https://` and **no trailing path**. |

`VITE_SERVER_URL` is baked into the app when it is *built*. Changing it means
redeploying the client, not just restarting it. The build checks the value: a
missing `https://`, or a path on the end, fails the build with a message saying
how to fix it, and leaving it unset prints a warning that the build has no
online play.

`${{service.VARIABLE}}` is Railway's reference-variable syntax, and
`RAILWAY_PUBLIC_DOMAIN` is the domain Railway generated for that service
(without `https://`, hence the prefix). If your Railway version shows a
different name, use whatever the variable picker offers for the other service's
public domain.

The same settings can be made from the CLI, using the commands Railway's
[monorepo guide](https://docs.railway.com/guides/monorepo) gives, for example:

```bash
railway environment edit --service-config server build.buildCommand "pnpm build:server"
railway environment edit --service-config server deploy.startCommand "pnpm start:server"
```

## 4. Deploy, then check it

Deploy both services. When they are up, run the smoke test from your own
machine:

```bash
pnpm smoke --server https://<server domain> --client https://<client domain>
```

It checks, from the outside and the way a browser would:

| Check | If it fails |
| --- | --- |
| Server is healthy | The server is not running, or the URL is wrong (is it the client's?). Look at its deploy logs. |
| Client page loads | The client service is not serving the app. Look at its build and deploy logs. |
| Client was built for this server | `VITE_SERVER_URL` was missing or different when the client was built. Fix it and redeploy the **client**. |
| Server accepts the client origin | `CLIENT_ORIGIN` on the server does not match the client's address exactly. Fix it and redeploy the **server**. |
| A player can connect and create a room | Sockets are not getting through. Check the server is running and the domain is public. |

It leaves no room behind and exits non-zero on any failure, so it also works as
a step in CI.

Then try it for real: open the client in two browsers, create a room in one,
join with the code in the other, and play a turn.

## What to expect when you redeploy

- **Redeploying the server ends running matches.** They live in memory. Players
  are told "The server is shutting down" and go back to the menu. Redeploy when
  nobody is playing, or accept that a push to `main` interrupts games.
- **Redeploying the client does not** interrupt a match, but players need to
  reload to get the new version.
- Watch paths mean a change that only touches the client does not rebuild the
  server, and the other way round. A change to `packages/game-core` rebuilds
  both (they share it). Railway's docs do not promise how watch paths treat
  shared packages, so confirm this the first time you change the shared code.

## One instance only

Rooms and matches are held in the server process's memory. A second replica
would not know about the first's rooms, so players would be split across
servers at random. Keep **Replicas** at 1. Scaling out would need rooms to be
pinned to an instance (or moved to shared storage) first.

## Environment variable reference

Server (`apps/server/.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | Port to listen on (Railway sets it). |
| `HOST` | `0.0.0.0` | Interface to listen on. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s), comma separated, each `https://host` with no path. `*` allows any website (development only). |
| `MAX_ROOMS` | `100` | Most rooms alive at once. |
| `IDLE_ROOM_MINUTES` | `10` | How long an empty room is kept. |
| `AWAY_GRACE_SECONDS` | `15` | Away this long and an AI sails the ship. |

Client (`apps/client/.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_SERVER_URL` | unset | The server's public URL. Build-time. Unset in development means `http://<this host>:3001`; unset in a production build means no online play. |

## Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| The deployed menu says "Online play is not set up for this site" | Built without `VITE_SERVER_URL` (or the variable was added after the last build). | Set it on the client service and **redeploy** it. The build log shows `[pirate] WARNING: VITE_SERVER_URL is not set` when this is the cause. |
| Reference variable like `${{server.RAILWAY_PUBLIC_DOMAIN}}` is empty | The service is not named `server` (Railway names a service after its package, e.g. `@pirate/server`). | Rename the services to `server` and `client`, or paste the address in directly. |
| Domain answers 502 | The Target port does not match the port the app listens on. | Set `PORT` explicitly and use the same number as the target port. |
| "Could not reach the game server" | Wrong `VITE_SERVER_URL`, or the server is down. | Run the smoke test; check the server logs. |
| Server logs `WARNING: CLIENT_ORIGIN is not set` | Variable missing: only `localhost:5173` can connect. | Set `CLIENT_ORIGIN` to the client's `https://` address. |
| Browser console: CORS error, or sockets refused | `CLIENT_ORIGIN` does not match the client's address exactly (scheme, host, no trailing slash or path). | Fix it; the smoke test names the exact value. |
| "Your match is no longer available" after a refresh | The server restarted (matches live in memory) or the empty room was swept. | Expected. Start a new room. |
| Everyone lands in different rooms | More than one server replica. | Set replicas to 1. |
| Client build fails with "VITE_SERVER_URL ... is not a URL" | Value has no `https://`. | Add it. |
| Client build fails because `VITE_SERVER_URL` is just `https://` | The server had no public domain yet when the variable was resolved. | Generate the server's domain first, then redeploy the client. |

## Rehearsing the production setup locally

These are the same commands Railway runs, on your machine:

```bash
VITE_SERVER_URL=http://localhost:3101 pnpm build:client
pnpm build:server
NODE_ENV=production PORT=3101 CLIENT_ORIGIN=http://localhost:4101 pnpm start:server &
PORT=4101 pnpm start:client &
pnpm smoke --server http://localhost:3101 --client http://localhost:4101
```
