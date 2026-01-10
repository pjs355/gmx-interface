#!/usr/bin/env node
import readline from 'readline';
import { spawn } from 'child_process';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(`
${COLORS.cyan}${COLORS.bright}╔══════════════════════════════════════════════════════════════╗
║                   LevelUp Predictions                        ║
║                    Development Server                        ║
╚══════════════════════════════════════════════════════════════╝${COLORS.reset}
`);

console.log(`${COLORS.bright}Select environment:${COLORS.reset}
  
  ${COLORS.green}[1] LIVE${COLORS.reset}  ${COLORS.dim}→ Production API + Production Contracts${COLORS.reset}
      ${COLORS.dim}API: https://prediction-api-production.up.railway.app${COLORS.reset}
      ${COLORS.dim}Real data, real contracts on Base${COLORS.reset}
  
  ${COLORS.yellow}[2] TEST${COLORS.reset}  ${COLORS.dim}→ Local API + Testnet Contracts${COLORS.reset}
      ${COLORS.dim}API: http://localhost:8080${COLORS.reset}
      ${COLORS.dim}Test data, test contracts${COLORS.reset}
`);

rl.question(`${COLORS.magenta}Enter choice (1 or 2): ${COLORS.reset}`, (answer) => {
  rl.close();
  
  const choice = answer.trim();
  let envMode;
  
  if (choice === '1' || choice.toLowerCase() === 'live') {
    envMode = 'production';
    console.log(`\n${COLORS.green}✓ Starting with LIVE environment...${COLORS.reset}\n`);
  } else if (choice === '2' || choice.toLowerCase() === 'test') {
    envMode = 'testnet';
    console.log(`\n${COLORS.yellow}✓ Starting with TEST environment...${COLORS.reset}\n`);
  } else {
    // Default to testnet for safety
    envMode = 'testnet';
    console.log(`\n${COLORS.yellow}⚠ Invalid choice, defaulting to TEST environment...${COLORS.reset}\n`);
  }
  
  // Set environment variable and spawn vite
  const vite = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      VITE_ENVIRONMENT_MODE: envMode,
    },
  });
  
  vite.on('close', (code) => {
    process.exit(code);
  });
});

