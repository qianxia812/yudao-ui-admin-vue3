import { generateUUID } from '@/utils'
import { makeRequiredRule } from '@/components/FormCreate/src/utils'

/**
 * 关联项目组件规则
 */
export const useRelatedProjectRule = () => {
  const label = '关联项目'
  const name = 'RelatedProjectSelect'

  return {
    icon: 'icon-link',
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
          placeholder: '请选择关联项目'
        }
      }
    },
    props() {
      return [
        makeRequiredRule(),
        {
          type: 'input',
          field: 'placeholder',
          title: '提示信息'
        }
      ]
    }
  }
}
