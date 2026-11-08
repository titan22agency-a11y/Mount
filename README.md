# MOUNT store

Store site + owner dashboard + customer feedback page for **MOUNT** (wide-leg sweatpants, women & men).
One Node.js file, no npm packages. Same system as ENZO, on the same server, fully separate from it.

| Part | Address | Language |
|---|---|---|
| Store | `/` | English |
| Dashboard | `/admin` | Arabic (RTL) |
| Feedback | `/feedback?o=MT-1001&t=first&k=…` | Arabic (RTL) |

## Files

```
apps/mount/server.js        server + API + database (Node 22+, node:sqlite)
apps/mount/public/          everything the browser loads (HTML, CSS, JS, images, fonts, logo)
tools/mount-setup.sh        installs / updates MOUNT on the server (never touches ENZO)
```

## Run locally

```bash
cd apps/mount
node server.js set-user bahaa admin "Bahaa"   # prints a password
node server.js                                # http://127.0.0.1:3201
```

Data goes to `apps/mount/.data/` (ignored by git). Set `MOUNT_DATA` and `PORT` to change.

## Commands

- `node server.js set-user <user> <admin|staff|viewer> <name>`: create a user or reset the password (prints a new random password).
- `node server.js backup <dir>`: dated copy of the database; keeps the last 30.

## Server install

```bash
curl -fsSL https://raw.githubusercontent.com/titan22agency-a11y/Mount/main/tools/mount-setup.sh -o /tmp/mount-setup.sh
sudo bash /tmp/mount-setup.sh
```

Domain `mount.titan22agency.com`, port 3201 (ENZO stays on 3200), service `mount`, code `/opt/mount-app`,
data `/var/lib/mount`, backups `/var/backups/mount` (daily 3:45am), auto-update from GitHub every 5 minutes.

## Placeholders to fill

Search the site for text in `[SQUARE BRACKETS]`: size chart, care instructions, men's fabric composition,
shipping times, exchange policy. Prices and stock start at 0: set them in the dashboard → المنتجات والمخزون.
