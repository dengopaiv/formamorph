#!/bin/bash
# Run one command on a RunPod pod and get clean text back. Nothing interactive, nothing to navigate.
#
# Why this exists: ssh.runpod.io is not a plain sshd. It demands a PTY and silently ignores an exec'd
# command, so `ssh pod@ssh.runpod.io "nvidia-smi"` connects, does nothing and exits successfully. This
# pipes the command into an interactive shell instead, then strips what the PTY adds back out — the
# escape sequences, the ASCII-art login banner, the shell prompt echoed around your command — leaving
# only what the command itself printed. That is the difference between output a screen reader can read
# and a screen full of redrawn terminal control codes.
#
# Usage:
#   RP_HOST=abc123-def@ssh.runpod.io ./rp.sh 'nvidia-smi -L'
#   RP_HOST=root@69.30.85.59 RP_ARGS='-p 22062' ./rp.sh 'tail -30 /workspace/pod-setup.log'
#
# Prefer the direct form (Connect -> SSH over exposed TCP) when the pod has TCP 22 mapped: it is a real
# sshd, so it also forwards ports, which the proxy does not (see the endpoint notes, 15.3a).

set -u
: "${RP_HOST:?set RP_HOST to <pod-id>@ssh.runpod.io or root@<ip> (with RP_ARGS='-p <port>')}"
KEY="${RP_KEY:-$HOME/.ssh/id_ed25519}"

printf '%s\nexit\n' "$1" | ssh -tt \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=25 \
  -o ServerAliveInterval=30 \
  -i "$KEY" ${RP_ARGS:-} "$RP_HOST" 2>&1 \
  | tr -d '\r' \
  | sed -e 's/\x1b\][0-9];[^\x07]*\x07//g' \
        -e 's/\x1b\[[0-9;?]*[a-zA-Z]//g' \
  | grep -v \
      -e '^root@[0-9a-f]*:' \
      -e 'Connection to .* closed' \
      -e 'Warning: Permanently added' \
      -e 'post-quantum' -e 'store now, decrypt later' -e 'may need to be upgraded' \
      -e '^\s*$'
