const http = require('http');
const fs = require('fs');
const path = require('path');

const host = '127.0.0.1';
const port = Number(process.env.PLATFORM_PORT || 8080);
const rootDirectory = path.resolve(
  process.env.PLATFORM_PROJECT_ROOT || process.cwd()
);
const apiBaseUrl = process.env.PLATFORM_API_URL || '';
const apiUser = process.env.PLATFORM_API_USER || '';
const apiPassword = process.env.PLATFORM_API_PASSWORD || '';
const sourceDirectory = path.join(rootDirectory, 'source');
const formsDirectory = path.join(rootDirectory, 'forms');
const formsVueDirectory = path.join(rootDirectory, 'forms-vue');
const sourcePublishPath = process.env.SOURCE_PUBLISH_PATH ||
  '/api/vs-code/sources/publish';
const sourceDownloadPathTemplate = process.env.SOURCE_DOWNLOAD_PATH ||
  '/api/vs-code/sources/{key}';
const formDownloadPathTemplate = process.env.FORM_DOWNLOAD_PATH ||
  '/api/vs-code/forms/{key}';
const formPublishPath = process.env.FORM_PUBLISH_PATH ||
  '/api/vs-code/forms/publish';
const sourceAutoPublish = process.env.SOURCE_AUTO_PUBLISH !== 'false';
const formAutoPublish = process.env.FORM_AUTO_PUBLISH !== 'false';
const sourcePublishTimers = new Map();
const formPublishTimers = new Map();
const ignoredSourceWrites = new Map();
const ignoredFormWrites = new Map();
const knownSourceContents = new Map();
const knownFormContents = new Map();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.vue': 'text/plain; charset=utf-8'
};

function isProxyRequest(pathname) {
  return pathname === '/api' ||
    pathname.indexOf('/api/') === 0 ||
    pathname === '/eai' ||
    pathname.indexOf('/eai/') === 0 ||
    pathname === '/static' ||
    pathname.indexOf('/static/') === 0;
}

function getSanitizedProxyPath(requestUrl) {
  const query = new URLSearchParams();

  requestUrl.searchParams.forEach(function (value, name) {
    const sanitizedValue = value.replace(/\{\{[\s\S]*?\}\}/g, '').trim();

    if (sanitizedValue || value.indexOf('{{') < 0) {
      query.append(name, sanitizedValue);
    }
  });

  const queryString = query.toString();
  return requestUrl.pathname + (queryString ? '?' + queryString : '');
}

function copyRequestHeaders(request) {
  const excludedHeaders = new Set([
    'authorization',
    'connection',
    'content-length',
    'cookie',
    'host',
    'origin',
    'referer',
    'transfer-encoding'
  ]);
  const headers = {};

  Object.keys(request.headers).forEach(function (name) {
    if (!excludedHeaders.has(name.toLowerCase())) {
      headers[name] = request.headers[name];
    }
  });

  if (apiUser && apiPassword) {
    headers.authorization = 'Basic ' + Buffer
      .from(apiUser + ':' + apiPassword, 'utf8')
      .toString('base64');
  }

  return headers;
}

function copyResponseHeaders(upstreamResponse) {
  const excludedHeaders = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'set-cookie',
    'transfer-encoding'
  ]);
  const headers = {};

  upstreamResponse.headers.forEach(function (value, name) {
    if (!excludedHeaders.has(name.toLowerCase())) {
      headers[name] = value;
    }
  });

  headers['cache-control'] = 'no-store';
  return headers;
}

function readRequestBody(request) {
  return new Promise(function (resolve, reject) {
    const chunks = [];

    request.on('data', function (chunk) {
      chunks.push(chunk);
    });
    request.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
  });
}

function getApiAuthorizationHeader() {
  if (!apiUser || !apiPassword) {
    return null;
  }

  return 'Basic ' + Buffer
    .from(apiUser + ':' + apiPassword, 'utf8')
    .toString('base64');
}

function getNormalizedFilePath(filePath) {
  const resolvedPath = path.resolve(filePath);

  return process.platform === 'win32'
    ? resolvedPath.toLowerCase()
    : resolvedPath;
}

