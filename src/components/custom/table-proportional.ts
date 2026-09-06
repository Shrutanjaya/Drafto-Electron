import { Node, mergeAttributes } from '@tiptap/core'
import Table from '@tiptap/extension-table'
import { TableMap, cellAround, tableEditing } from '@tiptap/pm/tables'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView, NodeView } from '@tiptap/pm/view'

export const proportionalResizingKey = new PluginKey('proportionalColumnResizing')

export function getColumnPercentages(node: ProseMirrorNode): number[] {
  const row = node.firstChild
  if (!row) return []
  const colWeights: number[] = []
  let totalCols = 0
  for (let i = 0; i < row.childCount; i++) {
    const { colspan = 1, colwidth } = row.child(i).attrs
    for (let j = 0; j < colspan; j++) {
      totalCols++
      const w = colwidth && colwidth[j]
      colWeights.push(w && w > 0 ? w : 0)
    }
  }
  if (totalCols === 0) return []
  const hasAny = colWeights.some(w => w > 0)
  if (!hasAny) {
    const equalPct = 100 / totalCols
    return Array(totalCols).fill(equalPct)
  }
  const sum = colWeights.reduce((a, b) => a + b, 0)
  return colWeights.map(w => (w / sum) * 100)
}

export class ProportionalTableView implements NodeView {
  node: ProseMirrorNode
  cellMinWidth: number
  dom: HTMLDivElement
  table: HTMLTableElement
  colgroup: HTMLTableColElement
  contentDOM: HTMLTableSectionElement

  constructor(node: ProseMirrorNode, cellMinWidth: number) {
    this.node = node
    this.cellMinWidth = cellMinWidth
    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'
    this.table = this.dom.appendChild(document.createElement('table'))
    this.table.style.width = '100%'
    this.table.style.tableLayout = 'fixed'
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))
    this.updateColumns(node)
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.updateColumns(node)
    return true
  }

  updateColumns(node: ProseMirrorNode) {
    const percentages = getColumnPercentages(node)
    this.table.style.width = '100%'
    this.table.style.tableLayout = 'fixed'
    let nextDOM = this.colgroup.firstChild
    for (let i = 0; i < percentages.length; i++) {
      const pct = percentages[i]
      const cssWidth = `${pct.toFixed(4)}%`
      const ratioStr = (pct / 100).toFixed(4)
      if (!nextDOM) {
        const col = document.createElement('col')
        col.style.width = cssWidth
        col.setAttribute('data-ratio', ratioStr)
        this.colgroup.appendChild(col)
      } else {
        if ((nextDOM as HTMLElement).style.width !== cssWidth) {
          (nextDOM as HTMLElement).style.width = cssWidth
          ;(nextDOM as HTMLElement).setAttribute('data-ratio', ratioStr)
        }
        nextDOM = nextDOM.nextSibling
      }
    }
    while (nextDOM) {
      const after = nextDOM.nextSibling
      nextDOM.parentNode?.removeChild(nextDOM)
      nextDOM = after
    }
  }
}

function domCellAround(target: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = target
  while (el && el.nodeName !== 'TD' && el.nodeName !== 'TH') {
    el = el.classList && el.classList.contains('ProseMirror') ? null : (el.parentNode as HTMLElement | null)
  }
  return el
}

function edgeCell(view: EditorView, event: MouseEvent, side: 'left' | 'right', handleWidth: number): number {
  const offset = side === 'right' ? -handleWidth : handleWidth
  const found = view.posAtCoords({ left: event.clientX + offset, top: event.clientY })
  if (!found) return -1
  const $cell = cellAround(view.state.doc.resolve(found.pos))
  if (!$cell) return -1
  if (side === 'right') return $cell.pos
  const map = TableMap.get($cell.node(-1))
  const start = $cell.start(-1)
  const index = map.map.indexOf($cell.pos - start)
  return index % map.width === 0 ? -1 : start + map.map[index - 1]
}

