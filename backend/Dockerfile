# vlabs/backend/Dockerfile

# Use a lightweight Node.js base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# --- START: Updated section for Docker CLI and Compose Plugin ---
# Update apk and install necessary packages:
# - docker-cli: provides the 'docker' command
# - curl: needed to download the docker-compose plugin binary
RUN apk update && apk add --no-cache docker-cli curl

# Install Docker Compose V2 plugin by downloading its binary
# Docker CLI expects plugins to be in a specific directory (e.g., /usr/local/lib/docker/cli-plugins/)
#
# IMPORTANT: Check https://github.com/docker/compose/releases for the latest stable DOCKER_COMPOSE_VERSION
# As of my last update, v2.27.1 is a recent stable version. You can update this if a newer one exists.
ENV DOCKER_COMPOSE_VERSION 2.27.1
RUN mkdir -p /usr/local/lib/docker/cli-plugins/ && \
    curl -SL https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
# --- END: Updated section ---

# Copy package.json and package-lock.json to leverage Docker's layer caching
# This ensures npm install runs only if dependencies change
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the server.js file into the container
COPY server.js .

# Expose the port the Node.js server will listen on inside the container
EXPOSE 3001

# Define the command to run your server when the container starts
CMD ["node", "server.js"]
