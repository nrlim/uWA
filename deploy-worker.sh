#!/bin/bash

# --- Configuration ---
PROJECT_NAME="uwa-worker"
WORKER_DIR="./worker"
# SCHEMA_PATH is now handled by package.json scripts (postinstall)
# But we can still keep it explicit if needed.
MEMORY_LIMIT=1024  # Limit 1GB (1024MB) untuk stabilitas engine Baileys

echo "🚀 Memulai Deployment uWA Worker dengan Optimasi Memori (Senior Mode)..."

# 1. Update Source Code
echo "📥 Menarik kode terbaru dari repository..."
git pull origin main || { echo "❌ Git pull gagal"; exit 1; }

# 2. Masuk ke direktori worker
cd $WORKER_DIR || { echo "❌ Folder $WORKER_DIR tidak ditemukan"; exit 1; }

# 3. Instalasi Dependencies & Generate Prisma Client
# Karena kita menambahkan "postinstall": "prisma generate ..." di package.json,
# npm install akan otomatis menjalankan generate.
echo "📦 Menginstall dependencies & generating prisma client..."
npm install || { echo "❌ Install gagal"; exit 1; }

# 4. Build Project (TypeScript to JavaScript)
echo "🏗️ Membangun project worker (dist)..."
npm run build || { echo "❌ Build gagal"; exit 1; }

# 5. Eksekusi Restart dengan Explicit Node Args (1GB Limit)
echo "♻️ Me-restart service uWA dengan limit heap ${MEMORY_LIMIT}MB..."

# Menghapus proses lama agar flag baru terpasang bersih di PM2
pm2 delete $PROJECT_NAME || true

# Menjalankan engine dengan limitasi memori 1GB
# max-old-space-size mengatur heap memory Node.js
# max-memory-restart memerintahkan PM2 untuk restart jika melebihi limit
# Kita juga memastikan environment variable termuat (PM2 biasanya memuat .env jika ada di folder sama)
# Namun karena kita run dist/index.js, CWD adalah worker/, jadi worker/.env akan terbaca oleh dotenv.
pm2 start dist/index.js \
  --name $PROJECT_NAME \
  --node-args="--max-old-space-size=$MEMORY_LIMIT" \
  --max-memory-restart "${MEMORY_LIMIT}M"

# 6. Finalisasi & Verifikasi
echo "🧹 Menyimpan konfigurasi PM2..."
pm2 save

echo "-------------------------------------------------------"
echo "✅ Deployment uWA Selesai! Status Worker saat ini:"
echo "-------------------------------------------------------"

# Menampilkan daftar proses untuk verifikasi penggunaan RAM
pm2 list

echo "-------------------------------------------------------"
echo "Engine uWA berjalan dengan limit heap $MEMORY_LIMIT MB (1GB)."
