#!/bin/bash

# --- Configuration ---
PROJECT_NAME="uwa-worker"
WORKER_DIR="./worker"

echo "🚀 Memulai Deployment uWA Worker..."

# 1. Update Source Code
echo "📥 Menarik kode terbaru dari repository..."
git pull origin main || { echo "❌ Git pull gagal"; exit 1; }

# 2. Install root dependencies & Generate Prisma Client dari root
echo "📦 Menginstall root dependencies..."
npm install || { echo "❌ Root install gagal"; exit 1; }

echo "💎 Menghasilkan Prisma Client dari root schema..."
npx prisma generate || { echo "❌ Prisma generate gagal"; exit 1; }

# 3. Install worker dependencies
echo "📦 Menginstall worker dependencies..."
cd $WORKER_DIR || { echo "❌ Folder $WORKER_DIR tidak ditemukan"; exit 1; }
npm install || { echo "❌ Worker install gagal"; exit 1; }

# 4. Build Worker (TypeScript to JavaScript)
echo "🏗️ Membangun project worker (dist)..."
npm run build || { echo "❌ Build gagal"; exit 1; }

# 5. Kembali ke root & restart via ecosystem.config.js
cd ..

echo "♻️ Me-restart service uWA..."
pm2 delete $PROJECT_NAME || true
pm2 start ecosystem.config.js

# 6. Finalisasi
echo "🧹 Menyimpan konfigurasi PM2..."
pm2 save

echo "-------------------------------------------------------"
echo "✅ Deployment uWA Selesai! Status Worker saat ini:"
echo "-------------------------------------------------------"
pm2 list
