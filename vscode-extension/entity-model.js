'use strict';

const logicalTypes = {
  VARCHAR: 'String',
  NVARCHAR: 'Unicode',
  CHAR: 'Char',
  BIGINT: 'Long',
  INT: 'Integer',
  DATETIME: 'Datetime',
  DATE: 'Date',
  NUMERIC: 'Numeric',
  VARBINARY: 'Binary'
};

function normalizeDownloadedEntityModel(model) {
  if (!model || !model.name || !Array.isArray(model.attributes)) {
    throw new Error('A API retornou um modelo de entity inválido.');
  }

  const normalized = Object.assign({}, model);
  normalized.module = model.module ?? model.moduleId;
  if (!normalized.module) {
    throw new Error('A API retornou uma entity sem módulo.');
  }

  const primaryAttribute = model.attributes.find(attribute => Boolean(attribute.primaryKey));
  normalized.primaryKey = model.primaryKey ||
    (primaryAttribute && typeof primaryAttribute.primaryKey === 'string' && primaryAttribute.primaryKey) ||
    (primaryAttribute ? 'XPK_' + String(model.name).toUpperCase() : null);
  if (!normalized.primaryKey) {
    throw new Error('A API retornou uma entity sem chave primária.');
  }
  if (model.id != null && model.attributes.some(attribute => attribute.id == null)) {
    throw new Error('O servidor retornou uma entity existente com IDs de campos ausentes. O download foi interrompido para não sobrescrever o arquivo local.');
  }

  normalized.attributes = model.attributes.map(attribute => {
    const copy = Object.assign({}, attribute);
    copy.primaryKey = Boolean(copy.primaryKey);
    copy.moduleId = copy.moduleId ?? normalized.module;
    copy.type = logicalTypes[String(copy.type || '').toUpperCase()] || copy.type;
    return copy;
  });

  if (Array.isArray(model.queries)) {
    normalized.queries = model.queries.map(query => {
      const sql = query.sql ?? query.query;
      if (query.key && (typeof sql !== 'string' || !sql.trim())) {
        throw new Error('A query ' + query.key + ' veio sem SQL. O download foi interrompido para preservar o arquivo local.');
      }
      return Object.assign({}, query, sql == null ? {} : { sql });
    });
  }

  if (!model.audit || typeof model.audit !== 'object') {
    normalized.audit = {
      onInsert: Boolean(model.auditInsert),
      onUpdate: Boolean(model.auditUpdate),
      onDelete: Boolean(model.auditDelete)
    };
  }

  return normalized;
}

module.exports = { normalizeDownloadedEntityModel };
