#!/bin/sh
# Compiles and runs the parser unit tests on the host (no ESP32 needed).
set -e
cd "$(dirname "$0")"
out="${TMPDIR:-/tmp}/plant_ble_test"
c++ -std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined -o "$out" plant_ble_test.cpp
"$out"
