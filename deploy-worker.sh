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

# 1. Update Source Code
echo ""
echo "📥 [1/7] Menarik kode terbaru dari repository..."
git pull origin main || { echo "❌ Git pull gagal"; exit 1; }

# 2. Masuk ke direktori worker
cd $WORKER_DIR || { echo "❌ Folder $WORKER_DIR tidak ditemukan"; exit 1; }
echo "📂 Working directory: $(pwd)"

# 3. Install Dependencies (skip postinstall to avoid premature prisma generate)
echo ""
echo "📦 [2/7] Menginstall dependencies..."
npm install --ignore-scripts || { echo "❌ Install gagal"; exit 1; }

# 4. Install Prisma CLI (jika belum ada di node_modules)
echo ""
echo "💎 [3/7] Memastikan Prisma CLI tersedia..."
if [ ! -f "node_modules/.bin/prisma" ]; then
  echo "   ↳ Prisma CLI tidak ditemukan, menginstall..."
  npm install prisma --save-dev || { echo "❌ Install Prisma CLI gagal"; exit 1; }
fi

# 5. Generate Prisma Client
echo ""
echo "💎 [4/7] Menghasilkan Prisma Client..."
npx prisma generate --schema=$SCHEMA_PATH || { echo "❌ Prisma generate gagal"; exit 1; }

# Verify Prisma Client was generated
if [ ! -d "node_modules/.prisma/client" ]; then
  echo "❌ Prisma Client tidak ditemukan setelah generate!"
  exit 1
fi
echo "   ✅ Prisma Client berhasil di-generate"

# 6. Build Project (TypeScript to JavaScript)
echo ""
echo "🏗️  [5/7] Membangun project worker (dist)..."
npx tsc || { echo "❌ Build gagal"; exit 1; }

# Verify build output exists
if [ ! -f "dist/index.js" ]; then
  echo "❌ Build output dist/index.js tidak ditemukan!"
  exit 1
fi
echo "   ✅ Build berhasil"

# 7. Restart PM2 dengan Explicit Node Args (1GB Limit)
echo ""
echo "♻️  [6/7] Me-restart service dengan limit heap ${MEMORY_LIMIT}MB..."

# Menghapus proses lama agar flag baru terpasang bersih di PM2
pm2 delete $PROJECT_NAME 2>/dev/null || true

# Menjalankan engine dengan limitasi memori 1GB
pm2 start dist/index.js \
  --name $PROJECT_NAME \
  --node-args="--max-old-space-size=$MEMORY_LIMIT" \
  --max-memory-restart "${MEMORY_LIMIT}M"

# 8. Finalisasi & Verifikasi
echo ""
echo "🧹 [7/7] Menyimpan konfigurasi PM2..."
pm2 save

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment uWA Worker Selesai!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
pm2 list
echo ""
echo "Engine uWA berjalan dengan limit heap $MEMORY_LIMIT MB (1GB)."
echo "Gunakan 'pm2 logs $PROJECT_NAME' untuk melihat log."