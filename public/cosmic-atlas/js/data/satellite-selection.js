/** Rebuild once per snapshot; saved NORAD identities never depend on row order. */
export function createSatelliteSelectionResolver(objects) {
  if (!objects) return selection => selection
  const indices = new Map(objects.map((object, index) => [object.id, index]))
  return selection => {
    if (selection?.layer !== 'satellites') return selection
    let id = selection.id
    if (!/^sat:[1-9]\d*$/.test(String(id))) {
      const index = typeof id === 'number' || /^\d+$/.test(String(id)) ? Number(id) : -1
      if (!Number.isInteger(index) || !objects[index]) return null
      id = objects[index].id
    }
    const index = indices.get(id) ?? -1
    return selection.id === id && selection.index === index ? selection : { ...selection, id, index }
  }
}