function ignoreSourceWrite(filePath, content) {
  const normalizedPath = getNormalizedFilePath(filePath);
  const expiresAt = Date.now() + 10000;

  knownSourceContents.set(normalizedPath, content);
  ignoredSourceWrites.set(normalizedPath, {
    content: content,
    expiresAt: expiresAt
  });
  setTimeout(function () {
    const ignoredWrite = ignoredSourceWrites.get(normalizedPath);

    if (ignoredWrite && ignoredWrite.expiresAt === expiresAt) {
      ignoredSourceWrites.delete(normalizedPath);
    }
  }, 10100);
}

async function shouldIgnoreSourceWrite(filePath) {
  const normalizedPath = getNormalizedFilePath(filePath);
  const ignoredWrite = ignoredSourceWrites.get(normalizedPath);

  if (!ignoredWrite || ignoredWrite.expiresAt <= Date.now()) {
    return false;
  }

  try {
    const currentContent = await fs.promises.readFile(filePath, 'utf8');

    if (currentContent === ignoredWrite.content) {
      return true;
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return true;
    }
  }

  ignoredSourceWrites.delete(normalizedPath);
  return false;
}

async function hasSourceFileChanged(filePath) {
  const normalizedPath = getNormalizedFilePath(filePath);
  const currentContent = await fs.promises.readFile(filePath, 'utf8');

  if (!knownSourceContents.has(normalizedPath)) {
    knownSourceContents.set(normalizedPath, currentContent);
    return false;
  }

  if (knownSourceContents.get(normalizedPath) === currentContent) {
    return false;
  }

  knownSourceContents.set(normalizedPath, currentContent);
  return true;
}

function rememberExistingSourceFiles() {
  fs.readdirSync(sourceDirectory, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isFile()) return;

    const extension = path.extname(entry.name).toLowerCase();
    if (!['.js', '.css', '.html'].includes(extension)) return;

    const filePath = path.join(sourceDirectory, entry.name);
    knownSourceContents.set(
      getNormalizedFilePath(filePath),
      fs.readFileSync(filePath, 'utf8')
    );
  });
}

function ignoreFormWrite(filePath, content) {
  const normalizedPath = getNormalizedFilePath(filePath);
  const expiresAt = Date.now() + 10000;

  knownFormContents.set(normalizedPath, content);
  ignoredFormWrites.set(normalizedPath, { content: content, expiresAt: expiresAt });
  setTimeout(function () {
    const ignoredWrite = ignoredFormWrites.get(normalizedPath);
    if (ignoredWrite && ignoredWrite.expiresAt === expiresAt) {
      ignoredFormWrites.delete(normalizedPath);
    }
  }, 10100);
}

async function shouldIgnoreFormWrite(filePath) {
  const normalizedPath = getNormalizedFilePath(filePath);
  const ignoredWrite = ignoredFormWrites.get(normalizedPath);

  if (!ignoredWrite || ignoredWrite.expiresAt <= Date.now()) return false;

  try {
    const currentContent = await fs.promises.readFile(filePath, 'utf8');
    if (currentContent === ignoredWrite.content) return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return true;
  }

  ignoredFormWrites.delete(normalizedPath);
  return false;
}

async function hasFormFileChanged(filePath) {
  const normalizedPath = getNormalizedFilePath(filePath);
  const currentContent = await fs.promises.readFile(filePath, 'utf8');

  if (!knownFormContents.has(normalizedPath)) {
    knownFormContents.set(normalizedPath, currentContent);
    return false;
  }

  if (knownFormContents.get(normalizedPath) === currentContent) {
    return false;
  }

  knownFormContents.set(normalizedPath, currentContent);
  return true;
}

function rememberExistingFormFiles(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(function (entry) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      rememberExistingFormFiles(filePath);
      return;
    }

    if (!entry.isFile() || !getFormDescriptor(filePath)) return;

    knownFormContents.set(
      getNormalizedFilePath(filePath),
      fs.readFileSync(filePath, 'utf8')
    );
  });
}

