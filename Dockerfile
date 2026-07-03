# Use the official Playwright image which includes Node, Chromium, and all system dependencies.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Copy all application code
COPY . .

# Install dependencies (backend & frontend) and build the frontend assets.
# Note: Since the official Playwright Docker image already contains Chromium pre-installed
# at /ms-playwright, we do not need to download it again.
RUN npm run install:render
RUN cd backend && npx playwright install --with-deps chromium
RUN npm run build

# Expose the default backend port
EXPOSE 5050

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Start the application via the backend start script
CMD ["npm", "start"]
