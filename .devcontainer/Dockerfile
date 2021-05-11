FROM node:14-buster-slim

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends git ripgrep

RUN mkdir -p /workspace && chown node:node /workspace
USER node
RUN mkdir -p /workspace/node_modules /workspace/dist
