module.exports = {
    apps: [
        {
            name: "uwa-worker",
            script: "./worker/dist/index.js",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "1024M",
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "uwa-web",
            script: "npm",
            args: "start",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
