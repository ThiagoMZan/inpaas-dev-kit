const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const pendingDownloads = new Map();
const metadataCache = new Map();
let queryResultPanel = null;
let outputChannel = null;

function writeOutput(level, message, error) {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('inPaaS');
  }

  const timestamp = new Date().toISOString();
  outputChannel.appendLine(
    '[' + timestamp + '] [' + level + '] ' + message
  );

  if (error && error.stack) {
    outputChannel.appendLine(error.stack);
  }
}

function reportError(context, error) {
  const detail = error && error.message ? error.message : String(error);

  writeOutput('ERROR', context + ': ' + detail, error);
  outputChannel.show(true);
  vscode.window.showErrorMessage('inPaaS: ' + detail);
}

function requestJson(url, options) {
  options = options || {};

  return new Promise(function (resolve, reject) {
    const client = url.protocol === 'https:' ? https : http;
    const body = options.body === undefined
      ? null
      : Buffer.from(JSON.stringify(options.body), 'utf8');
    const headers = Object.assign({ Accept: 'application/json' }, options.headers);

    if (body) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = body.length;
    }

    const request = client.request(url, {
      method: options.method || 'GET',
      headers: headers
    }, function (response) {
      const chunks = [];

      response.on('data', function (chunk) {
        chunks.push(chunk);
      });

      response.on('end', function () {
        const responseText = Buffer.concat(chunks).toString('utf8');
        let responseBody = {};

        if (responseText) {
          try {
            responseBody = JSON.parse(responseText);
          } catch (error) {
            reject(new Error('O servidor local não retornou um JSON válido.'));
            return;
          }
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(
            responseBody.detail || responseBody.message || responseBody.error ||
            ('O servidor respondeu com HTTP ' + response.statusCode + '.')
          ));
          return;
        }

        resolve(responseBody);
      });
    });

    request.setTimeout(30000, function () {
      request.destroy(new Error('Tempo limite ao acessar o servidor local.'));
    });
    request.on('error', reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

function requestText(url, options) {
  options = options || {};

  return new Promise(function (resolve, reject) {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, {
      method: options.method || 'GET',
      headers: Object.assign({ Accept: 'application/xml, text/xml, */*' }, options.headers)
    }, function (response) {
      const chunks = [];

      response.on('data', function (chunk) {
        chunks.push(chunk);
      });

      response.on('end', function () {
        const responseText = Buffer.concat(chunks).toString('utf8');

        if (response.statusCode < 200 || response.statusCode >= 300) {
          let detail = responseText;

          try {
            const responseBody = JSON.parse(responseText);
            detail = responseBody.detail || responseBody.message ||
              responseBody.error || detail;
          } catch (_error) {}

          reject(new Error(
            detail || ('O servidor respondeu com HTTP ' + response.statusCode + '.')
          ));
          return;
        }

        resolve({
          content: responseText,
          headers: response.headers
        });
      });
    });

    request.setTimeout(30000, function () {
      request.destroy(new Error('Tempo limite ao acessar o servidor local.'));
    });
    request.on('error', reject);
    request.end();
  });
}

async function selectWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders || [];

  if (folders.length === 0) {
    throw new Error('Abra a pasta do projeto antes de continuar.');
  }

  if (folders.length === 1) {
    return folders[0];
  }

  const activeEditor = vscode.window.activeTextEditor;
  const activeFolder = activeEditor
    ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)
    : null;

  if (
    activeFolder &&
    fs.existsSync(path.join(activeFolder.uri.fsPath, 'start-local.ps1'))
  ) {
    return activeFolder;
  }

  const localServerFolders = folders.filter(function (folder) {
    return fs.existsSync(path.join(folder.uri.fsPath, 'start-local.ps1'));
  });

  if (localServerFolders.length === 1) {
    return localServerFolders[0];
  }

  const selected = await vscode.window.showQuickPick(
    folders.map(function (folder) {
      return {
        label: folder.name,
        description: folder.uri.fsPath,
        folder: folder
      };
    }),
    { placeHolder: 'Selecione o projeto inPaaS' }
  );

  return selected ? selected.folder : null;
}

function getWorkspaceConfiguration(workspaceFolder) {
  return vscode.workspace.getConfiguration('inpaas', workspaceFolder.uri);
}

function createLocalUrl(workspaceFolder, configurationKey) {
  const configuration = getWorkspaceConfiguration(workspaceFolder);
  const serverUrl = configuration.get('serverUrl');
  const endpointPath = configuration.get(configurationKey);

  return new URL(endpointPath, serverUrl);
}

function resolveDownloadedFile(workspaceFolder, relativePath) {
  const workspacePath = path.resolve(workspaceFolder.uri.fsPath);
  const filePath = path.resolve(workspacePath, String(relativePath || ''));
  const relativeToWorkspace = path.relative(workspacePath, filePath);

  if (
    !relativePath ||
    relativeToWorkspace.startsWith('..') ||
    path.isAbsolute(relativeToWorkspace)
  ) {
    throw new Error('O servidor retornou um caminho de arquivo inválido.');
  }

  return filePath;
}

async function downloadSourceForWorkspace(workspaceFolder, key) {
  const downloadId = workspaceFolder.uri.toString() + ':' + key;

  if (pendingDownloads.has(downloadId)) {
    return pendingDownloads.get(downloadId);
  }

  const url = createLocalUrl(workspaceFolder, 'sourceDownloadPath');
  url.searchParams.set('key', key);

  writeOutput(
    'INFO',
    'Baixando source "' + key + '" em ' + workspaceFolder.uri.fsPath
  );

  const download = requestJson(url)
    .then(function (result) {
      return {
        result: result,
        filePath: resolveDownloadedFile(workspaceFolder, result.relativePath)
      };
    })
    .finally(function () {
      pendingDownloads.delete(downloadId);
    });

  pendingDownloads.set(downloadId, download);
  return download;
}