function writeJsonResponse(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

async function downloadSource(response, requestUrl) {
  const sourceKey = String(requestUrl.searchParams.get('key') || '').trim();

  if (!sourceKey) {
    writeJsonResponse(response, 400, {
      error: 'Informe a chave do source no parâmetro key.'
    });
    return;
  }

  if (!apiBaseUrl) {
    writeJsonResponse(response, 503, {
      error: 'Proxy local não configurado.',
      detail: 'Defina PLATFORM_API_URL antes de iniciar o servidor.'
    });
    return;
  }

  try {
    const remotePath = sourceDownloadPathTemplate.replace(
      '{key}',
      encodeURIComponent(sourceKey)
    );
    const headers = { Accept: 'application/json' };
    const authorization = getApiAuthorizationHeader();

    if (authorization) {
      headers.Authorization = authorization;
    }

    const downloadResponse = await fetch(new URL(remotePath, apiBaseUrl), {
      method: 'GET',
      headers: headers
    });
    const responseText = await downloadResponse.text();

    if (!downloadResponse.ok) {
      throw new Error(
        downloadResponse.status + ' ' + downloadResponse.statusText +
        (responseText ? ' - ' + responseText : '')
      );
    }

    let source;

    try {
      source = JSON.parse(responseText);
    } catch (error) {
      throw new Error('A API de download não retornou um JSON válido.');
    }

    if (!source || typeof source.content !== 'string') {
      throw new Error('A resposta da API não contém o campo content.');
    }

    if (!String(source.key || '').trim()) {
      throw new Error('A resposta da API não contém o campo key.');
    }

    const sourceType = String(source.type || '').trim().toLowerCase();

    if (!['js', 'css', 'html'].includes(sourceType)) {
      throw new Error('O campo type do source deve ser js, css ou html.');
    }

    const returnedKey = safeResourceName(source.key);

    if (['.js', '.css', '.html'].includes(path.extname(returnedKey).toLowerCase())) {
      throw new Error('A chave do source deve ser retornada sem extensão.');
    }

    const fileName = returnedKey + '.' + sourceType;

    const filePath = path.join(sourceDirectory, fileName);

    await fs.promises.mkdir(sourceDirectory, { recursive: true });
    ignoreSourceWrite(filePath, source.content);
    await fs.promises.writeFile(filePath, source.content, 'utf8');

    console.log('[Source] Source baixado: ' + source.key + ' -> ' + fileName);
    writeJsonResponse(response, 200, {
      key: source.key,
      type: sourceType,
      relativePath: 'source/' + fileName
    });
  } catch (error) {
    console.error('[Source] Falha ao baixar ' + sourceKey + ':', error.message);
    writeJsonResponse(response, 502, {
      error: 'Não foi possível baixar o source.',
      detail: error.message
    });
  }
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeResourceName(value) {
  const name = String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '_');

  if (!name || name === '.' || name === '..') {
    throw new Error('A API retornou uma chave de recurso inválida.');
  }

  return name;
}

function getVueFormFileName(formName, key) {
  const fallbackName = String(key || '').replace(/\.vue$/i, '').split('.').pop();
  let name = String(formName || fallbackName || 'form').trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '');

  if (!name) name = 'form';
  if (!/\.vue$/i.test(name)) name += '.vue';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    name = '_' + name;
  }

  return name;
}

async function ensureDirectoryReplacingFile(directory) {
  try {
    const stat = await fs.promises.stat(directory);
    if (stat.isFile()) await fs.promises.unlink(directory);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }

  await fs.promises.mkdir(directory, { recursive: true });
}

function getFormPartBaseName(key) {
  const parts = String(key || '').split('.');
  return safeResourceName(parts[parts.length - 1]);
}

function getFormPartFileName(key, extension) {
  return getFormPartBaseName(key) + extension;
}

