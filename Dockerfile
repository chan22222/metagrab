FROM node:20-slim

# Puppeteer, ffmpeg 의존성 설치
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-noto-cjk \
    python3 \
    curl \
    unzip \
    ca-certificates \
    --no-install-recommends \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Deno 설치 (yt-dlp YouTube JS 챌린지 해결에 필요)
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/deno \
    && rm /tmp/deno.zip

# Puppeteer 환경변수
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install --omit=dev

# 소스 복사
COPY . .

# 포트 설정
EXPOSE 5000

CMD ["node", "server.js"]