async function downloadFormForWorkspace(workspaceFolder, key) {
  const url = createLocalUrl(workspaceFolder, 'formDownloadPath');
  url.searchParams.set('key', key);

  writeOutput(
    'INFO',
    'Baixando form "' + key + '" em ' + workspaceFolder.uri.fsPath
  );

  const result = await requestJson(url);
  const files = Array.isArray(result.files) ? result.files : [];

  if (files.length === 0) {
    throw new Error('O servidor não retornou arquivos para o form.');
  }

  return {
    result: result,
    files: files.map(function (file) {
      return {
        type: file.type,
        filePath: resolveDownloadedFile(workspaceFolder, file.relativePath)
      };
    })
  };
}

function getSourceRelativeDirectory(workspaceFolder) {
  const configuredDirectory = String(
    getWorkspaceConfiguration(workspaceFolder).get('sourceDirectory') ||
    'source'
  );

  return configuredDirectory.replace(/^[\\/]+|[\\/]+$/g, '');
}

function getEntityRelativeDirectory(workspaceFolder) {
  const configuredDirectory = String(
    getWorkspaceConfiguration(workspaceFolder).get('entityDirectory') ||
    'entities'
  );

  return configuredDirectory.replace(/^[\\/]+|[\\/]+$/g, '');
}

function getEntityNameFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/<entity\b[^>]*\bname\s*=\s*["']([^"']+)["']/i);

  if (!match) {
    throw new Error('Não foi possível determinar o nome da entidade pelo XML.');
  }

  return match[1];
}

function resolveInpaasResource(uri) {
  if (!uri || uri.scheme !== 'file') {
    throw new Error('Selecione um arquivo de source, form ou entity no Explorer.');
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    throw new Error('O recurso não pertence a um workspace aberto.');
  }

  const relativePath = path.relative(
    workspaceFolder.uri.fsPath,
    uri.fsPath
  );
  const parts = relativePath.split(path.sep).filter(Boolean);
  const sourceDirectory = getSourceRelativeDirectory(workspaceFolder)
    .split(/[\\/]+/)
    .filter(Boolean);
  const sourceMatches = sourceDirectory.every(function (part, index) {
    return parts[index] && parts[index].toLowerCase() === part.toLowerCase();
  });

  if (sourceMatches && parts.length === sourceDirectory.length + 1) {
    const fileName = parts[parts.length - 1];
    const extension = path.extname(fileName).toLowerCase();
    const key = ['.js', '.css', '.html'].includes(extension)
      ? fileName.slice(0, -extension.length)
      : fileName;

    if (!key) throw new Error('Não foi possível determinar a chave do source.');
    return {
      type: 'source',
      key: key,
      uri: uri,
      workspaceFolder: workspaceFolder
    };
  }

  const formsIndex = parts.findIndex(function (part) {
    return part.toLowerCase() === 'forms';
  });

  if (formsIndex >= 0 && parts.length > formsIndex + 1) {
    return {
      type: 'form',
      key: parts[formsIndex + 1],
      uri: uri,
      workspaceFolder: workspaceFolder
    };
  }

  const formsVueIndex = parts.findIndex(function (part) {
    return part.toLowerCase() === 'forms-vue';
  });

  if (
    formsVueIndex >= 0 &&
    parts.length === formsVueIndex + 3 &&
    path.extname(parts[formsVueIndex + 2]).toLowerCase() === '.vue'
  ) {
    return {
      type: 'form',
      key: parts[formsVueIndex + 1],
      uri: uri,
      workspaceFolder: workspaceFolder
    };
  }

  const entityDirectory = getEntityRelativeDirectory(workspaceFolder)
    .split(/[\\/]+/)
    .filter(Boolean);
  const entityMatches = entityDirectory.every(function (part, index) {
    return parts[index] && parts[index].toLowerCase() === part.toLowerCase();
  });

  if (
    entityMatches &&
    parts.length === entityDirectory.length + 1 &&
    path.extname(parts[parts.length - 1]).toLowerCase() === '.xml'
  ) {
    return {
      type: 'entity',
      key: getEntityNameFromFile(uri.fsPath),
      uri: uri,
      workspaceFolder: workspaceFolder
    };
  }

  throw new Error('Selecione um arquivo de source, form ou entity no Explorer.');
}

async function copyResourceKey(uri) {
  const resource = resolveInpaasResource(uri);

  await vscode.env.clipboard.writeText(resource.key);
  vscode.window.showInformationMessage(
    'inPaaS: chave copiada: ' + resource.key
  );
}

async function downloadOrUpdateResource(uri) {
  const resource = resolveInpaasResource(uri);

  if (resource.type === 'source') {
    const downloadedSource = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'inPaaS: atualizando ' + resource.key,
      cancellable: false
    }, function () {
      return downloadSourceForWorkspace(resource.workspaceFolder, resource.key);
    });

    const sourceDocument = await vscode.workspace.openTextDocument(
      downloadedSource.filePath
    );
    await vscode.window.showTextDocument(sourceDocument, { preview: false });
    vscode.window.showInformationMessage(
      'inPaaS: source ' + resource.key + ' atualizado.'
    );
    return;
  }

  if (resource.type === 'entity') {
    const downloadedEntity = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'inPaaS: atualizando entity ' + resource.key,
      cancellable: false
    }, function () {
      return downloadEntityForWorkspace(resource.workspaceFolder, resource.key);
    });

    const entityDocument = await vscode.workspace.openTextDocument(
      downloadedEntity.filePath
    );
    await vscode.window.showTextDocument(entityDocument, { preview: false });
    vscode.window.showInformationMessage(
      'inPaaS: entity ' + resource.key + ' atualizada.'
    );
    return;
  }

  const downloadedForm = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'inPaaS: atualizando form ' + resource.key,
    cancellable: false
  }, function () {
    return downloadFormForWorkspace(resource.workspaceFolder, resource.key);
  });

  for (let index = 0; index < downloadedForm.files.length; index++) {
    const file = downloadedForm.files[index];
    const document = await vscode.workspace.openTextDocument(file.filePath);
    await vscode.window.showTextDocument(document, {
      preview: index !== 0,
      preserveFocus: index !== 0
    });
  }

  vscode.window.showInformationMessage(
    'inPaaS: form ' + resource.key + ' atualizado (' +
    downloadedForm.files.length + ' arquivo(s)).'
  );
}

