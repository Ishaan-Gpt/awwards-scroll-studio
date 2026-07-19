# SmoothRecord recorder — Node + Playwright + ffmpeg
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# ffmpeg via apt (smaller than the installer packages at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY src ./src

EXPOSE 8080
CMD ["node", "src/server.js"]
