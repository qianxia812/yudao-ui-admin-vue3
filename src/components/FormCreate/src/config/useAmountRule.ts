import { generateUUID } from '@/utils'
import { localeProps, makeRequiredRule } from '@/components/FormCreate/src/utils'

export const useAmountRule = () => {
  const label = '金额'
  const name = 'AmountInput'

  return {
    icon: 'icon-number',
    label,
    name,
    event: ['change', 'blur'],
    rule() {
      return {
        type: name,
        field: generateUUID(),
        title: label,
        info: '',
        $required: false,
        props: {
          placeholder: '请输入金额',
          precision: 2,
          min: 0,
          max: undefined,
          showUppercase: true,
          currencySymbol: '￥'
        }
      }
    },
    props(_, { t }) {
      return localeProps(t, name + '.props', [
        makeRequiredRule(),
        {
          type: 'input',
          field: 'placeholder',
          title: '提示信息'
        },
        {
          type: 'input',
          field: 'currencySymbol',
          title: '货币符号',
          value: '￥'
        },
        {
          type: 'inputNumber',
          field: 'precision',
          title: '小数位数',
          value: 2,
          props: {
            min: 0,
            max: 6
          }
        },
        {
          type: 'inputNumber',
          field: 'min',
          title: '最小值',
          value: 0
        },
        {
          type: 'inputNumber',
          field: 'max',
          title: '最大值'
        },
        {
          type: 'switch',
          field: 'showUppercase',
          title: '显示大写金额',
          value: true
        }
      ])
    }
  }
}
