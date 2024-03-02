FROM node:20-alpine
RUN apk add --no-cache \
  git \
  gpg \
  openssh \
  ripgrep
RUN mkdir -p /workspace && chown node:node /workspace
USER node
RUN mkdir -p /workspace/node_modules /workspace/dist