function getLocalFormInclude(pathname) {
  const match = /^\/includes\/([^/]+)\/(js|css|html)\/([^/]+)$/i.exec(pathname);

  if (!match) return null;

  const key = safeResourceName(decodeURIComponent(match[1]));
  const type = match[2].toLowerCase();
  const requestedFileName = safeResourceName(decodeURIComponent(match[3]));
  const expectedFileName = getFormPartFileName(key, '.' + type);

  if (requestedFileName.toLowerCase() !== expectedFileName.toLowerCase()) {
    return null;
  }

  return {
    extension: '.' + type,
    filePath: path.join(rootDirectory, 'forms', key, expectedFileName)
  };
}

function getLocalFormPage(pathname) {
  const match = /^\/forms\/([^/]+)\/?$/i.exec(pathname);

  if (!match) return null;

  let key;
  try {
    key = decodeURIComponent(match[1]);
  } catch (error) {
    return null;
  }

  if (!key || key === '.' || key === '..' || /[\\/]/.test(key)) {
    return null;
  }

  const keyParts = key.split('.');
  const fileName = keyParts[keyParts.length - 1] + '.html';

  return {
    key: key,
    filePath: path.join(rootDirectory, 'forms', key, fileName)
  };
}

async function downloadForm(response, requestUrl) {
  const requestedKey = String(requestUrl.searchParams.get('key') || '').trim();

  if (!requestedKey) {
    writeJsonResponse(response, 400, {
      error: 'Informe a chave do form no parâmetro key.'
    });
    return;
  }

  if (!apiBaseUrl) {
    writeJsonResponse(response, 503, {
      error: 'Proxy local não configurado.',
      detail: 'Defina PLATFORM_API_URL antes de iniciar o servidor.'
    });
    return;
  }

  try {
    const remotePath = formDownloadPathTemplate.replace(
      '{key}',
      encodeURIComponent(requestedKey)
    );
    const headers = { Accept: 'application/json' };
    const authorization = getApiAuthorizationHeader();

    if (authorization) headers.Authorization = authorization;

    const formResponse = await fetch(new URL(remotePath, apiBaseUrl), {
      method: 'GET',
      headers: headers
    });
    const responseText = await formResponse.text();

    if (!formResponse.ok) {
      throw new Error(
        formResponse.status + ' ' + formResponse.statusText +
        (responseText ? ' - ' + responseText : '')
      );
    }

    let form;
    try {
      form = JSON.parse(responseText);
    } catch (error) {
      throw new Error('A API de form não retornou um JSON válido.');
    }

    if (!form || !String(form.key || '').trim()) {
      throw new Error('A resposta da API não contém a chave do form.');
    }

    const returnedKey = safeResourceName(form.key);
    const files = [];

    if (hasText(form.sfc)) {
      if (path.extname(returnedKey).toLowerCase() !== '.vue') {
        throw new Error('A chave de um form SFC precisa terminar em .vue.');
      }

      const fileName = getVueFormFileName(form.name, returnedKey);
      const formDirectory = path.join(formsVueDirectory, returnedKey);
      const relativePath = 'forms-vue/' + returnedKey + '/' + fileName;
      const filePath = path.join(formDirectory, fileName);
      await ensureDirectoryReplacingFile(formDirectory);
      ignoreFormWrite(filePath, form.sfc);
      await fs.promises.writeFile(filePath, form.sfc, 'utf8');
      files.push({ type: 'sfc', relativePath: relativePath });
    } else {
      const formDirectory = path.join(formsDirectory, returnedKey);
      const parts = [
        { field: 'html', extension: '.html' },
        { field: 'css', extension: '.css' },
        { field: 'js', extension: '.js' },
        { field: 'xml', extension: '.xml' }
      ];

      for (const part of parts) {
        if (!hasText(form[part.field])) continue;
        const fileName = getFormPartFileName(returnedKey, part.extension);
        const relativePath = 'forms/' + returnedKey + '/' + fileName;
        const filePath = path.join(formDirectory, fileName);

        await fs.promises.mkdir(formDirectory, { recursive: true });
        ignoreFormWrite(filePath, form[part.field]);
        await fs.promises.writeFile(filePath, form[part.field], 'utf8');
        files.push({ type: part.field, relativePath: relativePath });
      }
    }

    if (files.length === 0) {
      throw new Error('O form não possui conteúdo HTML, CSS, JS, XML ou SFC.');
    }

    console.log(
      '[Forms] Form baixado: ' + form.key + ' -> ' +
      files.map(function (file) { return file.relativePath; }).join(', ')
    );
    writeJsonResponse(response, 200, {
      key: form.key,
      files: files
    });
  } catch (error) {
    console.error('[Forms] Falha ao baixar ' + requestedKey + ':', error.message);
    writeJsonResponse(response, 502, {
      error: 'Não foi possível baixar o form.',
      detail: error.message
    });
  }
}

