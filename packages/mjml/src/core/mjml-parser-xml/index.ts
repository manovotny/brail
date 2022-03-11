import { Parser } from 'htmlparser2'

// @ts-expect-error ts-migrate(7016) FIXME: Could not find a declaration file for module 'loda... Remove this comment to see the full error message
import { isObject, findLastIndex, find } from 'lodash'
// @ts-expect-error ts-migrate(7016) FIXME: Could not find a declaration file for module 'loda... Remove this comment to see the full error message
import { filter, map, flow } from 'lodash/fp'
import path from 'path'
import fs from 'fs'

import cleanNode from './helpers/cleanNode'
import convertBooleansOnAttrs from './helpers/convertBooleansOnAttrs'
import setEmptyAttributes from './helpers/setEmptyAttributes'

const isNode = require('detect-node')

const indexesForNewLine = (xml: any) => {
  const regex = /\n/gi
  const indexes = [0]

  while (regex.exec(xml)) {
    indexes.push(regex.lastIndex)
  }

  return indexes
}

const isSelfClosing = (indexes: any, parser: any) =>
  indexes.startIndex === parser.startIndex &&
  indexes.endIndex === parser.endIndex

export default function MJMLParser(xml: any, options = {}, includedIn = []) {
  const {
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'addEmptyAttributes' does not exist on ty... Remove this comment to see the full error message
    addEmptyAttributes = true,
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'components' does not exist on type '{}'.
    components = {},
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'convertBooleans' does not exist on type ... Remove this comment to see the full error message
    convertBooleans = true,
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'keepComments' does not exist on type '{}... Remove this comment to see the full error message
    keepComments = true,
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'filePath' does not exist on type '{}'.
    filePath = '.',
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'actualPath' does not exist on type '{}'.
    actualPath = '.',
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'ignoreIncludes' does not exist on type '... Remove this comment to see the full error message
    ignoreIncludes = false,
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'preprocessors' does not exist on type '{... Remove this comment to see the full error message
    preprocessors = [],
  } = options

  const endingTags = flow(
    filter((component: any) => component.endingTag),
    map((component: any) => component.getTagName()),
  )({ ...components })

  let cwd = process.cwd()

  if (isNode && filePath) {
    try {
      const isDir = fs.lstatSync(filePath).isDirectory()
      cwd = isDir ? filePath : path.dirname(filePath)
    } catch (e) {
      throw new Error('Specified filePath does not exist')
    }
  }

  let mjml: any = null
  let cur: any = null
  let inInclude = !!includedIn.length
  let inEndingTag = 0
  const cssIncludes: any = []
  const currentEndingTagIndexes = { startIndex: 0, endIndex: 0 }

  const findTag = (tagName: any, tree: any) => find(tree.children, { tagName })
  const lineIndexes = indexesForNewLine(xml)

  const handleCssHtmlInclude = (file: any, attrs: any, line: any) => {
    const partialPath = path.resolve(cwd, file)
    let content
    try {
      content = fs.readFileSync(partialPath, 'utf8')
    } catch (e) {
      const newNode = {
        line,
        file,
        absoluteFilePath: path.resolve(cwd, actualPath),
        parent: cur,
        tagName: 'mj-raw',
        content: `<!-- mj-include fails to read file : ${file} at ${partialPath} -->`,
        children: [],
        errors: [
          {
            type: 'include',
            params: { file, partialPath },
          },
        ],
      }
      cur.children.push(newNode)

      return
    }

    if (attrs.type === 'html') {
      const newNode = {
        line,
        file,
        absoluteFilePath: path.resolve(cwd, actualPath),
        parent: cur,
        tagName: 'mj-raw',
        content,
      }
      cur.children.push(newNode)

      return
    }

    const attributes =
      attrs['css-inline'] === 'inline' ? { inline: 'inline' } : {}

    const newNode = {
      line,
      file,
      absoluteFilePath: path.resolve(cwd, actualPath),
      tagName: 'mj-style',
      content,
      children: [],
      attributes,
    }
    cssIncludes.push(newNode)
  }

  const handleInclude = (file: any, line: any) => {
    const partialPath = path.resolve(cwd, file)
    const curBeforeInclude = cur

    if (find(cur.includedIn, { file: partialPath }))
      throw new Error(`Circular inclusion detected on file : ${partialPath}`)

    let content

    try {
      content = fs.readFileSync(partialPath, 'utf8')
    } catch (e) {
      const newNode = {
        line,
        file,
        absoluteFilePath: path.resolve(cwd, actualPath),
        parent: cur,
        tagName: 'mj-raw',
        content: `<!-- mj-include fails to read file : ${file} at ${partialPath} -->`,
        children: [],
        errors: [
          {
            type: 'include',
            params: { file, partialPath },
          },
        ],
      }
      cur.children.push(newNode)

      return
    }

    content =
      content.indexOf('<mjml>') === -1
        ? `<mjml><mj-body>${content}</mj-body></mjml>`
        : content

    const partialMjml = MJMLParser(
      content,
      {
        ...options,
        filePath: partialPath,
        actualPath: partialPath,
      },
      [
        // @ts-expect-error ts-migrate(2322) FIXME: Type 'any' is not assignable to type 'never'.
        ...cur.includedIn,
        {
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'any' is not assignable to type 'never'.
          file: cur.absoluteFilePath,
          // @ts-expect-error ts-migrate(2322) FIXME: Type 'any' is not assignable to type 'never'.
          line,
        },
      ],
    )

    const bindToTree = (children: any, tree = cur) =>
      children.map((c: any) => ({
        ...c,
        parent: tree,
      }))

    if (partialMjml.tagName !== 'mjml') {
      return
    }

    const body = findTag('mj-body', partialMjml)
    const head = findTag('mj-head', partialMjml)

    if (body) {
      const boundChildren = bindToTree(body.children)
      cur.children = [...cur.children, ...boundChildren]
    }

    if (head) {
      let curHead = findTag('mj-head', mjml)

      if (!curHead) {
        mjml.children.push({
          file: actualPath,
          absoluteFilePath: path.resolve(cwd, actualPath),
          parent: mjml,
          tagName: 'mj-head',
          children: [],
          includedIn: [],
        })

        curHead = findTag('mj-head', mjml)
      }

      const boundChildren = bindToTree(head.children, curHead)
      curHead.children = [...curHead.children, ...boundChildren]
    }

    // must restore cur to the cur before include started
    cur = curBeforeInclude
  }

  const parser = new Parser(
    {
      onopentag: (name, attrs) => {
        const isAnEndingTag = endingTags.indexOf(name) !== -1

        if (inEndingTag > 0) {
          if (isAnEndingTag) inEndingTag += 1
          return
        }

        if (isAnEndingTag) {
          inEndingTag += 1

          if (inEndingTag === 1) {
            // we're entering endingTag
            currentEndingTagIndexes.startIndex = parser.startIndex
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'number | null' is not assignable to type 'nu... Remove this comment to see the full error message
            currentEndingTagIndexes.endIndex = parser.endIndex
          }
        }

        const line =
          findLastIndex(lineIndexes, (i: any) => i <= parser.startIndex) + 1

        if (name === 'mj-include') {
          if (ignoreIncludes || !isNode) return

          if (attrs.type === 'css' || attrs.type === 'html') {
            handleCssHtmlInclude(decodeURIComponent(attrs.path), attrs, line)
            return
          }

          inInclude = true
          handleInclude(decodeURIComponent(attrs.path), line)
          return
        }

        if (convertBooleans) {
          // "true" and "false" will be converted to bools
          attrs = convertBooleansOnAttrs(attrs)
        }

        const newNode = {
          file: actualPath,
          absoluteFilePath: isNode ? path.resolve(cwd, actualPath) : actualPath,
          line,
          includedIn,
          parent: cur,
          tagName: name,
          attributes: attrs,
          children: [],
        }

        if (cur) {
          cur.children.push(newNode)
        } else {
          mjml = newNode
        }

        cur = newNode
      },
      onclosetag: (name) => {
        if (endingTags.indexOf(name) !== -1) {
          inEndingTag -= 1

          if (!inEndingTag) {
            // we're getting out of endingTag
            // if self-closing tag we don't get the content
            if (!isSelfClosing(currentEndingTagIndexes, parser)) {
              const partialVal = xml
                .substring(
                  currentEndingTagIndexes.endIndex + 1,
                  parser.endIndex,
                )
                .trim()
              const val = partialVal.substring(
                0,
                partialVal.lastIndexOf(`</${name}`),
              )

              if (val) cur.content = val.trim()
            }
          }
        }

        if (inEndingTag > 0) return

        if (inInclude) {
          inInclude = false
        }

        // for includes, setting cur is handled in handleInclude because when there is
        // only mj-head in include it doesn't create any elements, so setting back to parent is wrong
        if (name !== 'mj-include') cur = (cur && cur.parent) || null
      },
      ontext: (text) => {
        if (inEndingTag > 0) return

        if (text && text.trim() && cur) {
          cur.content = `${(cur && cur.content) || ''}${text.trim()}`.trim()
        }
      },
      oncomment: (data) => {
        if (inEndingTag > 0) return

        if (cur && keepComments) {
          cur.children.push({
            line: findLastIndex(lineIndexes, (i: any) => i <= parser.startIndex) + 1,
            tagName: 'mj-raw',
            content: `<!-- ${data.trim()} -->`,
            includedIn,
          })
        }
      },
    },
    {
      recognizeCDATA: true,
      decodeEntities: false,
      recognizeSelfClosing: true,
      lowerCaseAttributeNames: false,
    },
  )

  // Apply preprocessors to raw xml
  xml = flow(preprocessors)(xml)

  parser.write(xml)
  parser.end()

  if (!isObject(mjml)) {
    throw new Error('Parsing failed. Check your mjml.')
  }

  cleanNode(mjml)

  // Assign "attributes" property if not set
  if (addEmptyAttributes) {
    setEmptyAttributes(mjml)
  }

  if (cssIncludes.length) {
    const head = find(mjml.children, { tagName: 'mj-head' })

    if (head) {
      if (head.children) {
        head.children = [...head.children, ...cssIncludes]
      } else {
        head.children = cssIncludes
      }
    } else {
      mjml.children.push({
        file: filePath,
        line: 0,
        tagName: 'mj-head',
        children: cssIncludes,
      })
    }
  }

  return mjml
}
