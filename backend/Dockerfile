# vlabs/backend/Dockerfile

# Use a lightweight Node.js base image. Using a specific version is a best practice.
FROM node:20-alpine

# Set the working directory for subsequent commands.
WORKDIR /app

# --- Install System Dependencies ---

# Update the package index and install all necessary binaries in a single layer.
# - docker-cli: provides the 'docker' command for running scripts.
# - curl: needed to download the docker-compose plugin binary.
# - python3: needed to run the Python-based report generator script.
# - py3-tabulate: The Python 'tabulate' library, installed via the system package manager.
RUN apk update && apk add --no-cache \
    docker-cli \
    curl \
    python3 \
    py3-tabulate

# --- Install Docker Compose Plugin ---

# IMPORTANT: You can update DOCKER_COMPOSE_VERSION to the latest stable release from GitHub.
ENV DOCKER_COMPOSE_VERSION 2.27.1
RUN mkdir -p /usr/local/lib/docker/cli-plugins/ && \
    curl -SL https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# --- Node.js Dependencies ---

# Copy package files first to leverage Docker's build cache.
COPY package*.json ./
RUN npm install

# --- Finalize Application ---

# Copy the rest of the backend application source code into the container.
COPY . .

# Expose the port the Node.js server will listen on.
EXPOSE 3001

# Define the command to run your server when the container starts.
CMD [ "node", "server.js" ]
