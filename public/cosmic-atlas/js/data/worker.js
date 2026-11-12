import { parseCSVTable, jsonToTable, readBinaryTable, filterIndices } from './schema.js'
self.onmessage = ({ data }) => {
  const { id, operation, payload } = data
  try {
    let result
    if (operation === 'csv') result = parseCSVTable(payload.text, payload.meta)
    else if (operation === 'json') result = jsonToTable(payload.rows, payload.meta)
    else if (operation === 'binary') result = readBinaryTable(payload.buffer, payload.header)
    else if (operation === 'filter') result = filterIndices(payload.table, payload.filters)
    else throw Error('Unknown catalog worker operation')
    const transfer = result instanceof Uint32Array ? [result.buffer] : Object.values(result.columns).map(column => column.buffer)
    self.postMessage({ id, result }, transfer)
  } catch (error) { self.postMessage({ id, error: error.message }) }
}
