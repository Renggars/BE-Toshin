#!/bin/sh
set -e

echo "Running Prisma Migrations (Production)..."
npx prisma migrate deploy

echo "Running Prisma Seeding..."
npx prisma db seed

echo "Starting Application..."
exec "$@"
