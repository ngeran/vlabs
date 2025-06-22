# vlabs/public/python-scripts/Dockerfile

# Use an official Python runtime as a parent image
FROM python:3.9-slim-buster

# Set the working directory in the container
WORKDIR /app

# Install system dependencies needed by Python packages (like PyEZ, Paramiko for SSH)
# These are for Debian-based images (like slim-buster)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    openssh-client \
    && rm -rf /var/lib/apt/lists/* # Clean up apt cache to keep image small

# Copy the requirements file into the container
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the script itself into the container
COPY . .

# Command to run a Python script when the container starts.
CMD ["python"]
