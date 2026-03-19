<template>
  <div class="signature-input w-1/1">
    <div v-if="!disabled" class="signature-board">
      <Vue3Signature
        ref="signatureRef"
        class="signature-canvas"
        :w="canvasWidth"
        :h="canvasHeight"
      />
      <div class="signature-actions">
        <el-button text @click="handleClear">清空</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">确认签名</el-button>
      </div>
    </div>

    <div v-if="showPreview" class="signature-preview">
      <el-image
        v-if="previewSrc"
        class="signature-preview-image"
        :src="previewSrc"
        fit="contain"
        :preview-src-list="[previewSrc]"
      />
      <el-text v-else type="info">{{ placeholder || '未签名' }}</el-text>
    </div>
  </div>
</template>

<script lang="ts" setup>
import Vue3Signature from 'vue3-signature'
import * as FileApi from '@/api/infra/file'
import download from '@/utils/download'

defineOptions({ name: 'SignatureInput' })

interface Props {
  modelValue?: string | null
  disabled?: boolean
  placeholder?: string
  width?: string
  height?: string
  upload?: boolean
  showPreview?: boolean
  clearValueOnClear?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  disabled: false,
  placeholder: '',
  width: '100%',
  height: '220px',
  upload: true,
  showPreview: true,
  clearValueOnClear: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const message = useMessage()

const signatureRef = ref<any>()
const saving = ref(false)
const previewSrc = ref('')

const canvasWidth = computed(() => props.width || '100%')
const canvasHeight = computed(() => props.height || '220px')

const handleClear = () => {
  signatureRef.value?.clear?.()
  if (props.clearValueOnClear) {
    previewSrc.value = ''
    emit('update:modelValue', '')
  }
}

const handleSave = async () => {
  if (!signatureRef.value?.save) {
    return
  }
  const base64 = signatureRef.value.save('image/png')
  if (!base64 || typeof base64 !== 'string') {
    message.warning('请先完成签名')
    return
  }

  if (!props.upload) {
    previewSrc.value = base64
    emit('update:modelValue', base64)
    return
  }

  saving.value = true
  try {
    const res = await FileApi.updateFile({
      file: download.base64ToFile(base64, 'signature')
    })
    const url = res?.data || ''
    if (!url) {
      throw new Error('empty signature url')
    }
    previewSrc.value = url
    emit('update:modelValue', url)
  } catch {
    message.error('签名上传失败，请重试')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (value) => {
    previewSrc.value = value || ''
  },
  {
    immediate: true
  }
)
</script>

<style lang="scss" scoped>
.signature-input {
  .signature-board {
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    overflow: hidden;
  }

  .signature-canvas {
    background-color: #fff;
  }

  .signature-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 10px;
    border-top: 1px solid var(--el-border-color-lighter);
    background-color: var(--el-fill-color-light);
  }

  .signature-preview {
    margin-top: 8px;
    display: flex;
    min-height: 40px;
    align-items: center;
  }

  .signature-preview-image {
    width: 220px;
    height: 80px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 4px;
    background-color: #fff;
  }
}
</style>