export function createProportionalResizingPlugin(options: { handleWidth?: number; cellMinWidth?: number } = {}) {
  const handleWidth = options.handleWidth || 5
  const cellMinWidth = options.cellMinWidth || 25

  return new Plugin({
    key: proportionalResizingKey,
    state: {
      init() {
        return { activeHandle: -1, dragging: false }
      },
      apply(tr, prev) {
        const action = tr.getMeta(proportionalResizingKey)
        if (action && action.setHandle !== undefined) {
          return { activeHandle: action.setHandle, dragging: false }
        }
        if (action && action.setDragging !== undefined) {
          return { activeHandle: prev.activeHandle, dragging: action.setDragging }
        }
        if (prev.activeHandle > -1 && tr.docChanged) {
          return { activeHandle: -1, dragging: false }
        }
        return prev
      },
    },
    props: {
      attributes(state) {
        const s = proportionalResizingKey.getState(state)
        return s && s.activeHandle > -1 ? { class: 'resize-cursor' } : {}
      },
      handleDOMEvents: {
        mousemove(view, event) {
          if (!view.editable) return
          const s = proportionalResizingKey.getState(view.state)
          if (!s || s.dragging) return
          const target = domCellAround(event.target as HTMLElement)
          let cell = -1
          if (target) {
            const { left, right } = target.getBoundingClientRect()
            if (event.clientX - left <= handleWidth) cell = edgeCell(view, event, 'left', handleWidth)
            else if (right - event.clientX <= handleWidth) cell = edgeCell(view, event, 'right', handleWidth)
          }
          if (cell !== -1) {
            const $cell = view.state.doc.resolve(cell)
            const table = $cell.node(-1)
            const map = TableMap.get(table)
            const tableStart = $cell.start(-1)
            const col = map.colCount($cell.pos - tableStart) + ($cell.nodeAfter?.attrs?.colspan || 1) - 1
            if (col >= map.width - 1) cell = -1
          }
          if (cell !== s.activeHandle) {
            view.dispatch(view.state.tr.setMeta(proportionalResizingKey, { setHandle: cell }))
          }
        },
        mouseleave(view) {
          if (!view.editable) return
          const s = proportionalResizingKey.getState(view.state)
          if (s && s.activeHandle > -1 && !s.dragging) {
            view.dispatch(view.state.tr.setMeta(proportionalResizingKey, { setHandle: -1 }))
          }
        },
        mousedown(view, event) {
          if (!view.editable) return false
          const s = proportionalResizingKey.getState(view.state)
          if (!s || s.activeHandle === -1 || s.dragging) return false

          const $cell = view.state.doc.resolve(s.activeHandle)
          const tableNode = $cell.node(-1)
          const tableStart = $cell.start(-1)
          const map = TableMap.get(tableNode)
          const col = map.colCount($cell.pos - tableStart) + ($cell.nodeAfter?.attrs?.colspan || 1) - 1
          if (col >= map.width - 1) return false

          let tableDOM = view.domAtPos(tableStart).node as HTMLElement
          while (tableDOM && tableDOM.nodeName !== 'TABLE') {
            tableDOM = tableDOM.parentNode as HTMLElement
          }
          if (!tableDOM) return false

          const firstRow = tableDOM.querySelector('tr')
          if (!firstRow) return false
          const colElements = Array.from(tableDOM.querySelectorAll('colgroup > col')) as HTMLTableColElement[]
          const cells = Array.from(firstRow.children) as HTMLElement[]
          const renderedWidths: number[] = []
          for (const cellEl of cells) {
            const span = Math.max(1, parseInt(cellEl.getAttribute('colspan') || '1', 10) || 1)
            const w = cellEl.offsetWidth / span
            for (let k = 0; k < span; k++) renderedWidths.push(w)
          }
          const tableWidth = tableDOM.offsetWidth || renderedWidths.reduce((a, b) => a + b, 0)
          if (!tableWidth) return false

          const startX = event.clientX
          const leftCol = col
          const rightCol = col + 1
          const origLeft = renderedWidths[leftCol]
          const origRight = renderedWidths[rightCol]
          const pairTotal = origLeft + origRight

          view.dispatch(view.state.tr.setMeta(proportionalResizingKey, { setDragging: true }))

          // Create a visible vertical drag guideline across the entire table height
          const wrapper = tableDOM.closest('.tableWrapper') as HTMLElement || tableDOM
          const originalPosition = wrapper.style.position
          if (getComputedStyle(wrapper).position === 'static') {
            wrapper.style.position = 'relative'
          }
          const guide = document.createElement('div')
          guide.className = 'table-resize-guide'
          const tableRect = tableDOM.getBoundingClientRect()
          const startGuideLeft = event.clientX - tableRect.left
          guide.style.position = 'absolute'
          guide.style.top = '0'
          guide.style.bottom = '0'
          guide.style.left = `${startGuideLeft}px`
          guide.style.width = '2px'
          guide.style.backgroundColor = 'hsl(var(--primary))'
          guide.style.pointerEvents = 'none'
          guide.style.zIndex = '10'
          guide.style.boxShadow = '0 0 4px hsl(var(--primary))'
          wrapper.appendChild(guide)

          let lastLeft = origLeft
          let lastRight = origRight

          const onMove = (e: MouseEvent) => {
            const dx = e.clientX - startX
            let newLeft = origLeft + dx
            let newRight = origRight - dx
            if (newLeft < cellMinWidth) {
              newLeft = cellMinWidth
              newRight = pairTotal - cellMinWidth
            } else if (newRight < cellMinWidth) {
              newRight = cellMinWidth
              newLeft = pairTotal - cellMinWidth
            }
            lastLeft = newLeft
            lastRight = newRight
            renderedWidths[leftCol] = newLeft
            renderedWidths[rightCol] = newRight
            const sum = renderedWidths.reduce((a, b) => a + b, 0)
            for (let i = 0; i < colElements.length; i++) {
              const pct = (renderedWidths[i] / sum) * 100
              colElements[i].style.width = `${pct.toFixed(4)}%`
              colElements[i].setAttribute('data-ratio', (pct / 100).toFixed(4))
            }
            const currentTableRect = tableDOM.getBoundingClientRect()
            const currentGuideLeft = e.clientX - currentTableRect.left
            guide.style.left = `${Math.max(0, Math.min(currentTableRect.width, currentGuideLeft))}px`
          }

          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            if (guide.parentNode) {
              guide.parentNode.removeChild(guide)
            }
            if (originalPosition) {
              wrapper.style.position = originalPosition
            } else {
              wrapper.style.position = ''
            }

            renderedWidths[leftCol] = lastLeft
            renderedWidths[rightCol] = lastRight
            const sum = renderedWidths.reduce((a, b) => a + b, 0)
            const basis = renderedWidths.map(w => Math.max(1, Math.round((w / sum) * 10000)))
            const totalBasis = basis.reduce((a, b) => a + b, 0)
            if (totalBasis !== 10000 && basis.length > 0) {
              basis[basis.length - 1] += (10000 - totalBasis)
            }

            const tr = view.state.tr
            for (let r = 0; r < map.height; r++) {
              for (let c = 0; c < map.width; c++) {
                const pos = map.map[r * map.width + c]
                const cellNode = tableNode.nodeAt(pos)
                if (!cellNode) continue
                const span = cellNode.attrs.colspan || 1
                const widths: number[] = []
                for (let k = 0; k < span; k++) widths.push(basis[c + k])
                tr.setNodeMarkup(tableStart + pos, undefined, {
                  ...cellNode.attrs,
                  colwidth: widths,
                })
                c += (span - 1)
              }
            }
            tr.setMeta(proportionalResizingKey, { setDragging: false, setHandle: -1 })
            if (tr.docChanged) view.dispatch(tr)
          }

          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
          event.preventDefault()
          return true
        },
      },
      decorations(state) {
        const s = proportionalResizingKey.getState(state)
        if (!s || s.activeHandle === -1) return DecorationSet.empty
        const $cell = state.doc.resolve(s.activeHandle)
        const table = $cell.node(-1)
        if (!table) return DecorationSet.empty
        const map = TableMap.get(table)
        const start = $cell.start(-1)
        const col = map.colCount($cell.pos - start) + ($cell.nodeAfter?.attrs?.colspan || 1) - 1
        const decorations: Decoration[] = []
        for (let row = 0; row < map.height; row++) {
          const index = col + row * map.width
          if ((col === map.width - 1 || map.map[index] !== map.map[index + 1]) && (row === 0 || map.map[index] !== map.map[index - map.width])) {
            const cellPos = map.map[index]
            const pos = start + cellPos + (table.nodeAt(cellPos)?.nodeSize || 0) - 1
            const dom = document.createElement('div')
            dom.className = 'column-resize-handle'
            decorations.push(Decoration.widget(pos, dom))
          }
        }
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}

export const ProportionalTable = Table.extend({
  addNodeView() {
    return ({ node }) => new ProportionalTableView(node, this.options.cellMinWidth)
  },
  addProseMirrorPlugins() {
    return [
      createProportionalResizingPlugin({
        cellMinWidth: this.options.cellMinWidth,
        handleWidth: this.options.handleWidth,
      }),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const percentages = getColumnPercentages(node)
    const colgroup = ['colgroup', {}, ...percentages.map(pct => ['col', {
      style: `width: ${pct.toFixed(4)}%`,
      'data-ratio': (pct / 100).toFixed(4),
    }])]
    return ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style: 'width: 100%' }), colgroup, ['tbody', 0]]
  },
})

export function hydrateTableColWidths(html: string): string {
  if (typeof window === 'undefined' || !html || !html.includes('<table')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tables = Array.from(doc.querySelectorAll('table'))
  if (!tables.length) return html
  let touched = false

  for (const table of tables) {
    const cols = Array.from(table.querySelectorAll('colgroup > col'))
    const row = table.querySelector('tr')
    if (!cols.length || !row) continue

    const shares = cols.map(col => {
      const ratio = parseFloat(col.getAttribute('data-ratio') || '')
      if (isFinite(ratio) && ratio > 0) return ratio
      const pct = (col.getAttribute('style') || '').match(/(?<!-)\bwidth:\s*([\d.]+)%/)
      return pct ? parseFloat(pct[1]) / 100 : 0
    })
    if (!shares.every(sh => sh > 0)) continue

    const cells = Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH')
    const hasColwidth = cells.some(c => c.hasAttribute('colwidth'))
    if (hasColwidth) continue

    let col = 0
    for (const cell of cells) {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1)
      const widths: number[] = []
      for (let k = 0; k < span; k++) {
        widths.push(Math.max(1, Math.round((shares[col + k] || 0) * 10000)))
      }
      if (widths.length === span && col + span <= shares.length) {
        cell.setAttribute('colwidth', widths.join(','))
        touched = true
      }
      col += span
    }
  }
  return touched ? doc.body.innerHTML : html
}

