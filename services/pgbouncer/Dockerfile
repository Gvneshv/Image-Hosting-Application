FROM edoburu/pgbouncer:v1.24.1-p0

# envsubst comes from gettext — install it
USER root
RUN apk add --no-cache gettext

COPY pgbouncer.ini.template /etc/pgbouncer/pgbouncer.ini.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]