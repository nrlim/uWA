#!/bin/bash
set -e  # Exit immediately on any error

# --- Configuration ---
PROJECT_NAME="uwa-worker"
WORKER_DIR="./worker"
SCHEMA_PATH="../prisma/schema.prisma"
MEMORY_LIMIT=1024  # Limit 1GB (1024MB) untuk stabilitas engine Baileys

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Memulai Deployment uWA Worker (Senior Mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Update Source Code (reset local changes dulu agar tidak konflik)
echo ""
echo "📥 [1/6] Menarik kode terbaru dari repository..."
#git reset --hard HEAD
git pull origin main || { echo "❌ Git pull gagal"; exit 1; }

# 2. Masuk ke direktori worker
cd $WORKER_DIR || { echo "❌ Folder $WORKER_DIR tidak ditemukan"; exit 1; }
echo "📂 Working directory: $(pwd)"

# 3. Install Dependencies (termasuk prisma CLI di devDependencies)
echo ""
echo "📦 [2/6] Menginstall dependencies..."
npm install || { echo "❌ Install gagal"; exit 1; }

# 4. Generate Prisma Client + Build TypeScript
echo ""
echo "🏗️  [3/6] Build project (prisma generate + tsc)..."
npm run build || { echo "❌ Build gagal"; exit 1; }

# Verify build output exists
if [ ! -f "dist/index.js" ]; then
  echo "❌ Build output dist/index.js tidak ditemukan!"
  exit 1
fi
echo "   ✅ Build berhasil"

# 5. Restart PM2 dengan Explicit Node Args (1GB Limit)
echo ""
echo "♻️  [4/6] Me-restart service dengan limit heap ${MEMORY_LIMIT}MB..."

# Menghapus proses lama agar flag baru terpasang bersih di PM2
pm2 delete $PROJECT_NAME 2>/dev/null || true

# Menjalankan engine dengan limitasi memori 1GB
pm2 start dist/index.js \
  --name $PROJECT_NAME \
  --node-args="--max-old-space-size=$MEMORY_LIMIT" \
  --max-memory-restart "${MEMORY_LIMIT}M"

# 6. Finalisasi & Verifikasi
echo ""
echo "🧹 [5/6] Menyimpan konfigurasi PM2..."
pm2 save

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment uWA Worker Selesai!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
pm2 list
echo ""
echo "Engine uWA berjalan dengan limit heap $MEMORY_LIMIT MB (1GB)."
echo "Gunakan 'pm2 logs $PROJECT_NAME' untuk melihat log."