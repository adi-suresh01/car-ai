#!/usr/bin/env bash

set -euo pipefail

API_URL=${1:-"http://localhost:4000/api/voice/mission"}
ITERATIONS=${2:-100}

UTTERANCES=(
  "cruise control speed 65"
  "cruise control"
  "hold cruise at sixty and two car gap"
  "set cruise control to 70 mph with 3 cars distance"
  "set cruise control to current speed"
  "set cruise control gap to four cars"
  "go to the left lane"
  "move into the leftmost lane"
  "shift into express lane"
  "merge into rightmost lane"
  "merge into exit lane"
  "move one lane to the right"
  "overtake the car ahead"
  "overtake on the right then return"
  "overtake on the left and come back"
  "quick overtake but keep safe gap"
  "cancel cruise control"
  "resume cruise control"
  "slow down and hold two car lengths"
  "maintain 55 miles per hour"
  "keep 60 mph and gap of three cars"
)

random_element() {
  local array=("$@");
  local idx=$((RANDOM % ${#array[@]}))
  echo "${array[$idx]}"
}

for ((i = 1; i <= ITERATIONS; i++)); do
  utterance=$(random_element "${UTTERANCES[@]}")
  speed=$((40 + RANDOM % 35))
  gap=$((2 + RANDOM % 4))
  lane=$((RANDOM % 5))
  note="sample-${i}"

  payload=$(jq -n \
    --arg utterance "$utterance" \
    --argjson speed $speed \
    --argjson gap $gap \
    --argjson lane $lane \
    --arg note $note \
    '{utterance:$utterance, speedMph:$speed, gapCars:$gap, targetLane:$lane, note:$note}')

  curl -s -X POST "$API_URL" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null

  printf "[%03d/%03d] %s\n" "$i" "$ITERATIONS" "$utterance"
  sleep 0.2
done

echo "Saved intents to data/voice_intents.jsonl"
