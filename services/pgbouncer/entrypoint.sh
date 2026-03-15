#!/bin/sh
set -e

# Write userlist.txt from env vars (required by PgBouncer for md5 auth)
echo "\"${POSTGRES_USER}\" \"${POSTGRES_PASSWORD}\"" > /etc/pgbouncer/userlist.txt

# Substitute env vars into the template and write the real ini file
envsubst < /etc/pgbouncer/pgbouncer.ini.template > /etc/pgbouncer/pgbouncer.ini

# Start PgBouncer
exec pgbouncer /etc/pgbouncer/pgbouncer.ini