async function publishResource(uri) {
  const resource = resolveInpaasResource(uri);

  if (resource.type === 'entity') {
    throw new Error('A publicação manual de entities não é suportada.');
  }

  for (const document of vscode.workspace.textDocuments) {
    if (!document.isDirty || document.uri.scheme !== 'file') continue;

    try {
      const documentResource = resolveInpaasResource(document.uri);
      if (
        documentResource.type === resource.type &&
        documentResource.key === resource.key
      ) {
        const saved = await document.save();
        if (!saved) {
          throw new Error('Não foi possível salvar ' + document.uri.fsPath + '.');
        }
      }
    } catch (error) {
      if (document.uri.toString() === resource.uri.toString()) throw error;
    }
  }

  const relativePath = path.relative(
    resource.workspaceFolder.uri.fsPath,
    resource.uri.fsPath
  ).split(path.sep).join('/');
  const url = createLocalUrl(resource.workspaceFolder, 'publishPath');
  url.searchParams.set('path', relativePath);
  url.searchParams.set('type', resource.type);
  url.searchParams.set('key', resource.key);

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'inPaaS: publicando ' + resource.key,
    cancellable: false
  }, function () {
    return requestJson(url, { method: 'POST' });
  });

  vscode.window.showInformationMessage(
    'inPaaS: ' + resource.type + ' ' + resource.key + ' publicado.'
  );
}

function isSourceDocument(document, workspaceFolder) {
  const sourcePath = path.resolve(
    workspaceFolder.uri.fsPath,
    getSourceRelativeDirectory(workspaceFolder)
  );
  const documentPath = path.resolve(document.uri.fsPath);
  const relativePath = path.relative(sourcePath, documentPath);

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRequiredSourceAtPosition(document, position) {
  const text = document.getText();
  const cursorOffset = document.offsetAt(position);
  const requirePattern = /\brequire\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)\s*(?:\(\s*\)\s*)?(?:\.\s*([A-Za-z_$][\w$]*))?/g;
  let match;

  while ((match = requirePattern.exec(text)) !== null) {
    const keyOffset = match[0].indexOf(match[2]);
    const keyStart = match.index + keyOffset;
    const keyEnd = keyStart + match[2].length;

    if (cursorOffset >= keyStart && cursorOffset <= keyEnd) {
      return { key: match[2] };
    }

    if (match[3]) {
      const methodOffset = match[0].lastIndexOf(match[3]);
      const methodStart = match.index + methodOffset;
      const methodEnd = methodStart + match[3].length;

      if (cursorOffset >= methodStart && cursorOffset <= methodEnd) {
        return { key: match[2], method: match[3] };
      }
    }
  }

  const methodCallPattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;

  while ((match = methodCallPattern.exec(text)) !== null) {
    const objectName = match[1];
    const methodName = match[2];
    const methodOffset = match[0].lastIndexOf(methodName);
    const methodStart = match.index + methodOffset;
    const methodEnd = methodStart + methodName.length;

    if (cursorOffset < methodStart || cursorOffset > methodEnd) {
      continue;
    }

    const assignmentPattern = new RegExp(
      '\\b(?:var|let|const)\\s+' + escapeRegExp(objectName) +
      '\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\s*\\.\\s*)?require\\s*\\(\\s*([\'"])' +
      '([^\'"\\r\\n]+)\\1\\s*\\)\\s*(?:\\(\\s*\\))?',
      'g'
    );
    let assignment;
    let selectedAssignment = null;

    while ((assignment = assignmentPattern.exec(text)) !== null) {
      if (assignment.index > match.index) break;
      selectedAssignment = assignment;
    }

    if (selectedAssignment) {
      return { key: selectedAssignment[2], method: methodName };
    }
  }

  return null;
}

function sourceMethodPosition(document, methodName) {
  const text = document.getText();
  const escapedMethod = escapeRegExp(methodName);
  const exportPatterns = [
    new RegExp('[\'"]' + escapedMethod + '[\'"]\\s*:\\s*([A-Za-z_$][\\w$]*)'),
    new RegExp('(?:^|[,{]\\s*)' + escapedMethod + '\\s*:\\s*([A-Za-z_$][\\w$]*)', 'm'),
    new RegExp('(?:scope|exports)\\s*\\[\\s*[\'"]' + escapedMethod + '[\'"]\\s*\\]\\s*=\\s*([A-Za-z_$][\\w$]*)'),
    new RegExp('(?:scope|exports)\\s*\\.\\s*' + escapedMethod + '\\s*=\\s*([A-Za-z_$][\\w$]*)')
  ];
  let internalName = methodName;
  let fallbackOffset = -1;

  for (const pattern of exportPatterns) {
    const exportMatch = pattern.exec(text);

    if (!exportMatch) continue;
    internalName = exportMatch[1] || methodName;
    fallbackOffset = exportMatch.index;
    break;
  }

  const escapedInternalName = escapeRegExp(internalName);
  const declarationPatterns = [
    new RegExp('\\bfunction\\s+' + escapedInternalName + '\\s*\\('),
    new RegExp('\\b(?:var|let|const)\\s+' + escapedInternalName + '\\s*=\\s*function\\s*\\('),
    new RegExp('(?:scope|exports)\\s*\\.\\s*' + escapedInternalName + '\\s*=\\s*function\\s*\\('),
    new RegExp('(?:scope|exports)\\s*\\[\\s*[\'"]' + escapedInternalName + '[\'"]\\s*\\]\\s*=\\s*function\\s*\\(')
  ];

  for (const pattern of declarationPatterns) {
    const declarationMatch = pattern.exec(text);

    if (declarationMatch) {
      return document.positionAt(declarationMatch.index);
    }
  }

  return fallbackOffset >= 0 ? document.positionAt(fallbackOffset) : null;
}

async function findLocalSource(workspaceFolder, key) {
  const sourceDirectory = getSourceRelativeDirectory(workspaceFolder);
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceFolder, sourceDirectory + '/**/*'),
    '**/{node_modules,.git}/**'
  );
  const normalizedKey = String(key || '').toLowerCase();

  for (const file of files) {
    const fileName = path.basename(file.fsPath).toLowerCase();
    const extension = path.extname(fileName);
    const keyWithoutExtension = ['.js', '.css', '.html'].includes(extension)
      ? fileName.slice(0, -extension.length)
      : fileName;

    if (fileName === normalizedKey || keyWithoutExtension === normalizedKey) {
      return file;
    }
  }

  return null;
}

