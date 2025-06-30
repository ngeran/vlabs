# Use a standard, slim Python image
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /app

# Copy only the requirements file first to leverage Docker's layer caching
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .
