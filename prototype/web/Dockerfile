FROM nginx:alpine

# Copy the SPA files
COPY web/index.html web/config.js /usr/share/nginx/html/

# Copy shared protocol module (served under /shared/)
COPY shared/ /usr/share/nginx/shared/

# Use our nginx config
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
