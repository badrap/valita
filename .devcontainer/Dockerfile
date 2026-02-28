FROM node:24-alpine
RUN apk add --no-cache \
  git \
  openssh \
  ripgrep
RUN mkdir -p /workspace && chown node:node /workspace
USER node
