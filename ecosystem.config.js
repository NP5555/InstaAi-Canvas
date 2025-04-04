module.exports = {
  apps: [{
    name: 'insta-quote-poster',
    script: 'index.js',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
    },
    cron_restart: '0 0 * * *', // Restart daily at midnight to ensure fresh scheduling
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    time: true, // Add timestamps to logs
  }]
}; 