async function publishSource(filePath, throwOnError) {
  if (!apiBaseUrl) {
    const error = new Error('Proxy da API não configurado.');
    console.error('[Source] Publicação ignorada:', error.message);
    if (throwOnError) throw error;
    return;
  }

  const relativePath = path.relative(sourceDirectory, filePath)
    .split(path.sep)
    .join('/');

  if (
    relativePath.startsWith('../') ||
    path.isAbsolute(relativePath) ||
    relativePath !== path.basename(relativePath) ||
    !['.js', '.css', '.html'].includes(path.extname(relativePath).toLowerCase())
  ) {
    if (throwOnError) throw new Error('Arquivo de source inválido.');
    return;
  }

  try {
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      return;
    }

    const content = await fs.promises.readFile(filePath, 'utf8');
    const extension = path.extname(relativePath).toLowerCase();
    const payload = {
      key: path.basename(relativePath, extension),
      type: extension.slice(1),
      content: content
    };
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    };
    const authorization = getApiAuthorizationHeader();

    if (authorization) {
      headers.Authorization = authorization;
    }

    const targetUrl = new URL(sourcePublishPath, apiBaseUrl);
    const publishResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    const responseText = await publishResponse.text();

    if (!publishResponse.ok) {
      throw new Error(
        publishResponse.status + ' ' + publishResponse.statusText +
        (responseText ? ' - ' + responseText : '')
      );
    }

    console.log(
      '[Source] Publicado: ' + payload.key +
      (responseText ? ' - ' + responseText : '')
    );
    return payload.key;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }

    console.error(
      '[Source] Falha ao publicar ' + relativePath + ':',
      error.message
    );
    if (throwOnError) throw error;
  }
}

function scheduleSourcePublish(filePath) {
  const currentTimer = sourcePublishTimers.get(filePath);

  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  sourcePublishTimers.set(filePath, setTimeout(async function () {
    sourcePublishTimers.delete(filePath);

    if (!await isExistingFile(filePath)) {
      return;
    }

    if (await shouldIgnoreSourceWrite(filePath)) {
      return;
    }

    if (!await hasSourceFileChanged(filePath)) {
      return;
    }

    publishSource(filePath);
  }, 350));
}

async function isExistingFile(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function watchSources() {
  if (!sourceAutoPublish) {
    console.log('[Source] Publicação automática desativada.');
    return;
  }

  fs.mkdirSync(sourceDirectory, { recursive: true });
  rememberExistingSourceFiles();

  fs.watch(sourceDirectory, { recursive: true }, function (eventType, fileName) {
    if (!fileName || !['.js', '.css', '.html'].includes(path.extname(fileName).toLowerCase())) {
      return;
    }

    const filePath = path.resolve(sourceDirectory, fileName);
    const relativeToSource = path.relative(sourceDirectory, filePath);

    if (
      relativeToSource.startsWith('..') ||
      path.isAbsolute(relativeToSource)
    ) {
      return;
    }

    scheduleSourcePublish(filePath);
  });

  console.log(
    '[Source] Observando .js, .css e .html; publicação em ' + sourcePublishPath
  );
}

function getFormDescriptor(filePath) {
  const relativeVuePath = path.relative(formsVueDirectory, filePath);

  if (
    !relativeVuePath.startsWith('..') &&
    !path.isAbsolute(relativeVuePath) &&
    relativeVuePath.split(path.sep).length === 2 &&
    path.extname(relativeVuePath).toLowerCase() === '.vue'
  ) {
    const vueParts = relativeVuePath.split(path.sep);
    return {
      type: 'sfc',
      key: vueParts[0],
      filePath: filePath
    };
  }

  const relativePath = path.relative(formsDirectory, filePath);
  const parts = relativePath.split(path.sep);

  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath) ||
    parts.length !== 2
  ) {
    return null;
  }

  const fileName = parts[1].toLowerCase();
  const extension = path.extname(fileName).toLowerCase() || fileName;
  const fileTypes = {
    '.html': 'html',
    '.css': 'css',
    '.js': 'js',
    '.xml': 'xml'
  };
  const type = fileTypes[extension];
  if (!type) return null;

  const expectedName = getFormPartFileName(parts[0], extension).toLowerCase();

  if (fileName !== expectedName && fileName !== extension) {
    return null;
  }

  return {
    type: type,
    key: parts[0]
  };
}

