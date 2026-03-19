<template>
  <div class="amount-input w-1/1">
    <el-input
      :model-value="displayValue"
      :placeholder="placeholder || '请输入金额'"
      :disabled="disabled"
      @input="handleInput"
      @blur="handleBlur"
    >
      <template #prefix>
        <span>{{ currencySymbol || '￥' }}</span>
      </template>
    </el-input>

    <div v-if="showUppercase" class="amount-uppercase">
      大写：{{ uppercaseText }}
    </div>
  </div>
</template>

<script lang="ts" setup>
defineOptions({ name: 'AmountInput' })

interface Props {
  modelValue?: number | string | null
  disabled?: boolean
  placeholder?: string
  precision?: number
  min?: number
  max?: number
  showUppercase?: boolean
  currencySymbol?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  disabled: false,
  placeholder: '',
  precision: 2,
  min: 0,
  max: undefined,
  showUppercase: true,
  currencySymbol: '￥'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | null): void
}>()

const rawValue = ref('')

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeInput = (value: string) => {
  if (!value) {
    return ''
  }
  const withoutComma = value.replace(new RegExp(escapeRegExp(','), 'g'), '')
  const sanitized = withoutComma.replace(/[^\d.]/g, '')
  if (!sanitized) {
    return ''
  }

  const firstDotIndex = sanitized.indexOf('.')
  let integerPart = ''
  let decimalPart = ''

  if (firstDotIndex === -1) {
    integerPart = sanitized
  } else {
    integerPart = sanitized.slice(0, firstDotIndex)
    decimalPart = sanitized.slice(firstDotIndex + 1).replace(/\./g, '')
  }

  integerPart = integerPart.replace(/^0+(?=\d)/, '')
  if (!integerPart) {
    integerPart = '0'
  }

  const precision = Math.max(0, Number(props.precision) || 0)
  if (precision === 0) {
    return integerPart
  }
  if (firstDotIndex !== -1) {
    decimalPart = decimalPart.slice(0, precision)
    return `${integerPart}.${decimalPart}`
  }
  return integerPart
}

const formatWithComma = (value: string) => {
  if (!value) {
    return ''
  }
  const [integerPart, decimalPart] = value.split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger
}

const toNumber = (value: string): number | null => {
  if (!value || value === '.') {
    return null
  }
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return null
  }
  return parsed
}

const clampValue = (value: number) => {
  let result = value
  if (props.min !== undefined && result < Number(props.min)) {
    result = Number(props.min)
  }
  if (props.max !== undefined && props.max !== null && result > Number(props.max)) {
    result = Number(props.max)
  }
  return result
}

const displayValue = computed(() => formatWithComma(rawValue.value))

const CN_NUM = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const CN_INT_RADICE = ['', '拾', '佰', '仟']
const CN_INT_UNITS = ['', '万', '亿', '兆']
const CN_DEC_UNITS = ['角', '分']
const CN_INT_LAST = '元'
const CN_INTEGER = '整'
const MAX_AMOUNT = 999999999999999

const integerToChinese = (integerValue: string) => {
  if (integerValue === '0') {
    return '零'
  }
  let chinese = ''
  let zeroCount = 0
  const length = integerValue.length
  for (let i = 0; i < length; i++) {
    const n = Number(integerValue.charAt(i))
    const p = length - i - 1
    const q = Math.floor(p / 4)
    const m = p % 4
    if (n === 0) {
      zeroCount++
    } else {
      if (zeroCount > 0) {
        chinese += CN_NUM[0]
      }
      zeroCount = 0
      chinese += CN_NUM[n] + CN_INT_RADICE[m]
    }
    if (m === 0 && zeroCount < 4) {
      chinese += CN_INT_UNITS[q]
    }
  }
  return chinese
}

const numberToChineseCurrency = (value: number) => {
  if (value < 0 || value > MAX_AMOUNT) {
    return '--'
  }
  const fixedValue = value.toFixed(2)
  const [integerValue, decimalValue] = fixedValue.split('.')
  let chinese = `${integerToChinese(integerValue)}${CN_INT_LAST}`

  if (decimalValue === '00') {
    chinese += CN_INTEGER
    return chinese
  }

  const jiao = Number(decimalValue.charAt(0))
  const fen = Number(decimalValue.charAt(1))
  if (jiao > 0) {
    chinese += `${CN_NUM[jiao]}${CN_DEC_UNITS[0]}`
  }
  if (fen > 0) {
    if (jiao === 0) {
      chinese += CN_NUM[0]
    }
    chinese += `${CN_NUM[fen]}${CN_DEC_UNITS[1]}`
  }
  return chinese
}

const uppercaseText = computed(() => {
  const value = toNumber(rawValue.value)
  if (value === null) {
    return '--'
  }
  return numberToChineseCurrency(clampValue(value))
})

const emitValue = (value: string) => {
  const numberValue = toNumber(value)
  emit('update:modelValue', numberValue === null ? null : numberValue)
}

const handleInput = (value: string) => {
  const normalized = normalizeInput(value)
  rawValue.value = normalized
  emitValue(normalized)
}

const handleBlur = () => {
  const numberValue = toNumber(rawValue.value)
  if (numberValue === null) {
    rawValue.value = ''
    emit('update:modelValue', null)
    return
  }

  const precision = Math.max(0, Number(props.precision) || 0)
  const fixedValue = clampValue(numberValue).toFixed(precision)
  const normalized = normalizeInput(fixedValue)
  rawValue.value = normalized
  emitValue(normalized)
}

watch(
  () => props.modelValue,
  (value) => {
    if (value === null || value === undefined || value === '') {
      rawValue.value = ''
      return
    }
    rawValue.value = normalizeInput(String(value))
  },
  {
    immediate: true
  }
)
</script>

<style lang="scss" scoped>
.amount-input {
  .amount-uppercase {
    margin-top: 6px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.4;
  }
}
</style>
