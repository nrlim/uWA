import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const data = await request.formData();

        // 0. Check for explicit delete request (used by clearImage)
        const deleteUrl = data.get('deleteUrl') as string | null;
        if (deleteUrl) {
            const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uwa-bucket';
            try {
                if (supabase) {
                    if (deleteUrl.includes(`${bucketName}/`)) {
                        const parts = deleteUrl.split(`${bucketName}/`);
                        if (parts.length > 1) {
                            const oldPath = parts.slice(1).join(`${bucketName}/`);
                            console.log(`[DELETE-ONLY] Removing file: ${oldPath}`);
                            const { error: removeError } = await supabase.storage.from(bucketName).remove([oldPath]);
                            if (removeError) console.warn('Delete error:', removeError);
                        }
                    }
                }
            } catch (e) { console.error('Delete exception:', e); }
            return NextResponse.json({ success: true, message: 'Deleted' });
        }

        const file: File | null = data.get('file') as unknown as File;

        if (!file) {
            return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // 1. Try Supabase Upload
        if (supabase) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${fileName}`; // Just filename for root of bucket

            const bucketName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uwa-bucket';

            // 1.1 Handle Old File Deletion (Optimization)
            const oldUrl = data.get('oldUrl') as string | null;
            if (oldUrl) {
                try {
                    // Extract path from URL: .../storage/v1/object/public/uwa-bucket/folder/file.jpg
                    // We need the path relative to the bucket.
                    // Robust extraction: Find the bucket name in the URL and take everything after it.
                    let oldPath = '';
                    if (oldUrl.includes(`${bucketName}/`)) {
                        const parts = oldUrl.split(`${bucketName}/`);
                        if (parts.length > 1) {
                            // Join back the rest parts just in case the filename itself contains the bucket name (unlikely but safe)
                            oldPath = parts.slice(1).join(`${bucketName}/`);
                        }
                    }

                    if (oldPath) {
                        console.log(`[CLEANUP] Removing old file: ${oldPath}`);
                        const { error: removeError } = await supabase
                            .storage
                            .from(bucketName)
                            .remove([oldPath]);

                        if (removeError) {
                            console.warn('[CLEANUP] Failed to remove old file (non-fatal):', removeError.message);
                        } else {
                            console.log('[CLEANUP] Old file removed successfully.');
                        }
                    }
                } catch (e) {
                    console.warn('[CLEANUP] Error parsing old URL:', e);
                }
            }

            try {
                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from(bucketName)
                    .upload(filePath, buffer, {
                        contentType: file.type,
                        upsert: false
                    });

                if (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                    // Fallback to local is handled below if this block fails via throw or just explicit fallback?
                    // Let's just log and continue to fallback if it's a specific error?
                    // Actually, if supabase is configured but fails (e.g. network/bucket), we might want to fallback.
                } else {
                    const { data: { publicUrl } } = supabase
                        .storage
                        .from(bucketName)
                        .getPublicUrl(filePath);

                    return NextResponse.json({ success: true, url: publicUrl });
                }
            } catch (err) {
                console.error('Unexpected Supabase error:', err);
                // Continue to fallback
            }
        }

        // 2. Local Filesystem Fallback
        console.log('Falling back to local filesystem storage...');

        // Ensure upload directory exists
        const uploadDir = join(process.cwd(), 'public', 'uploads');
        try {
            await mkdir(uploadDir, { recursive: true });
        } catch (e) {
            // Ignore if exists
        }

        // Ensure unique filename
        const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const path = join(uploadDir, filename);

        await writeFile(path, buffer);

        const url = `/uploads/${filename}`;

        return NextResponse.json({ success: true, url });
    } catch (error) {
        console.error('Error saving file:', error);
        return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
    }
}