async function readOptionalFormPart(key, extension) {
  const candidates = [getFormPartFileName(key, extension), extension];

  for (const fileName of candidates) {
    const filePath = path.join(rootDirectory, 'forms', key, fileName);

    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return hasText(content) ? content : null;
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }

  return null;
}

function parseSfcAttributes(rawAttributes) {
  const attributes = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(rawAttributes || '')) !== null) {
    attributes[match[1].toLowerCase()] =
      match[2] !== undefined ? match[2] :
      match[3] !== undefined ? match[3] :
      match[4] !== undefined ? match[4] : true;
  }

  return attributes;
}

function extractSingleSfcBlock(sfc, tagName, required) {
  const pattern = new RegExp(
    '<' + tagName + '([^>]*)>([\\s\\S]*?)<\\/' + tagName + '\\s*>',
    'gi'
  );
  const blocks = [];
  let match;

  while ((match = pattern.exec(sfc)) !== null) {
    blocks.push({
      attributes: parseSfcAttributes(match[1]),
      content: match[2].replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '')
    });
  }

  if (required && blocks.length === 0) {
    throw new Error('O SFC precisa possuir um bloco <' + tagName + '>.');
  }
  if (blocks.length > 1) {
    throw new Error(
      'O SFC possui múltiplos blocos <' + tagName + '>; apenas um é suportado.'
    );
  }

  return blocks[0] || null;
}

function splitSfc(sfc) {
  const template = extractSingleSfcBlock(sfc, 'template', true);
  const script = extractSingleSfcBlock(sfc, 'script', true);
  const style = extractSingleSfcBlock(sfc, 'style', false);

  if (Object.prototype.hasOwnProperty.call(script.attributes, 'setup')) {
    throw new Error('<script setup> ainda não é suportado na publicação.');
  }
  if (script.attributes.lang && script.attributes.lang !== 'js' &&
      script.attributes.lang !== 'javascript') {
    throw new Error('Somente JavaScript simples é suportado no bloco <script>.');
  }
  if (style && style.attributes.lang && style.attributes.lang !== 'css') {
    throw new Error('Preprocessadores de CSS ainda não são suportados.');
  }

  return {
    html: hasText(template.content) ? template.content : null,
    js: hasText(script.content) ? script.content : null,
    css: style && hasText(style.content) ? style.content : null,
    styleScoped: Boolean(
      style && Object.prototype.hasOwnProperty.call(style.attributes, 'scoped')
    )
  };
}

