FROM node:24-alpine
RUN apk add --no-cache \
  git \
  openssh \
  ripgrep
RUN mkdir -p /workspace && chown node:node /workspace
USER node
RUN mkdir -p /workspace/node_modules /workspace/dist
