/**
 * NEXUS-X MD - Main Bot File (Panel-Optimized)
 * Create By SHADOW OFFICIAL
 * Contact: +923271054080
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const figlet = require('figlet');
const { spawn } = require('child_process');

const PAIRING_DIR = './kingbadboitimewisher/pairing/';
const AUTH_FILE = './auth.json';

// ========== CONFIGURATION ==========
const CONFIG = {
    keepAliveInterval: 30, // Seconds between keep-alive pings
    memoryCheckInterval: 60, // Seconds between memory checks
    maxMemoryMB: 500, // Max memory before auto-restart
    restartDelay: 5000, // Delay before restarting
    logFile: './bot.log' // Log file for panel to see activity
};

// ========== COLOR CONFIG ==========
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

// ========== LOGGING SYSTEM ==========
const log = (message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        error: '\x1b[31m',
        warn: '\x1b[33m',
        debug: '\x1b[90m'
    };
    const prefix = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warn: '⚠️',
        debug: '🔍'
    };
    console.log(`${colors[type] || colors.info}[${timestamp}] ${prefix[type] || 'ℹ️'} ${message}\x1b[0m`);
    
    // Also write to log file for panel to detect activity
    try {
        fs.appendFileSync(CONFIG.logFile, `[${timestamp}] ${message}\n`);
    } catch (err) {
        // Silently fail
    }
};

// ========== PANEL KEEP-ALIVE SYSTEM ==========
const startPanelKeepAlive = () => {
    log('🔄 Starting panel keep-alive system...', 'info');
    
    // Update log file every 30 seconds to show activity
    setInterval(() => {
        try {
            const timestamp = new Date().toISOString();
            const memory = process.memoryUsage();
            const memMB = (memory.rss / 1024 / 1024).toFixed(2);
            
            // Write to log file - this keeps panel thinking bot is active
            fs.appendFileSync(CONFIG.logFile, `[${timestamp}] KEEP-ALIVE | Memory: ${memMB}MB | Uptime: ${Math.floor(process.uptime())}s\n`);
            
            // Also update auth.json timestamp
            if (fs.existsSync(AUTH_FILE)) {
                fs.utimesSync(AUTH_FILE, new Date(), new Date());
            }
            
        } catch (err) {
            // Silently fail
        }
    }, CONFIG.keepAliveInterval * 1000);
    
    // Memory monitoring - restart if memory too high
    setInterval(() => {
        try {
            const memory = process.memoryUsage();
            const memMB = memory.rss / 1024 / 1024;
            
            if (memMB > CONFIG.maxMemoryMB) {
                log(`⚠️ Memory usage high: ${memMB.toFixed(2)}MB. Restarting...`, 'warn');
                process.exit(0); // Panel will auto-restart
            }
        } catch (err) {
            // Silently fail
        }
    }, CONFIG.memoryCheckInterval * 1000);
    
    log(`✅ Panel keep-alive active (every ${CONFIG.keepAliveInterval}s)`, 'success');
};

// ========== CONSOLE OUTPUT KEEPER ==========
const startConsoleKeeper = () => {
    // Keep printing to console so panel sees activity
    let counter = 0;
    setInterval(() => {
        counter++;
        const memory = process.memoryUsage();
        const memMB = (memory.rss / 1024 / 1024).toFixed(2);
        const uptime = Math.floor(process.uptime());
        
        // Only show every 5th message to keep console clean
        if (counter % 5 === 0) {
            log(`📊 Status | Uptime: ${uptime}s | Memory: ${memMB}MB | Active: ${getActiveSessions()}`, 'debug');
        }
    }, 10 * 1000);
};

// ========== GET ACTIVE SESSIONS ==========
const getActiveSessions = () => {
    try {
        if (!fs.existsSync(PAIRING_DIR)) return 0;
        const entries = fs.readdirSync(PAIRING_DIR, { withFileTypes: true });
        return entries.filter(e => e.isDirectory() && e.name.endsWith('@s.whatsapp.net')).length;
    } catch {
        return 0;
    }
};

// ========== SPAWN BOT PROCESS WITH AUTO-RESTART ==========
let botProcess = null;
let restartCount = 0;
const MAX_RESTARTS = 50; // Prevent infinite restart loops

const spawnBot = () => {
    if (restartCount > MAX_RESTARTS) {
        log('⚠️ Max restarts reached. Waiting 5 minutes...', 'warn');
        setTimeout(() => {
            restartCount = 0;
            spawnBot();
        }, 5 * 60 * 1000);
        return;
    }
    
    log(`🚀 Starting bot process (attempt ${restartCount + 1})...`, 'info');
    
    // Spawn bot.js as a child process
    botProcess = spawn('node', ['bot.js'], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, PANEL_MODE: 'true' }
    });
    
    // Forward output to console
    botProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.log(`[BOT] ${output}`);
            // Also write to log file
            try {
                fs.appendFileSync(CONFIG.logFile, `[BOT] ${output}\n`);
            } catch (err) {}
        }
    });
    
    botProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            console.error(`[BOT ERROR] ${output}`);
            // Also write to log file
            try {
                fs.appendFileSync(CONFIG.logFile, `[BOT ERROR] ${output}\n`);
            } catch (err) {}
        }
    });
    
    // Handle process exit
    botProcess.on('exit', (code, signal) => {
        log(`⚠️ Bot process exited with code ${code}, signal ${signal}`, 'warn');
        
        // Restart after delay
        setTimeout(() => {
            restartCount++;
            spawnBot();
        }, CONFIG.restartDelay);
    });
    
    // Handle errors
    botProcess.on('error', (err) => {
        log(`❌ Bot process error: ${err.message}`, 'error');
        setTimeout(() => {
            restartCount++;
            spawnBot();
        }, CONFIG.restartDelay);
    });
    
    return botProcess;
};

// ========== AUTO-LOAD PAIRED USERS ==========
const autoLoadPairs = async () => {
    log('🔄 Auto-loading paired users...', 'info');
    
    if (!fs.existsSync(PAIRING_DIR)) {
        log('❌ Pairing directory not found.', 'error');
        return;
    }

    const pairedUsers = fs.readdirSync(PAIRING_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => name.endsWith('@s.whatsapp.net'));

    if (pairedUsers.length === 0) {
        log('ℹ️ No paired users found.', 'info');
        return;
    }

    log(`✅ Found ${pairedUsers.length} paired users.`, 'success');
};

// ========== INITIALIZE BOT ==========
const initializeBot = async () => {
    console.clear();
    console.log(chalk.cyan(figlet.textSync('NEXUS-X', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    })));
    
    console.log(chalk.yellow('\n═══════════════════════════════════════════════'));
    console.log(chalk.green('   𝙽𝙴𝚇𝚄𝚂-𝚇 𝙿𝙰𝙽𝙴𝙻 𝙾𝙿𝚃𝙸𝙼𝙸𝚉𝙴𝙳       '));
    console.log(chalk.yellow('═══════════════════════════════════════════════\n'));

    // Start panel keep-alive FIRST
    startPanelKeepAlive();
    startConsoleKeeper();

    // Auto-load pairs
    await autoLoadPairs();

    // Spawn bot as child process
    spawnBot();

    // Write initial log
    try {
        fs.writeFileSync(CONFIG.logFile, `=== NEXUS-X BOT STARTED ===\n`);
        fs.appendFileSync(CONFIG.logFile, `Started at: ${new Date().toISOString()}\n`);
        fs.appendFileSync(CONFIG.logFile, `PID: ${process.pid}\n`);
        fs.appendFileSync(CONFIG.logFile, `Node version: ${process.version}\n`);
        fs.appendFileSync(CONFIG.logFile, `=== SYSTEM READY ===\n\n`);
    } catch (err) {}

    console.log(chalk.green('\n✅ NEXUS-X system is ready and running!\n'));
    console.log(chalk.blue('📊 Bot monitoring active...'));
    console.log(chalk.gray(`🔄 Keep-alive: Every ${CONFIG.keepAliveInterval}s`));
    console.log(chalk.gray(`💾 Memory limit: ${CONFIG.maxMemoryMB}MB`));
    console.log(chalk.gray(`📝 Log file: ${CONFIG.logFile}`));
    console.log(chalk.gray('💡 Press Ctrl+C to stop the bot\n'));
};

// ========== GRACEFUL SHUTDOWN ==========
const gracefulShutdown = () => {
    console.log(chalk.yellow('\n\n⚠️ Shutting down gracefully...'));
    
    if (botProcess) {
        console.log(chalk.gray('Stopping bot process...'));
        botProcess.kill();
    }
    
    console.log(chalk.green('👋 Goodbye!'));
    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ========== START THE BOT ==========
initializeBot().catch((error) => {
    console.log(chalk.red('\n❌ Fatal error during initialization:'));
    console.log(chalk.yellow('Error:'), error.message);
    if (error.stack) {
        console.log(chalk.gray(error.stack));
    }
    
    // Keep trying to restart
    setTimeout(() => {
        console.log(chalk.green('🔄 Restarting...'));
        initializeBot().catch(() => {});
    }, 5000);
});
