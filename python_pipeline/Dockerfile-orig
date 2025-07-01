# python_pipeline/Dockerfile

# Use an official Python runtime as a parent image
FROM python:3.9-slim-buster

# Set the working directory in the container
# This should match the SCRIPT_MOUNT_POINT_IN_CONTAINER variable in your backend/server.js
WORKDIR /app/python-scripts

# --- START FIX: Add this line to ensure Python finds sibling modules like 'utils' ---
ENV PYTHONPATH=${PYTHONPATH}:/app/python-scripts
# --- END FIX ---

# Install system dependencies needed by Python packages (like PyEZ, Paramiko for SSH)
# These are for Debian-based images (like slim-buster)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    openssh-client \
    # Add git if you plan to use pip with git repositories for dependencies (e.g., private repos)
    # git \
    && rm -rf /var/lib/apt/lists/* # Clean up apt cache to keep image small

# Copy the requirements.txt file into the container at the WORKDIR
# This is necessary so pip can install the dependencies
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# IMPORTANT: REMOVE THE FOLLOWING LINE.
# The Python scripts themselves are volume-mounted at runtime by the Node.js backend.
# They are NOT copied into the Docker image during the build process.
# COPY . . # <-- DO NOT INCLUDE THIS LINE IN YOUR FINAL DOCKERFILE

# Optional: Command to keep the container running if no explicit command is given.
# This CMD is effectively overridden when your Node.js backend runs specific scripts
# using `docker run ... python /path/to/script.py`.
CMD ["tail", "-f", "/dev/null"]
