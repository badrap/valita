FROM node:14-alpine3.14
RUN apk add --no-cache \
  git \
  openssh \
  ripgrep
RUN mkdir -p /workspace && chown node:node /workspace
USER node
RUN mkdir -p /workspace/node_modules /workspace/dist