async function resolveRequiredSource(document, position) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

  if (!workspaceFolder || !isSourceDocument(document, workspaceFolder)) {
    return null;
  }

  const requiredSource = getRequiredSourceAtPosition(document, position);

  if (!requiredSource || requiredSource.key.toLowerCase().endsWith('.js')) {
    return null;
  }

  let sourceUri = await findLocalSource(workspaceFolder, requiredSource.key);

  if (!sourceUri) {
    const downloaded = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'inPaaS: baixando ' + requiredSource.key,
      cancellable: false
    }, function () {
      return downloadSourceForWorkspace(workspaceFolder, requiredSource.key);
    });

    sourceUri = vscode.Uri.file(downloaded.filePath);
  }

  if (!requiredSource.method) {
    return new vscode.Location(sourceUri, new vscode.Position(0, 0));
  }

  const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
  const methodPosition = sourceMethodPosition(
    sourceDocument,
    requiredSource.method
  );

  return new vscode.Location(
    sourceUri,
    methodPosition || new vscode.Position(0, 0)
  );
}

function getIncludedFormAtPosition(document, position) {
  const text = document.getText();
  const cursorOffset = document.offsetAt(position);
  const includePattern = /(['"])(\/includes\/([^\/'"?]+)\/(js|css|html)\/([^\/'"?]+)(?:\?[^'"]*)?)\1/gi;
  let match;

  while ((match = includePattern.exec(text)) !== null) {
    const valueStart = match.index + 1;
    const valueEnd = valueStart + match[2].length;

    if (cursorOffset < valueStart || cursorOffset > valueEnd) continue;

    let key;
    let fileName;
    try {
      key = decodeURIComponent(match[3]);
      fileName = decodeURIComponent(match[5]);
    } catch (error) {
      return null;
    }

    const type = match[4].toLowerCase();
    const keyParts = key.split('.');
    const expectedFileName = keyParts[keyParts.length - 1] + '.' + type;

    if (fileName.toLowerCase() !== expectedFileName.toLowerCase()) {
      return null;
    }

    return { key: key, type: type, fileName: fileName };
  }

  return null;
}

function getIncludedFormLinks(document) {
  const text = document.getText();
  const includePattern = /(['"])(\/includes\/([^\/ '"?]+)\/(js|css|html)\/([^\/ '"?]+)(?:\?[^'"]*)?)\1/gi;
  const links = [];
  let match;

  while ((match = includePattern.exec(text)) !== null) {
    let key;
    let fileName;

    try {
      key = decodeURIComponent(match[3]);
      fileName = decodeURIComponent(match[5]);
    } catch (error) {
      continue;
    }

    const type = match[4].toLowerCase();
    const keyParts = key.split('.');
    const expectedFileName = keyParts[keyParts.length - 1] + '.' + type;

    if (fileName.toLowerCase() !== expectedFileName.toLowerCase()) continue;

    const valueStart = match.index + 1;
    const valueEnd = valueStart + match[2].length;

    links.push({
      key: key,
      type: type,
      fileName: fileName,
      range: new vscode.Range(
        document.positionAt(valueStart),
        document.positionAt(valueEnd)
      )
    });
  }

  return links;
}

async function openIncludedForm(args) {
  if (!args || !args.documentUri || !args.key || !args.type || !args.fileName) {
    throw new Error('Referência de form inválida.');
  }

  const documentUri = vscode.Uri.parse(args.documentUri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);

  if (!workspaceFolder) {
    throw new Error('O arquivo não pertence a um workspace aberto.');
  }

  let filePath = path.join(
    workspaceFolder.uri.fsPath,
    'forms',
    args.key,
    args.fileName
  );

  if (!fs.existsSync(filePath)) {
    const downloaded = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'inPaaS: baixando ' + args.key,
      cancellable: false
    }, function () {
      return downloadFormForWorkspace(workspaceFolder, args.key);
    });
    const matchingFile = downloaded.files.find(function (file) {
      return file.type === args.type;
    });

    if (!matchingFile) {
      throw new Error(
        'O form "' + args.key + '" não possui conteúdo ' +
        args.type.toUpperCase() + '.'
      );
    }
    filePath = matchingFile.filePath;
  }

  return vscode.window.showTextDocument(vscode.Uri.file(filePath));
}

async function resolveIncludedForm(document, position) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const includedForm = getIncludedFormAtPosition(document, position);

  if (!workspaceFolder || !includedForm) return null;

  let filePath = path.join(
    workspaceFolder.uri.fsPath,
    'forms',
    includedForm.key,
    includedForm.fileName
  );

  if (!fs.existsSync(filePath)) {
    const downloaded = await downloadFormForWorkspace(
      workspaceFolder,
      includedForm.key
    );
    const matchingFile = downloaded.files.find(function (file) {
      return file.type === includedForm.type;
    });

    if (!matchingFile) {
      throw new Error(
        'O form "' + includedForm.key + '" não possui conteúdo ' +
        includedForm.type.toUpperCase() + '.'
      );
    }
    filePath = matchingFile.filePath;
  }

  return new vscode.Location(
    vscode.Uri.file(filePath),
    new vscode.Position(0, 0)
  );
}

async function downloadSource() {
  const workspaceFolder = await selectWorkspaceFolder();

  if (!workspaceFolder) {
    return;
  }

  const key = await vscode.window.showInputBox({
    title: 'inPaaS: Baixar source',
    prompt: 'Informe a chave do source',
    placeHolder: 'plusoftcrm.libs.main.source',
    ignoreFocusOut: true,
    validateInput: function (value) {
      return value.trim() ? null : 'A chave do source é obrigatória.';
    }
  });

  if (key === undefined) {
    return;
  }

  const downloaded = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'inPaaS: baixando ' + key.trim(),
    cancellable: false
  }, function () {
    return downloadSourceForWorkspace(workspaceFolder, key.trim());
  });
  const document = await vscode.workspace.openTextDocument(downloaded.filePath);

  await vscode.window.showTextDocument(document, { preview: false });
  vscode.window.showInformationMessage(
    'inPaaS: source ' + (downloaded.result.key || key.trim()) + ' baixado.'
  );
  writeOutput(
    'INFO',
    'Source "' + (downloaded.result.key || key.trim()) +
    '" salvo em ' + downloaded.filePath
  );
}

