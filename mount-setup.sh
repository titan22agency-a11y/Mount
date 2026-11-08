#!/usr/bin/env bash
# Installs the MOUNT store (site + dashboard + feedback) on the Titan server
# at https://mount.titan22agency.com, next to ENZO.
# Safe to run again: it updates the app and never deletes data.
# It never touches ENZO: its own user, folders, port, service, cron file and Caddy block.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo bash $0"; exit 1; }

DOMAIN="titan22agency.com"
HOST="mount.${DOMAIN}"
REPO="https://github.com/titan22agency-a11y/Mount.git"
BRANCH="main"
APP=/opt/mount-app
DATA=/var/lib/mount
BACKUPS=/var/backups/mount
PORT=3201          # ENZO uses 3200
SVC=mount
OWNER_USER="bahaa"
OWNER_NAME="Bahaa"

# Never take a port that something else (for example ENZO) is already using.
if ss -ltnH "sport = :${PORT}" 2>/dev/null | grep -q . && ! systemctl is-active --quiet "$SVC"; then
  echo "Port ${PORT} is already in use by another program. Stopping so nothing else breaks."; exit 1
fi

echo "==> Node.js 22+"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v git >/dev/null || apt-get install -y git

echo "==> App code in ${APP}"
id "$SVC" >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin "$SVC"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch --quiet --depth 1 origin "$BRANCH"
  git -C "$APP" reset --quiet --hard "origin/${BRANCH}"   # code only; data lives in ${DATA}
else
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi
mkdir -p "$DATA" "$BACKUPS"; chown "$SVC:$SVC" "$DATA" "$BACKUPS"; chmod 700 "$DATA" "$BACKUPS"

echo "==> Service ${SVC}"
cat > /etc/systemd/system/${SVC}.service <<UNIT
[Unit]
Description=MOUNT store
After=network.target
[Service]
User=${SVC}
Environment=MOUNT_DATA=${DATA} PORT=${PORT} NODE_NO_WARNINGS=1
ExecStart=/usr/bin/node ${APP}/apps/mount/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA}
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --quiet "$SVC"
systemctl restart "$SVC"

echo "==> Auto-update every 5 minutes + daily backup at 3:45am (keeps 30 days)"
cat > /usr/local/bin/mount-update <<UPD
#!/bin/sh
# Pull new code from GitHub; restart MOUNT only if something changed.
cd ${APP} || exit 0
OLD=\$(git rev-parse HEAD)
git fetch --quiet --depth 1 origin ${BRANCH} || exit 0
git reset --quiet --hard origin/${BRANCH} || exit 0
[ "\$OLD" != "\$(git rev-parse HEAD)" ] && systemctl restart ${SVC}
exit 0
UPD
chmod +x /usr/local/bin/mount-update
cat > /etc/cron.d/mount <<CRON
*/5 * * * * root /usr/local/bin/mount-update >/dev/null 2>&1
45 3 * * * ${SVC} MOUNT_DATA=${DATA} NODE_NO_WARNINGS=1 /usr/bin/node ${APP}/apps/mount/server.js backup ${BACKUPS} >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/mount

echo "==> Web address ${HOST}"
CF=/etc/caddy/Caddyfile
if ! command -v caddy >/dev/null || [ ! -f "$CF" ]; then
  echo "    Caddy is not installed here. Point your web server at 127.0.0.1:${PORT} yourself."
else
  if ! grep -qE "^${HOST//./\\.}([ ,{]|$)" "$CF"; then
    cp "$CF" "${CF}.bak-mount-$(date +%Y%m%d%H%M%S)"
    cat >> "$CF" <<CADDY

${HOST} {
	reverse_proxy 127.0.0.1:${PORT}
	encode gzip
	header Strict-Transport-Security "max-age=31536000"
}
CADDY
    echo "    Added a Caddy block (backup of the old file saved next to it)."
  else
    echo "    Caddy block already there."
  fi
  if caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy
  else
    echo "    Caddy config is invalid, so Caddy was NOT reloaded (ENZO keeps running as before)."
    echo "    Check it with: caddy validate --config $CF"
    exit 1
  fi
fi

echo "==> Check"
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS "http://127.0.0.1:${PORT}/api/public" >/dev/null 2>&1 && break
  sleep 1
done
if curl -fsS "http://127.0.0.1:${PORT}/api/public" >/dev/null 2>&1; then echo "    MOUNT answers on port ${PORT}."; else echo "    MOUNT is not answering. See: journalctl -u ${SVC} -n 50"; exit 1; fi

echo "==> Owner account"
if [ ! -f "$DATA/.admin-created" ]; then
  sudo -u "$SVC" MOUNT_DATA="$DATA" NODE_NO_WARNINGS=1 node "$APP/apps/mount/server.js" set-user "$OWNER_USER" admin "$OWNER_NAME"
  touch "$DATA/.admin-created"; chown "$SVC:$SVC" "$DATA/.admin-created"
  echo "    ^ Save this password now. It will not be shown again."
else
  echo "    Owner account already exists. To reset its password:"
  echo "    sudo -u ${SVC} MOUNT_DATA=${DATA} node ${APP}/apps/mount/server.js set-user ${OWNER_USER} admin ${OWNER_NAME}"
fi

echo
echo "==> Done."
echo "    Site:      https://${HOST}"
echo "    Dashboard: https://${HOST}/admin"
