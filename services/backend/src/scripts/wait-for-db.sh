#!/bin/sh
set -e

# Arguments
hostport=$1
shift
cmd="$@"

host=$(echo $hostport | cut -d: -f1)
port=$(echo $hostport | cut -d: -f2)

echo "Waiting for database $host:$port..."

# Wait until pg_isready succeeds
until pg_isready -h "$host" -p "$port"; do
  echo "Waiting for $host:$port..."
  sleep 2
done

echo "$host:$port is ready!"

# Only exec if a command is provided
if [ -n "$cmd" ]; then
  echo "Running command: $cmd"
  exec $cmd
else
  echo "No command provided to run after DB is ready."
fi