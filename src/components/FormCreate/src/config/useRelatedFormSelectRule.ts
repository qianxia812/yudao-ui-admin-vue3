import { generateUUID } from '@/utils'
import { makeRequiredRule } from '@/components/FormCreate/src/utils'

interface FieldOption {
  label: string
  value: string
}

interface RelatedFormRulePayload {
  title?: string
  relatedDefinitionId?: string | number
  relatedDefinitionKey?: string
  relatedDefinitionName?: string
  relatedFields?: string[]
  relatedFieldOptions?: FieldOption[]
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeFieldLabel = (label: unknown, value: string) => {
  const text = typeof label === 'string' ? label.trim() : ''
  if (!text) {
    return '未命名字段'
  }
  const normalized = text
    .replace(new RegExp(`\\s*[（(]\\s*${escapeRegExp(value)}\\s*[）)]\\s*$`), '')
    .trim()
  return normalized || text
}

const parseFieldOptions = (value: FieldOption[] | string | undefined) => {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item?.value)
      .map((item) => ({
        label: normalizeFieldLabel(item.label, item.value),
        value: item.value
      }))
  }
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item) => item?.value)
      .map((item) => ({
        label: normalizeFieldLabel(item.label, item.value),
        value: item.value
      }))
  } catch {
    return []
  }
}

export const createRelatedFormSelectRule = (payload?: RelatedFormRulePayload) => {
  const relatedFieldOptions = payload?.relatedFieldOptions || []
  return {
    type: 'RelatedFormSelect',
    field: generateUUID(),
    title: payload?.title || '关联表单',
    info: '',
    $required: false,
    props: {
      placeholder: '请选择关联审批单',
      relatedDefinitionId: payload?.relatedDefinitionId ? String(payload.relatedDefinitionId) : '',
      relatedDefinitionKey: payload?.relatedDefinitionKey || '',
      relatedDefinitionName: payload?.relatedDefinitionName || '',
      relatedFields: payload?.relatedFields || [],
      relatedFieldOptions
    }
  }
}

/**
 * 关联表单组件规则
 */
export const useRelatedFormSelectRule = () => {
  const label = '关联表单'
  const name = 'RelatedFormSelect'

  return {
    icon: 'icon-link',
    label,
    name,
    event: ['change'],
    rule() {
      return createRelatedFormSelectRule({
        title: label
      })
    },
    props(rule) {
      const fieldOptions = parseFieldOptions(
        rule?.props?.relatedFieldOptions || rule?.relatedFieldOptions
      )
      return [
        makeRequiredRule(),
        {
          type: 'input',
          field: 'placeholder',
          title: '提示信息'
        },
        {
          type: 'input',
          field: 'relatedDefinitionName',
          title: '关联表单',
          props: {
            disabled: true
          }
        },
        {
          type: 'select',
          field: 'relatedFields',
          title: '关联字段',
          value: [],
          options: fieldOptions,
          props: {
            multiple: true,
            clearable: true,
            collapseTags: true,
            collapseTagsTooltip: true
          },
          info: fieldOptions.length > 0 ? '' : '请在左侧“关联”中选择表单并设置字段'
        }
      ]
    }
  }
}
