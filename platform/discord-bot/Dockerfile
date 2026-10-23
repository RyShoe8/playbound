FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js smoke-voice.js ./

USER node
EXPOSE 8787
CMD ["node", "index.js"]
