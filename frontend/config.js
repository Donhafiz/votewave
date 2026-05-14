// config.js - Application configuration
export default {
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    wsUrl: process.env.WS_URL || 'ws://localhost:3000',
    appName: 'VoteWave',
    version: '1.0.0'
};
