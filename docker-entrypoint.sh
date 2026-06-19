#!/bin/sh
set -e

echo "--- Starting Node.js Backend Startup Sequence ---"

# 1. Run migrations safely (Production-ready)
echo "Step 1/2: Running Prisma Migrations..."
npx prisma migrate deploy

# 2. Run Seeding (Idempotent using upsert)
echo "Step 2/2: Running Prisma Seeding (Idempotent)..."
npx prisma db seed

echo "--- Initialization Finished. Starting Application... ---"
exec "$@"
