#!/usr/bin/env bash
# Run only on the Docker host reserved for this disposable fixture.
set -euo pipefail
cd "$(dirname "$0")/.."
fixture_dir=$(mktemp -d)
project="pilot08-${fixture_dir##*.}"
project=${project,,}
umask 077
fixture_env="$fixture_dir/env"
install -m 644 infra/pilot/fixture-database.sh "$fixture_dir/database.sh"
for name in POSTGRES_PASSWORD RUNTIME_PASSWORD IDENTITY_PASSWORD WORKER_PASSWORD QUEUE_PASSWORD BACKUP_PASSWORD RESTORE_PASSWORD \
            AUTH_SECRET STORAGE_ID STORAGE_SECRET; do
  printf 'FIXTURE_%s=%s\n' "$name" "$(openssl rand -hex 24)"
done > "$fixture_env"
printf 'FIXTURE_DATABASE_INIT=%s\n' "$fixture_dir/database.sh" >> "$fixture_env"
compose() { docker compose --env-file "$fixture_env" --project-name "$project" -f infra/pilot/fixture.yml "$@"; }
cleanup() {
  compose --profile exercise down --volumes --remove-orphans > /dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

wait_for_log() {
  local service=$1 expected=$2
  for ((attempt=0; attempt<60; attempt++)); do
    if compose logs --no-color "$service" | rg -F "$expected"; then
      return
    fi
    sleep 1
  done
  printf 'Missing fixture signal %s\n' "$expected" >&2
  return 1
}
wait_for_restart() {
  local id=$1 previous=$2
  for ((attempt=0; attempt<60; attempt++)); do
    if [[ $(docker inspect -f '{{.State.Health.Status}}' "$id") == healthy ]] &&
       (( $(docker inspect -f '{{.RestartCount}}' "$id") > previous )); then
      return
    fi
    sleep 1
  done
  echo "Pilot fixture worker did not recover under its supervisor" >&2
  return 1
}

if [[ ${PILOT_FIXTURE_SKIP_BUILD:-0} != 1 ]]; then
  compose build worker
fi
compose up -d --wait --wait-timeout 60 --no-build postgres objects api web worker
compose up -d --no-build monitor

compose run --rm --no-deps exercise
wait_for_log monitor '"signal":"worker.queue_backlog","ownerRole":"QUEUE_OPERATOR","state":"firing"'
wait_for_log monitor '"signal":"worker.queue_failed","ownerRole":"QUEUE_OPERATOR","state":"firing"'

compose run --rm --no-deps backup
if compose run --rm --no-deps -e PGDATABASE=fixture_missing backup > "$fixture_dir/failed-backup.log" 2>&1; then
  echo "Failed-backup fixture unexpectedly succeeded" >&2
  exit 1
fi
rg -F '{"signal":"backup.failed","ownerRole":"BACKUP_OPERATOR"}' "$fixture_dir/failed-backup.log"
compose --profile exercise up -d --wait --wait-timeout 60 restore-db
compose run --rm --no-deps restore
compose run --rm --no-deps checkpoint node infra/pilot/fixture-checkpoint.mjs write

# Stop the worker long enough for independent monitoring to observe loss.
compose stop worker
wait_for_log monitor '"signal":"worker.heartbeat_missed","ownerRole":"QUEUE_OPERATOR","state":"firing"'
compose up -d --wait --wait-timeout 60 --no-build worker
wait_for_log monitor '"signal":"worker.heartbeat_missed","ownerRole":"QUEUE_OPERATOR","state":"cleared"'
# Failed and overdue queue rows survive the clean restart.
compose exec -T worker node -e 'fetch("http://127.0.0.1:7308/healthz").then(async r=>{
  const s=await r.json(); if(!r.ok || !s.backlog || !s.failed) process.exitCode=1;
}).catch(()=>{process.exitCode=1})'
worker=$(compose ps -q worker)
# Request worker termination without marking a manual stop in the supervisor.
previous=$(docker inspect -f '{{.RestartCount}}' "$worker")
compose exec -T worker node -e 'process.kill(1,"SIGTERM")' || true
wait_for_restart "$worker" "$previous"
compose run --rm --no-deps checkpoint
echo "PILOT_FIXTURE_SUPERVISED_RESTART_VERIFIED"
