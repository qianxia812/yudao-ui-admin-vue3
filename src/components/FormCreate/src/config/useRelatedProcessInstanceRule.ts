import { generateUUID } from '@/utils'
import { makeRequiredRule } from '@/components/FormCreate/src/utils'
import * as DefinitionApi from '@/api/bpm/definition'

/**
 * 关联审批单组件规则
 */
export const useRelatedProcessInstanceRule = () => {
  const label = '关联审批单'
  const name = 'RelatedProcessInstanceSelect'
  const processDefinitionOptions = ref<{ label: string; value: string }[]>([])

  onMounted(async () => {
    const data = await DefinitionApi.getProcessDefinitionListAll({
      suspensionState: 1
    })
    processDefinitionOptions.value = (data || [])
      .filter((item: any) => item?.key)
      .map((item: any) => ({
        label: item.name,
        value: item.key
      }))
  })

  return {
    icon: 'icon-select',
    label,
    name,
    event: ['change'],
    rule() {
      return {
        type: name,
        field: generateUUID(),
        title: label,
        info: '',
        $required: false,
        props: {
          multiple: true,
          placeholder: '请选择关联审批单',
          processDefinitionKeys: []
        }
      }
    },
    props() {
      return [
        makeRequiredRule(),
        {
          type: 'switch',
          field: 'multiple',
          title: '是否支持多选',
          value: true
        },
        {
          type: 'input',
          field: 'placeholder',
          title: '提示信息'
        },
        {
          type: 'select',
          field: 'processDefinitionKeys',
          title: '指定关联审批单类型',
          value: [],
          options: processDefinitionOptions.value,
          props: {
            multiple: true,
            filterable: true,
            clearable: true,
            collapseTags: true,
            collapseTagsTooltip: true
          },
          info: '不选择时，默认可关联所有类型审批单'
        }
      ]
    }
  }
}
