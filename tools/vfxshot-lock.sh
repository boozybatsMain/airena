#!/bin/sh
# Прогон снимков ПО ОЧЕРЕДИ: один headless Chrome на GPU за раз (почему —
# см. `vfxlock.sh`; замок общий с роликами `vfxclip.mjs`).
#   tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam --moments=0.1,0.3,0.6 --out=reports/vfx/x
exec "$(dirname "$0")/vfxlock.sh" node "$(dirname "$0")/vfxshot.mjs" "$@"
