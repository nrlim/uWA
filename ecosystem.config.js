module.exports = {
    apps: [
        {
            name: 'uwa-worker',
            script: './dist/index.js',
            interpreter: 'node',
            node_args: '--max-old-space-size=1024',
            max_memory_restart: '1024M',
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production',
            },
            cwd: './worker'
        }
    ],
};
