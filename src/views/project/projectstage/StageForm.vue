<template>
  <Dialog :title="dialogTitle" v-model="dialogVisible" width="520px">
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-width="90px"
      v-loading="formLoading"
    >
      <el-form-item label="项目编号" prop="projectCode">
        <el-input v-model="formData.projectCode" placeholder="请输入项目编号" />
      </el-form-item>
      <el-form-item label="项目名称" prop="projectName">
        <el-input v-model="formData.projectName" placeholder="请输入项目名称" />
      </el-form-item>
      <el-form-item label="项目报价" prop="projectQuote">
        <el-input
          v-model="formData.projectQuote"
          placeholder="请输入项目报价"
          @input="handleProjectQuoteInput"
        >
          <template #append>元</template>
        </el-input>
      </el-form-item>
      <el-form-item label="项目概述" prop="remark">
        <el-input
          v-model="formData.remark"
          type="textarea"
          :rows="4"
          maxlength="500"
          show-word-limit
          placeholder="请输入项目概述"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :loading="formLoading" @click="submitForm">确 定</el-button>
      <el-button @click="dialogVisible = false">取 消</el-button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { StageApi, type StageFormVO } from '@/api/project/projectstage'
import type { FormInstance, FormRules } from 'element-plus'

defineOptions({ name: 'StageForm' })

const { t } = useI18n()
const message = useMessage()

const dialogVisible = ref(false)
const dialogTitle = ref('')
const formLoading = ref(false)
const formType = ref<'create' | 'update'>('create')
const formRef = ref<FormInstance>()
const formData = ref<StageFormVO>({
  projectCode: undefined,
  projectName: undefined,
  projectQuote: undefined,
  remark: undefined
})
const PROJECT_QUOTE_REGEXP = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/
const handleProjectQuoteInput = (value: string) => {
  let quote = String(value ?? '')
  quote = quote.replace(/[^\d.]/g, '')
  quote = quote.replace(/^\./, '')

  const dotIndex = quote.indexOf('.')
  if (dotIndex >= 0) {
    const integerPart = quote.slice(0, dotIndex).replace(/\./g, '').slice(0, 14)
    const decimalPart = quote.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2)
    quote = decimalPart.length > 0 ? `${integerPart}.${decimalPart}` : `${integerPart}.`
  } else {
    quote = quote.slice(0, 14)
  }
  formData.value.projectQuote = quote
}

const validateProjectQuote = (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
  if (value === undefined || value === null || value === '') {
    callback()
    return
  }
  const quote = String(value).trim()
  if (!PROJECT_QUOTE_REGEXP.test(quote)) {
    callback(new Error('项目报价仅支持数字，最多 16 位长度（含 2 位小数）'))
    return
  }
  callback()
}
const formRules = reactive<FormRules>({
  projectCode: [{ required: true, message: '项目编号不能为空', trigger: 'blur' }],
  projectName: [{ required: true, message: '项目名称不能为空', trigger: 'blur' }],
  projectQuote: [{ validator: validateProjectQuote, trigger: ['blur', 'change'] }]
})

const open = async (type: 'create' | 'update', id?: number) => {
  dialogVisible.value = true
  dialogTitle.value = t('action.' + type)
  formType.value = type
  resetForm()
  if (type === 'update' && id) {
    formLoading.value = true
    try {
      const data = await StageApi.getStage(id)
      formData.value = {
        ...data,
        projectQuote: data.projectQuote ?? data.projectPrice
      }
    } finally {
      formLoading.value = false
    }
  }
}
defineExpose({ open })

const emit = defineEmits(['success'])
const buildSubmitData = (): StageFormVO => {
  const quote = formData.value.projectQuote
  return {
    id: formData.value.id,
    projectCode: formData.value.projectCode,
    projectName: formData.value.projectName,
    projectQuote:
      quote === undefined || quote === null || quote === '' ? undefined : String(quote).trim(),
    remark: formData.value.remark
  }
}

const submitForm = async () => {
  if (!formRef.value) {
    return
  }
  await formRef.value.validate()
  formLoading.value = true
  try {
    const data = buildSubmitData()
    if (formType.value === 'create') {
      await StageApi.createStage(data)
      message.success(t('common.createSuccess'))
    } else {
      await StageApi.updateStage(data)
      message.success(t('common.updateSuccess'))
    }
    dialogVisible.value = false
    emit('success')
  } finally {
    formLoading.value = false
  }
}

const resetForm = () => {
  formData.value = {
    projectCode: undefined,
    projectName: undefined,
    projectQuote: undefined,
    remark: undefined
  }
  formRef.value?.resetFields()
}
</script>