async function publishForm(descriptor, throwOnError) {
  if (!apiBaseUrl) {
    const error = new Error('Proxy da API não configurado.');
    console.error('[Forms] Publicação ignorada:', error.message);
    if (throwOnError) throw error;
    return;
  }

  try {
    let payload;

    if (descriptor.type === 'sfc') {
      const sfcPath = descriptor.filePath;
      const sfc = await fs.promises.readFile(sfcPath, 'utf8');
      const parts = splitSfc(sfc);
      payload = {
        key: descriptor.key,
        html: parts.html,
        css: parts.css,
        js: parts.js,
        sfc: null,
        styleScoped: parts.styleScoped
      };
    } else {
      const xml = await readOptionalFormPart(descriptor.key, '.xml');
      payload = {
        key: descriptor.key,
        html: await readOptionalFormPart(descriptor.key, '.html'),
        css: await readOptionalFormPart(descriptor.key, '.css'),
        js: await readOptionalFormPart(descriptor.key, '.js'),
        xml: xml,
        sfc: null
      };
    }

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    };
    const authorization = getApiAuthorizationHeader();
    if (authorization) headers.Authorization = authorization;

    const publishResponse = await fetch(new URL(formPublishPath, apiBaseUrl), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    const responseText = await publishResponse.text();

    if (!publishResponse.ok) {
      throw new Error(
        publishResponse.status + ' ' + publishResponse.statusText +
        (responseText ? ' - ' + responseText : '')
      );
    }

    console.log(
      '[Forms] Publicado: ' + payload.key +
      (responseText ? ' - ' + responseText : '')
    );
    return payload.key;
  } catch (error) {
    if (error && error.code === 'ENOENT' && !throwOnError) return;
    console.error('[Forms] Falha ao publicar ' + descriptor.key + ':', error.message);
    if (throwOnError) throw error;
  }
}

async function publishLocalResource(response, requestUrl) {
  try {
    const requestedPath = requestUrl.searchParams.get('path');
    const requestedType = requestUrl.searchParams.get('type');
    const requestedKey = requestUrl.searchParams.get('key');
    const filePath = path.resolve(rootDirectory, String(requestedPath || ''));
    const relativeToRoot = path.relative(rootDirectory, filePath);

    if (
      !requestedPath ||
      relativeToRoot.startsWith('..') ||
      path.isAbsolute(relativeToRoot)
    ) {
      throw new Error('Caminho de recurso inválido.');
    }

    let formDescriptor = getFormDescriptor(filePath);
    let type;
    let key;

    if (requestedType === 'form') {
      if (
        !requestedKey ||
        requestedKey !== path.basename(requestedKey) ||
        /[\\/]/.test(requestedKey)
      ) {
        throw new Error('Chave de form inválida.');
      }

      if (!formDescriptor || formDescriptor.key !== requestedKey) {
        formDescriptor = {
          type: 'form',
          key: requestedKey
        };
      }
    }

    if (formDescriptor) {
      type = 'form';
      key = await publishForm(formDescriptor, true);
    } else {
      type = 'source';
      key = await publishSource(filePath, true);
    }

    writeJsonResponse(response, 200, { type: type, key: key });
  } catch (error) {
    writeJsonResponse(response, 502, {
      error: 'Não foi possível publicar o recurso.',
      detail: error.message
    });
  }
}

function scheduleFormPublish(filePath) {
  const descriptor = getFormDescriptor(filePath);
  if (!descriptor) return;

  const timerKey = (descriptor.type === 'sfc' ? 'sfc:' : 'form:') +
    descriptor.key;
  const currentTimer = formPublishTimers.get(timerKey);
  if (currentTimer) clearTimeout(currentTimer);

  formPublishTimers.set(timerKey, setTimeout(async function () {
    formPublishTimers.delete(timerKey);

    if (!await isExistingFile(filePath)) return;
    if (await shouldIgnoreFormWrite(filePath)) return;
    if (!await hasFormFileChanged(filePath)) return;

    publishForm(descriptor);
  }, 350));
}

function watchForms() {
  if (!formAutoPublish) {
    console.log('[Forms] Publicação automática desativada.');
    return;
  }

  fs.mkdirSync(formsDirectory, { recursive: true });
  fs.mkdirSync(formsVueDirectory, { recursive: true });
  rememberExistingFormFiles(formsDirectory);
  rememberExistingFormFiles(formsVueDirectory);

  fs.watch(formsDirectory, { recursive: true }, function (eventType, fileName) {
    if (!fileName) return;
    scheduleFormPublish(path.resolve(formsDirectory, fileName));
  });

  fs.watch(formsVueDirectory, { recursive: true }, function (eventType, fileName) {
    if (!fileName) return;
    scheduleFormPublish(path.resolve(formsVueDirectory, fileName));
  });

  console.log(
    '[Forms] Observando forms e forms-vue; publicação em ' + formPublishPath
  );
}