async function downloadForm() {
  const workspaceFolder = await selectWorkspaceFolder();

  if (!workspaceFolder) return;

  const key = await vscode.window.showInputBox({
    title: 'inPaaS: Baixar form',
    prompt: 'Informe a chave do form',
    placeHolder: 'module.key.post-form',
    ignoreFocusOut: true,
    validateInput: function (value) {
      return value.trim() ? null : 'A chave do form é obrigatória.';
    }
  });

  if (key === undefined) return;

  const downloaded = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'inPaaS: baixando form ' + key.trim(),
    cancellable: false
  }, function () {
    return downloadFormForWorkspace(workspaceFolder, key.trim());
  });

  for (let index = 0; index < downloaded.files.length; index++) {
    const file = downloaded.files[index];
    const document = await vscode.workspace.openTextDocument(file.filePath);
    await vscode.window.showTextDocument(document, {
      preview: index !== 0,
      preserveFocus: index !== 0
    });
  }

  writeOutput(
    'INFO',
    'Form "' + downloaded.result.key + '" baixado: ' +
    downloaded.files.map(function (file) { return file.filePath; }).join(', ')
  );
  vscode.window.showInformationMessage(
    'inPaaS: form ' + downloaded.result.key + ' baixado (' +
    downloaded.files.length + ' arquivo(s)).'
  );
}

function getDownloadFileName(contentDisposition, entityName) {
  const disposition = String(contentDisposition || '');
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
  let fileName = encodedMatch
    ? encodedMatch[1]
    : plainMatch && (plainMatch[1] || plainMatch[2]);

  if (fileName) {
    try {
      fileName = decodeURIComponent(fileName.trim());
    } catch (_error) {
      fileName = fileName.trim();
    }
  } else {
    fileName = entityName + '.xml';
  }

  fileName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

  if (!fileName.toLowerCase().endsWith('.xml')) {
    fileName += '.xml';
  }

  if (!fileName || fileName === '.xml') {
    throw new Error('A API retornou um nome de arquivo inválido para a entidade.');
  }

  return fileName;
}

async function downloadEntityForWorkspace(workspaceFolder, name) {
  const configuration = getWorkspaceConfiguration(workspaceFolder);
  const endpointTemplate = String(
    configuration.get('entityDownloadPath') ||
    '/api/entity-management/entities/{entityName}/xml'
  );
  const endpoint = endpointTemplate.replace(
    '{entityName}',
    encodeURIComponent(name)
  );
  const url = new URL(endpoint, configuration.get('serverUrl'));

  writeOutput(
    'INFO',
    'Baixando entity "' + name + '" em ' + workspaceFolder.uri.fsPath
  );

  const downloaded = await requestText(url);

  if (!downloaded.content.trim()) {
    throw new Error('A API retornou um XML vazio para a entidade.');
  }

  const fileName = getDownloadFileName(
    downloaded.headers['content-disposition'],
    name
  );
  const entitiesDirectory = getEntityRelativeDirectory(workspaceFolder);
  const relativePath = entitiesDirectory + '/' + fileName;
  const filePath = resolveDownloadedFile(workspaceFolder, relativePath);

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, downloaded.content, 'utf8');

  writeOutput('INFO', 'Entity "' + name + '" salva em ' + filePath);

  return { filePath: filePath, relativePath: relativePath };
}

async function downloadEntity() {
  const workspaceFolder = await selectWorkspaceFolder();

  if (!workspaceFolder) return;

  const entityName = await vscode.window.showInputBox({
    title: 'inPaaS: Baixar entity',
    prompt: 'Informe o nome da entidade',
    placeHolder: 'CRM_SM_POST_SCHED',
    ignoreFocusOut: true,
    validateInput: function (value) {
      const name = value.trim();

      if (!name) return 'O nome da entidade é obrigatório.';
      if (/[\\/]/.test(name)) return 'Informe somente o nome da entidade.';
      return null;
    }
  });

  if (entityName === undefined) return;

  const name = entityName.trim();
  const downloaded = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'inPaaS: baixando entity ' + name,
    cancellable: false
  }, function () {
    return downloadEntityForWorkspace(workspaceFolder, name);
  });
  const document = await vscode.workspace.openTextDocument(downloaded.filePath);
  await vscode.window.showTextDocument(document, { preview: false });

  vscode.window.showInformationMessage(
    'inPaaS: entity ' + name + ' baixada em ' + downloaded.relativePath + '.'
  );
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createNonce() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return nonce;
}

function normalizeQueryResult(result, page, limit) {
  if (result && result.error) {
    const detail = typeof result.error === 'string'
      ? result.error
      : result.error.error || result.error.message;
    throw new Error(result.message || detail || 'A consulta retornou um erro.');
  }

  const fields = Array.isArray(result.fields) ? result.fields : [];
  const rows = Array.isArray(result.list) ? result.list : [];
  const total = Number(result.total || 0);
  const effectiveLimit = Number(result.limit || limit || 25);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

  return {
    fields: fields,
    rows: rows,
    total: total,
    elapsed: Number(result.elapsed || 0),
    limit: effectiveLimit,
    page: Math.min(Math.max(1, page), totalPages),
    totalPages: totalPages
  };
}

function getCellValue(row, field, index) {
  if (Array.isArray(row)) {
    return row[index];
  }

  if (row && typeof row === 'object') {
    return row[field];
  }

  return row;
}

class QueryResultPanel {
  constructor(context) {
    this.context = context;
    this.panel = null;
    this.pendingHtml = null;
    this.sql = '';
    this.workspaceFolder = null;
    this.page = 1;
    this.limit = 25;
  }

