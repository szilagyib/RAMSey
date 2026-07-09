# ============================================
# Simple nginx image — expects pre-built frontend
# Build locally first: npm run build -w packages/engine -w packages/frontend
# ============================================
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy pre-built frontend assets
COPY packages/frontend/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
