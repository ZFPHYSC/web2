#!/bin/bash

# Reset database
echo "Resetting database..."
docker-compose down -v
docker-compose up -d postgres qdrant minio redis
sleep 5

# Run migrations
echo "Running migrations..."
alembic upgrade head

# Start backend
echo "Starting backend..."
uvicorn main:app --reload --host 0.0.0.0 --port 8000 