  async reveal() {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, true);
      return;
    }

    const sqlEditor = vscode.window.activeTextEditor;
    this.panel = vscode.window.createWebviewPanel(
      'inpaasQueryResults',
      'Resultado da query',
      { viewColumn: sqlEditor ? sqlEditor.viewColumn : vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.onDidReceiveMessage(async function (message) {
      if (message.command === 'page') {
        await this.execute(Number(message.page), Number(message.limit));
      }
    }.bind(this), null, this.context.subscriptions);
    this.panel.onDidDispose(function () {
      this.panel = null;
      queryResultPanel = null;
    }.bind(this), null, this.context.subscriptions);

    await vscode.commands.executeCommand('workbench.action.moveEditorToBelowGroup');
    if (sqlEditor) {
      await vscode.window.showTextDocument(sqlEditor.document, {
        viewColumn: sqlEditor.viewColumn,
        selection: sqlEditor.selection,
        preserveFocus: false
      });
    }

    if (this.pendingHtml !== null) {
      this.panel.webview.html = this.pendingHtml;
      this.pendingHtml = null;
    }
  }

  setHtml(html) {
    if (this.panel) {
      this.panel.webview.html = html;
    } else {
      this.pendingHtml = html;
    }
  }

  showLoading() {
    this.setHtml(this.getHtml(null, null, true));
  }

  showError(error) {
    this.setHtml(this.getHtml(null, error, false));
  }

  showResult(result) {
    this.setHtml(this.getHtml(result, null, false));
  }

  async execute(page, limit) {
    this.page = Math.max(1, page || 1);
    this.limit = [10, 25, 50, 100].includes(limit) ? limit : this.limit;
    this.showLoading();

    try {
      const url = createLocalUrl(this.workspaceFolder, 'databaseQueryPath');
      const offset = ((this.page - 1) * this.limit) + 1;
      const response = await requestJson(url, {
        method: 'POST',
        body: {
          offset: offset,
          limit: this.limit,
          cmd: Buffer.from(this.sql, 'utf8').toString('base64'),
          txt: this.sql
        }
      });
      const result = normalizeQueryResult(response, this.page, this.limit);

      this.page = result.page;
      this.limit = result.limit;
      this.showResult(result);
    } catch (error) {
      this.showError(error);
    }
  }

  getHtml(result, error, loading) {
    const nonce = createNonce();
    const fields = result ? result.fields : [];
    const rows = result ? result.rows : [];
    const headerHtml = fields.map(function (field) {
      return '<th>' + escapeHtml(field) + '</th>';
    }).join('');
    const rowsHtml = rows.map(function (row) {
      const cells = fields.map(function (field, index) {
        const value = getCellValue(row, field, index);
        const text = value === null ? 'NULL' : value;
        const className = value === null ? ' class="null"' : '';
        return '<td' + className + ' title="' + escapeHtml(text) + '">' +
          escapeHtml(text) + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    const statusHtml = result
      ? escapeHtml(result.total) + ' registros · ' +
        escapeHtml(result.elapsed) + ' ms · página ' +
        escapeHtml(result.page) + ' de ' + escapeHtml(result.totalPages)
      : '';

    return '<!DOCTYPE html>' +
      '<html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
      'style-src \'unsafe-inline\'; script-src \'nonce-' + nonce + '\';">' +
      '<style>' +
      'body{padding:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:12px var(--vscode-font-family)}' +
      '.state{padding:16px;color:var(--vscode-descriptionForeground)}' +
      '.error{color:var(--vscode-errorForeground);white-space:pre-wrap}' +
      '.table-wrap{overflow:auto;height:calc(100vh - 45px)}' +
      'table{border-collapse:collapse;min-width:100%;white-space:nowrap}' +
      'th,td{height:27px;padding:0 8px;border-right:1px solid var(--vscode-panel-border);border-bottom:1px solid var(--vscode-panel-border);text-align:left;max-width:420px;overflow:hidden;text-overflow:ellipsis}' +
      'th{position:sticky;top:0;z-index:1;background:var(--vscode-editorGroupHeader-tabsBackground);font-weight:600}' +
      'tr:hover td{background:var(--vscode-list-hoverBackground)}' +
      '.null{color:var(--vscode-descriptionForeground);font-style:italic}' +
      'footer{height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 10px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-editorGroupHeader-tabsBackground)}' +
      '.actions{display:flex;align-items:center;gap:6px}' +
      'button,select{height:28px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:0 10px}' +
      'button:disabled{opacity:.45}select{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border)}' +
      '</style></head><body>' +
      (loading ? '<div class="state">Executando query…</div>' : '') +
      (error ? '<div class="state error">' + escapeHtml(error.message) + '</div>' : '') +
      (result ? '<div class="table-wrap"><table><thead><tr>' + headerHtml +
        '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
        '<footer><span>' + statusHtml + '</span><div class="actions">' +
        '<select id="limit"><option>10</option><option>25</option><option>50</option><option>100</option></select>' +
        '<button id="previous" ' + (result.page <= 1 ? 'disabled' : '') + '>Anterior</button>' +
        '<button id="next" ' + (result.page >= result.totalPages ? 'disabled' : '') + '>Próxima</button>' +
        '</div></footer>' : '') +
      '<script nonce="' + nonce + '">' +
      'const vscode=acquireVsCodeApi();' +
      'const page=' + (result ? result.page : 1) + ';' +
      'const limit=document.getElementById("limit");' +
      'if(limit){limit.value="' + (result ? result.limit : 25) + '";' +
      'limit.addEventListener("change",()=>vscode.postMessage({command:"page",page:1,limit:Number(limit.value)}));}' +
      'const previous=document.getElementById("previous");if(previous)previous.addEventListener("click",()=>vscode.postMessage({command:"page",page:page-1,limit:Number(limit.value)}));' +
      'const next=document.getElementById("next");if(next)next.addEventListener("click",()=>vscode.postMessage({command:"page",page:page+1,limit:Number(limit.value)}));' +
      '</script></body></html>';
  }
}

async function newQuery() {
  const document = await vscode.workspace.openTextDocument({
    language: 'sql',
    content: '-- Query inPaaS\n\n'
  });

  await vscode.window.showTextDocument(document, { preview: false });
}

async function executeQuery(context) {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== 'sql') {
    throw new Error('Abra ou crie um documento SQL para executar a query.');
  }

  const selectedText = editor.document.getText(editor.selection).trim();
  const sql = selectedText || editor.document.getText().trim();

  if (!sql) {
    throw new Error('A query está vazia.');
  }

  const workspaceFolder = await selectWorkspaceFolder();

  if (!workspaceFolder) {
    return;
  }

  if (!queryResultPanel) {
    queryResultPanel = new QueryResultPanel(context);
  }

  await queryResultPanel.reveal();

  queryResultPanel.workspaceFolder = workspaceFolder;
  queryResultPanel.sql = sql;
  await queryResultPanel.execute(1, queryResultPanel.limit);
}

function transformSqlOutsideLiterals(sql, transform) {
  const parts = [];
  let plain = '';
  let index = 0;

  function flushPlain() {
    if (plain) {
      parts.push(transform(plain));
      plain = '';
    }
  }

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (character === "'" || character === '"' || character === '[') {
      flushPlain();
      const closing = character === '[' ? ']' : character;
      let literal = character;
      index += 1;

      while (index < sql.length) {
        literal += sql[index];

        if (sql[index] === closing) {
          if (closing !== ']' && sql[index + 1] === closing) {
            literal += sql[index + 1];
            index += 2;
            continue;
          }
          index += 1;
          break;
        }

        index += 1;
      }

      parts.push(literal);
      continue;
    }

    if (character === '-' && next === '-') {
      flushPlain();
      const end = sql.indexOf('\n', index);
      const commentEnd = end === -1 ? sql.length : end;
      parts.push(sql.substring(index, commentEnd));
      index = commentEnd;
      continue;
    }

    if (character === '/' && next === '*') {
      flushPlain();
      const end = sql.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? sql.length : end + 2;
      parts.push(sql.substring(index, commentEnd));
      index = commentEnd;
      continue;
    }

    plain += character;
    index += 1;
  }

  flushPlain();
  return parts.join('');
}

function formatSqlText(sql) {
  const keywords = [
    'select', 'from', 'where', 'group by', 'order by', 'having',
    'inner join', 'left join', 'right join', 'full join', 'cross join',
    'join', 'on', 'union all', 'union', 'insert into', 'update', 'delete',
    'values', 'set', 'and', 'or', 'as', 'distinct', 'top', 'case', 'when',
    'then', 'else', 'end', 'is null', 'is not null', 'like', 'in', 'exists'
  ];
  const clausePattern = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS JOIN|JOIN|UNION ALL|UNION|INSERT INTO|UPDATE|DELETE|VALUES|SET)\b/g;

  return transformSqlOutsideLiterals(sql, function (plain) {
    let formatted = plain.replace(/[ \t]+/g, ' ');

    keywords.forEach(function (keyword) {
      const pattern = new RegExp(
        '\\b' + keyword.replace(/ /g, '\\s+') + '\\b',
        'gi'
      );
      formatted = formatted.replace(pattern, keyword.toUpperCase());
    });

    formatted = formatted.replace(clausePattern, function (clause, _match, offset) {
      return offset === 0 ? clause : '\n' + clause;
    });
    return formatted;
  })
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

async function formatSqlDocument() {
  const editor = vscode.window.activeTextEditor;

  if (!editor || editor.document.languageId !== 'sql') {
    throw new Error('Abra um documento SQL para formatar.');
  }

  const hasSelection = !editor.selection.isEmpty;
  const range = hasSelection
    ? editor.selection
    : new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
  const formatted = formatSqlText(editor.document.getText(range));

  await editor.edit(function (editBuilder) {
    editBuilder.replace(range, formatted);
  });
}

function getMetadataName(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    return value.name || value.label || value.column || value.field ||
      value.ds_campobd || value.ds_field || null;
  }

  return null;
}

function normalizeDatabaseMetadata(response) {
  const source = response && response.data ? response.data : response;
  const rawTables = source && source.tables ? source.tables : source;
  const tables = {};

  if (Array.isArray(rawTables)) {
    rawTables.forEach(function (table) {
      const tableName = getMetadataName(table);
      const rawColumns = table && (
        table.columns || table.fields || table.items || []
      );

      if (tableName) {
        tables[tableName] = (Array.isArray(rawColumns) ? rawColumns : [])
          .map(getMetadataName)
          .filter(Boolean);
      }
    });
  } else if (rawTables && typeof rawTables === 'object') {
    Object.keys(rawTables).forEach(function (tableName) {
      const table = rawTables[tableName];
      const rawColumns = Array.isArray(table)
        ? table
        : table && (table.columns || table.fields || table.items) || [];

      tables[tableName] = (Array.isArray(rawColumns) ? rawColumns : [])
        .map(getMetadataName)
        .filter(Boolean);
    });
  }

  return tables;
}

async function loadDatabaseMetadata(workspaceFolder, force) {
  const cacheKey = workspaceFolder.uri.toString();

  if (!force && metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  const metadata = normalizeDatabaseMetadata(
    await requestJson(createLocalUrl(workspaceFolder, 'databaseMetadataPath'))
  );

  metadataCache.set(cacheKey, metadata);
  return metadata;
}

function getSqlAliases(sql, tables) {
  const aliases = {};
  const reserved = new Set([
    'WHERE', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'JOIN', 'ON',
    'GROUP', 'ORDER', 'HAVING', 'UNION', 'LIMIT', 'OFFSET'
  ]);
  const pattern = /\b(?:FROM|JOIN)\s+([\w.\[\]]+)(?:\s+(?:AS\s+)?([A-Za-z_$][\w$]*))?/gi;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    const rawTable = match[1].replace(/[\[\]]/g, '');
    const tableName = Object.keys(tables).find(function (name) {
      return name.toUpperCase() === rawTable.toUpperCase();
    }) || rawTable;
    const possibleAlias = match[2];
    const alias = possibleAlias && !reserved.has(possibleAlias.toUpperCase())
      ? possibleAlias
      : rawTable.split('.').pop();

    aliases[alias.toUpperCase()] = tableName;
  }

  return aliases;
}

async function provideSqlCompletions(document, position) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri) ||
    await selectWorkspaceFolder();

  if (!workspaceFolder) {
    return [];
  }

  const tables = await loadDatabaseMetadata(workspaceFolder, false);
  const textBeforeCursor = document.getText(new vscode.Range(
    new vscode.Position(0, 0),
    position
  ));
  const aliases = getSqlAliases(document.getText(), tables);
  const qualifierMatch = textBeforeCursor.match(/([A-Za-z_$][\w$]*)\.([\w$]*)$/);

  if (qualifierMatch) {
    const tableName = aliases[qualifierMatch[1].toUpperCase()] ||
      Object.keys(tables).find(function (name) {
        return name.toUpperCase() === qualifierMatch[1].toUpperCase();
      });

    return (tables[tableName] || []).map(function (column) {
      const item = new vscode.CompletionItem(
        column,
        vscode.CompletionItemKind.Field
      );
      item.detail = tableName;
      return item;
    });
  }

  const afterTableClause = /\b(?:FROM|JOIN)\s+[\w.\[\]]*$/i
    .test(textBeforeCursor);

  if (afterTableClause) {
    return Object.keys(tables).map(function (tableName) {
      const item = new vscode.CompletionItem(
        tableName,
        vscode.CompletionItemKind.Class
      );
      item.detail = 'Tabela inPaaS';
      return item;
    });
  }

  const columnItems = [];
  const seenColumns = new Set();

  Object.keys(aliases).forEach(function (alias) {
    const tableName = aliases[alias];
    (tables[tableName] || []).forEach(function (column) {
      const id = alias + '.' + column;
      if (seenColumns.has(id)) return;
      seenColumns.add(id);

      const item = new vscode.CompletionItem(
        id,
        vscode.CompletionItemKind.Field
      );
      item.detail = tableName;
      columnItems.push(item);
    });
  });

  return columnItems;
}

