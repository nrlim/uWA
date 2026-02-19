#!/bin/bash

# --- Configuration ---
PROJECT_NAME="uwa-worker"
WORKER_DIR="./worker"

echo "🚀 Memulai Deployment uWA Worker..."

# 1. Update Source Code
echo "📥 Menarik kode terbaru dari repository..."
git pull origin main || { echo "❌ Git pull gagal"; exit 1; }

# 2. Pastikan .env ada di root
if [ ! -f ".env" ]; then
    echo "❌ GAGAL: File .env tidak ditemukan di root!"
    echo "   Buat file .env di /root/uWA/.env dengan DATABASE_URL dan DIRECT_URL"
    exit 1
fi

# 3. Install worker dependencies
# postinstall otomatis menjalankan: npx prisma generate --schema=../prisma/schema.prisma
# Ini memastikan Prisma Client di-generate ke worker/node_modules/@prisma/client
echo "📦 Menginstall worker dependencies & generating prisma client..."
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