async function proxyApiRequest(request, response, requestUrl) {
  if (!apiBaseUrl) {
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      error: 'Proxy local não configurado.',
      detail: 'Defina PLATFORM_API_URL antes de iniciar o servidor.'
    }));
    return;
  }

  try {
    const targetUrl = new URL(
      getSanitizedProxyPath(requestUrl),
      apiBaseUrl
    );
    const method = request.method || 'GET';
    const fetchOptions = {
      method: method,
      headers: copyRequestHeaders(request),
      redirect: 'manual'
    };

    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = await readRequestBody(request);
    }

    const upstreamResponse = await fetch(targetUrl, fetchOptions);
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());

    response.writeHead(
      upstreamResponse.status,
      copyResponseHeaders(upstreamResponse)
    );
    response.end(responseBody);
  } catch (error) {
    console.error('Falha no proxy da API:', error.message);
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      error: 'Não foi possível acessar a API remota.'
    }));
  }
}

const server = http.createServer(function (request, response) {
  const requestUrl = new URL(request.url, 'http://' + request.headers.host);
  const localFormInclude = request.method === 'GET'
    ? getLocalFormInclude(requestUrl.pathname)
    : null;
  const localFormPage = request.method === 'GET'
    ? getLocalFormPage(requestUrl.pathname)
    : null;

  if (localFormPage) {
    fs.stat(localFormPage.filePath, function (error, stats) {
      if (error || !stats.isFile()) {
        response.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        response.end(
          'HTML do form "' + localFormPage.key + '" não encontrado localmente.'
        );
        return;
      }

      response.writeHead(200, {
        'Content-Type': contentTypes['.html'],
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(localFormPage.filePath).pipe(response);
    });
    return;
  }

  if (localFormInclude) {
    fs.stat(localFormInclude.filePath, function (error, stats) {
      if (error || !stats.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Fragmento do form não encontrado.');
        return;
      }

      response.writeHead(200, {
        'Content-Type': contentTypes[localFormInclude.extension],
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(localFormInclude.filePath).pipe(response);
    });
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/__platform/source'
  ) {
    downloadSource(response, requestUrl);
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/__platform/form'
  ) {
    downloadForm(response, requestUrl);
    return;
  }

  if (
    request.method === 'POST' &&
    requestUrl.pathname === '/__platform/publish'
  ) {
    publishLocalResource(response, requestUrl);
    return;
  }

  if (isProxyRequest(requestUrl.pathname)) {
    proxyApiRequest(request, response, requestUrl);
    return;
  }

  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const filePath = path.resolve(rootDirectory, relativePath);
  const relativeToRoot = path.relative(rootDirectory, filePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Acesso negado.');
    return;
  }

  fs.stat(filePath, function (statError, stats) {
    if (statError || !stats.isFile()) {
      if (
        request.method === 'GET' &&
        path.extname(requestedPath) === ''
      ) {
        response.writeHead(200, {
          'Content-Type': contentTypes['.html'],
          'Cache-Control': 'no-store'
        });
        fs.createReadStream(path.join(rootDirectory, 'index.html')).pipe(response);
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Arquivo não encontrado.');
      return;
    }

    const extension = path.extname(filePath).toLowerCase() ||
      path.basename(filePath).toLowerCase();

    response.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });

    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(port, host, function () {
  console.log('Dashboard disponível em http://' + host + ':' + port);
  if (apiBaseUrl) {
    console.log('Proxy /api e /eai ativo para ' + new URL(apiBaseUrl).origin);
  } else {
    console.log('Proxy /api desativado.');
  }
  watchSources();
  watchForms();
  console.log('Pressione Ctrl+C para encerrar.');
});
