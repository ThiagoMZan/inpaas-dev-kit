'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const projectRoot = __dirname;
const platformApiUrl = 'https://ambiente.plusoftomni.com.br';
const platformApiUser = 'usuario@plusoft.com';
// Opcional: preencha para não solicitar a senha no terminal.
const configuredApiPassword = '';
const devKitRoot = process.env.INPAAS_DEV_KIT_ROOT ||
  path.resolve(projectRoot, '..', 'inpaas-dev-kit');
const serverPath = path.join(devKitRoot, 'runtime', 'server.js');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readPassword() {
  if (configuredApiPassword) {
    return Promise.resolve(configuredApiPassword);
  }

  if (process.env.PLATFORM_API_PASSWORD) {
    return Promise.resolve(process.env.PLATFORM_API_PASSWORD);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(
      new Error(
        'PLATFORM_API_PASSWORD não definida e não foi possível solicitar a senha no terminal.'
      )
    );
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const rl = readline.createInterface({ input: stdin, output: stdout });

    stdout.write('Senha da API: ');
    stdin.setRawMode(true);
    stdin.resume();

    let password = '';
    const onData = (data) => {
      const character = data.toString('utf8');

      if (character === '\u0003') {
        stdout.write('\n');
        rl.close();
        process.exit(130);
      }

      if (character === '\r' || character === '\n') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        rl.close();
        stdout.write('\n');
        resolve(password);
        return;
      }

      if (character === '\u0008' || character === '\u007f') {
        password = password.slice(0, -1);
        return;
      }

      password += character;
    };

    stdin.on('data', onData);
  });
}

async function main() {
  if (!fs.existsSync(serverPath)) {
    throw new Error(
      'Runtime compartilhado do inPaaS Dev Kit não encontrado: ' + serverPath
    );
  }

  const configuredApiPassword = '';
  const password = await readPassword();
  const environment = {
    ...process.env,
    PLATFORM_API_URL: platformApiUrl,
    PLATFORM_API_USER: platformApiUser,
    PLATFORM_API_PASSWORD: password,
    PLATFORM_PROJECT_ROOT: projectRoot,
    SOURCE_AUTO_PUBLISH: 'true',
    SOURCE_PUBLISH_PATH: '/api/vs-code/sources/publish',
    SOURCE_DOWNLOAD_PATH: '/api/vs-code/sources/{key}',
    FORM_AUTO_PUBLISH: 'true',
    FORM_DOWNLOAD_PATH: '/api/vs-code/forms/{key}',
    FORM_PUBLISH_PATH: '/api/vs-code/forms/publish'
  };

  const server = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit'
  });

  server.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code === null ? 1 : code;
  });

  server.on('error', (error) => {
    fail('Falha ao iniciar o servidor local: ' + error.message);
  });
}

main().catch((error) => fail(error.message));