async function refreshDatabaseMetadata() {
  const workspaceFolder = await selectWorkspaceFolder();

  if (!workspaceFolder) {
    return;
  }

  const metadata = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'inPaaS: atualizando metadados do banco',
    cancellable: false
  }, function () {
    return loadDatabaseMetadata(workspaceFolder, true);
  });

  vscode.window.showInformationMessage(
    'inPaaS: ' + Object.keys(metadata).length + ' tabelas carregadas.'
  );
}

function registerCommand(context, id, handler) {
  return vscode.commands.registerCommand(id, async function () {
    try {
      await handler.apply(null, arguments);
    } catch (error) {
      reportError('Falha no comando ' + id, error);
    }
  });
}

function activate(context) {
  outputChannel = vscode.window.createOutputChannel('inPaaS');
  context.subscriptions.push(outputChannel);

  const disposables = [
    registerCommand(context, 'inpaas.downloadSource', downloadSource),
    registerCommand(context, 'inpaas.downloadForm', downloadForm),
    registerCommand(context, 'inpaas.downloadEntity', downloadEntity),
    registerCommand(context, 'inpaas.copyKey', copyResourceKey),
    registerCommand(context, 'inpaas.downloadOrUpdateResource', downloadOrUpdateResource),
    registerCommand(context, 'inpaas.publishResource', publishResource),
    registerCommand(context, 'inpaas.newQuery', newQuery),
    registerCommand(context, 'inpaas.executeQuery', function () {
      return executeQuery(context);
    }),
    registerCommand(context, 'inpaas.formatSql', formatSqlDocument),
    registerCommand(context, 'inpaas.refreshDatabaseMetadata', refreshDatabaseMetadata),
    vscode.commands.registerCommand('inpaas.openIncludedForm', async function (args) {
      try {
        return await openIncludedForm(args);
      } catch (error) {
        vscode.window.showErrorMessage(
          'inPaaS: não foi possível abrir o form. ' + error.message
        );
        return null;
      }
    }),
    vscode.languages.registerDefinitionProvider(
      [
        { language: 'javascript', scheme: 'file' },
        { language: 'javascriptreact', scheme: 'file' }
      ],
      {
        provideDefinition: async function (document, position) {
          try {
            return await resolveRequiredSource(document, position);
          } catch (error) {
            vscode.window.showErrorMessage(
              'inPaaS: não foi possível abrir o source. ' + error.message
            );
            return null;
          }
        }
      }
    ),
    vscode.languages.registerDefinitionProvider(
      [
        { language: 'html', scheme: 'file' },
        { language: 'vue', scheme: 'file' }
      ],
      {
        provideDefinition: async function (document, position) {
          try {
            return await resolveIncludedForm(document, position);
          } catch (error) {
            vscode.window.showErrorMessage(
              'inPaaS: não foi possível abrir o form. ' + error.message
            );
            return null;
          }
        }
      }
    ),
    vscode.languages.registerDocumentLinkProvider(
      [
        { language: 'html', scheme: 'file' },
        { language: 'vue', scheme: 'file' }
      ],
      {
        provideDocumentLinks: function (document) {
          return getIncludedFormLinks(document).map(function (includedForm) {
            const args = encodeURIComponent(JSON.stringify([{
              documentUri: document.uri.toString(),
              key: includedForm.key,
              type: includedForm.type,
              fileName: includedForm.fileName
            }]));
            const link = new vscode.DocumentLink(
              includedForm.range,
              vscode.Uri.parse('command:inpaas.openIncludedForm?' + args)
            );

            link.tooltip = 'Abrir form local ' + includedForm.key;
            return link;
          });
        }
      }
    ),
    vscode.languages.registerCompletionItemProvider(
      [
        { language: 'sql', scheme: 'file' },
        { language: 'sql', scheme: 'untitled' }
      ],
      {
        provideCompletionItems: async function (document, position) {
          try {
            return await provideSqlCompletions(document, position);
          } catch (error) {
            vscode.window.showErrorMessage(
              'inPaaS: não foi possível carregar o autocomplete. ' + error.message
            );
            return [];
          }
        }
      },
      '.', ' '
    )
  ];

  disposables.forEach(function (disposable) {
    context.subscriptions.push(disposable);
  });
}

function deactivate() {}

module.exports = {
  activate: activate,
  deactivate: deactivate
};
