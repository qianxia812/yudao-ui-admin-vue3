import { generateUUID } from '@/utils'
import { localeProps, makeRequiredRule } from '@/components/FormCreate/src/utils'

export const useSignatureRule = () => {
  const label = '手写签名'
  const name = 'SignatureInput'

  return {
    icon: 'icon-edit',
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
          placeholder: '请手写签名',
          width: '100%',
          height: '220px',
          upload: true,
          showPreview: true,
          clearValueOnClear: true
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
          field: 'width',
          title: '画板宽度',
          value: '100%'
        },
        {
          type: 'input',
          field: 'height',
          title: '画板高度',
          value: '220px'
        },
        {
          type: 'switch',
          field: 'upload',
          title: '上传后存储 URL',
          value: true
        },
        {
          type: 'switch',
          field: 'showPreview',
          title: '显示签名预览',
          value: true
        },
        {
          type: 'switch',
          field: 'clearValueOnClear',
          title: '清空时同步清值',
          value: true
        }
      ])
    }
  }
}
