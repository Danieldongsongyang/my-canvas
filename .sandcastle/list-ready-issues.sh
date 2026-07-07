#!/usr/bin/env bash
set -euo pipefail

for attempt in 1 2 3 4 5; do
  if gh issue list \
    --state open \
    --label ready-for-agent \
    --limit 100 \
    --json number,title,body,labels,comments \
    --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'; then
    exit 0
  fi

  if [ "$attempt" -lt 5 ]; then
    sleep $((attempt * 2))
  fi
done

exit 1
