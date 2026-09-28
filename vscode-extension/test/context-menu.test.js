const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const menus = manifest.contributes.menus['explorer/context'];

function visibleCommands(resourcePath) {
  const resourceFilename = path.win32.basename(resourcePath.replaceAll('/', '\\'));
  return menus.filter(({ when }) => {
    const pathMatch = when.match(/resourcePath =~ (\/[^ ]+\/)/);
    if (!pathMatch) return false;
    const expression = pathMatch[1];
    const separatorPattern = /\[\\x2f\\x5c\]/;
    assert.match(expression, separatorPattern, 'Use a separator pattern without a literal slash');
    const pattern = new RegExp(expression.slice(1, -1));
    if (!pattern.test(resourcePath)) return false;
    for (const excluded of when.matchAll(/resourceFilename != '([^']+)'/g)) {
      if (resourceFilename === excluded[1]) return false;
    }
    return true;
  }).map(({ command }) => command);
}

for (const separator of ['\\', '/']) {
  const base = ['C:', 'work', 'project'].join(separator);
  const source = visibleCommands([base, 'sources', 'app.forms.js'].join(separator));
  assert(source.includes('inpaas.openSourceEditor'));
  assert(source.includes('inpaas.downloadSourceResource'));
  assert(source.includes('inpaas.publishSourceResource'));
  assert(!source.includes('inpaas.openFormEditor'));
  assert(!source.includes('inpaas.downloadFormResource'));

  const form = visibleCommands([base, 'forms', 'app.source.form', 'main.js'].join(separator));
  assert(form.includes('inpaas.openFormEditor'));
  assert(form.includes('inpaas.downloadFormResource'));
  assert(form.includes('inpaas.publishFormResource'));
  assert(!form.includes('inpaas.openSourceEditor'));
  assert(!form.includes('inpaas.downloadSourceResource'));

  const vue = visibleCommands([base, 'forms-vue', 'app.form', 'main.vue'].join(separator));
  assert(vue.includes('inpaas.openFormEditor'));
  assert(!vue.includes('inpaas.openSourceEditor'));

  const moduleFile = visibleCommands([base, 'modules', 'app.main', 'styles.css'].join(separator));
  assert(moduleFile.includes('inpaas.openModuleSettings'));
  assert(moduleFile.includes('inpaas.downloadModule'));
  assert(!moduleFile.includes('inpaas.openFormEditor'));

  for (const folder of ['forms', 'forms-vue', 'sources', 'modules']) {
    assert.deepEqual(visibleCommands([base, folder].join(separator)), []);
  }
}

console.log('Context-menu path cases passed.');
