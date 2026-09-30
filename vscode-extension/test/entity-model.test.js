const assert = require('node:assert/strict');
const { normalizeDownloadedEntityModel } = require('../entity-model');

const raw = {
  id: 245,
  name: 'CRM_SURVEYQUESTIONCHOICE',
  moduleId: 35,
  audit: true,
  auditInsert: true,
  auditUpdate: false,
  auditDelete: true,
  attributes: [
    { id: 1807, name: 'ID_SURVEYQUESTIONCHOICE', type: 'BIGINT', primaryKey: 'PK_CRM_SURVEYQUESTIONCHOICE' },
    { id: 1808, name: 'ID_SURVEYQUESTION', type: 'BIGINT', primaryKey: null }
  ],
  queries: [{ key: 'crm.query.example', query: 'SELECT 1' }],
  references: [{
    name: 'FK_SURVEYQUESTION_SURVEYQUESTIONCHOICE',
    fields: ['ID_SURVEYQUESTION'],
    referenceEntity: 'CRM_SURVEYQUESTION',
    referenceFields: ['ID_SURVEYQUESTION']
  }]
};

const normalized = normalizeDownloadedEntityModel(raw);
assert.equal(normalized.module, 35);
assert.equal(normalized.primaryKey, 'PK_CRM_SURVEYQUESTIONCHOICE');
assert.deepEqual(normalized.audit, { onInsert: true, onUpdate: false, onDelete: true });
assert.equal(normalized.attributes[0].type, 'Long');
assert.equal(normalized.attributes[0].primaryKey, true);
assert.equal(normalized.attributes[1].primaryKey, false);
assert.equal(normalized.attributes[1].moduleId, 35);
assert.equal(normalized.references[0].referenceEntity, 'CRM_SURVEYQUESTION');
assert.equal(normalized.queries[0].sql, 'SELECT 1');
assert.equal(raw.module, undefined, 'The raw response remains unchanged');
assert.throws(() => normalizeDownloadedEntityModel(Object.assign({}, raw, {
  attributes: [{ id: null, name: 'ID_SURVEYQUESTIONCHOICE', primaryKey: true }]
})), /download foi interrompido/);
assert.throws(() => normalizeDownloadedEntityModel(Object.assign({}, raw, {
  queries: [{ key: 'crm.query.example', query: null }]
})), /veio sem SQL/);

console.log('Entity download normalization passed.');
