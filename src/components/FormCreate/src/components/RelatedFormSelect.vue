<template>
  <div class="related-form-select w-1/1">
    <div class="flex items-center gap-8px">
      <el-input
        :model-value="displayText"
        :placeholder="placeholder || '请选择关联审批单'"
        readonly
        :disabled="disabled"
        @click="handleOpenDialog"
      />
      <el-button v-if="!disabled" @click="handleOpenDialog">选择</el-button>
      <el-button v-if="!disabled" plain type="primary" @click="handleCreateNew">新建审批</el-button>
    </div>

    <div v-if="selectedValue?.processInstanceId" class="mt-8px flex items-center gap-8px">
      <el-tag :closable="!disabled" @close="handleClear">
        {{ selectedValue.processInstanceName || '审批单' }}
      </el-tag>
    </div>

    <div v-if="selectedFieldEntries.length > 0" class="mt-8px">
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item v-for="item in selectedFieldEntries" :key="item.field" :label="item.label">
          {{ formatFieldValue(item.value) }}
        </el-descriptions-item>
      </el-descriptions>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="选择关联审批单"
      width="960px"
      append-to-body
      destroy-on-close
    >
      <div class="mb-10px flex items-center gap-8px">
        <el-input
          v-model="queryParams.name"
          placeholder="请输入审批单名称"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-button @click="handleSearch">搜索</el-button>
        <el-button plain type="primary" @click="handleCreateNew">新建审批</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="processInstanceList"
        max-height="430"
        @row-click="handleSelectRow"
      >
        <el-table-column label="" width="56" align="center">
          <template #default="{ row }">
            <el-radio
              v-model="dialogSelectedInstanceId"
              :value="String(row.id)"
              @change="() => handleSelectRow(row)"
            >
              <span></span>
            </el-radio>
          </template>
        </el-table-column>
        <el-table-column label="审批单信息" min-width="700">
          <template #default="{ row }">
            <div class="instance-cell">
              <div class="instance-name">{{ row.name || '--' }}</div>
              <div class="instance-line">
                流程名称：{{ row.processDefinition?.name || row.processDefinitionName || '--' }}
              </div>
              <div class="instance-line">状态：{{ getStatusLabel(row.status) }}</div>
              <div class="instance-line">发起人：{{ getStarterName(row) }}</div>
              <div class="instance-line">当前节点：{{ getCurrentTaskDisplay(row) }}</div>
              <div class="instance-line">
                发起时间：{{ formatDate(row.startTime || row.createTime) || '--' }}
              </div>
              <div class="instance-line">结束时间：{{ formatDate(row.endTime) || '--' }}</div>
              <div class="instance-line">字段信息：{{ getSummaryText(row.summary) }}</div>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-10px flex justify-end">
        <el-pagination
          v-model:current-page="queryParams.pageNo"
          v-model:page-size="queryParams.pageSize"
          :page-sizes="[10, 20, 50, 100, 200]"
          layout="sizes, prev, pager, next, total"
          :total="queryParams.total"
          @current-change="loadProcessInstances"
          @size-change="handlePageSizeChange"
        />
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleConfirmDialog">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import * as ProcessInstanceApi from '@/api/bpm/processInstance'
import { BpmProcessInstanceStatus } from '@/utils/constants'
import { formatDate } from '@/utils/formatTime'

defineOptions({ name: 'RelatedFormSelect' })

interface FieldOption {
  label: string
  value: string
}

interface RelatedFormValue {
  processInstanceId?: string | number
  processInstanceName?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processDefinitionName?: string
  relatedFieldValues?: Record<string, any>
}

interface Props {
  modelValue?: RelatedFormValue | null
  disabled?: boolean
  placeholder?: string
  relatedDefinitionId?: string | number
  relatedDefinitionKey?: string
  relatedDefinitionName?: string
  relatedFields?: string | string[]
  relatedFieldOptions?: FieldOption[] | string
  formCreateInject?: any
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  disabled: false,
  placeholder: '',
  relatedDefinitionId: '',
  relatedDefinitionKey: '',
  relatedDefinitionName: '',
  relatedFields: () => [],
  relatedFieldOptions: () => []
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: RelatedFormValue | null): void
}>()

const message = useMessage()
const router = useRouter()

const dialogVisible = ref(false)
const loading = ref(false)
const processInstanceList = ref<any[]>([])
const dialogSelectedInstanceId = ref('')
const dialogSelectedInstance = ref<any>()

const selectedValue = ref<RelatedFormValue | null>(null)

const queryParams = reactive({
  pageNo: 1,
  pageSize: 20,
  total: 0,
  name: ''
})
const MAX_API_PAGE_SIZE = 200

const normalizePageSize = (value: unknown) => {
  const size = Number(value)
  if (Number.isNaN(size)) {
    return 20
  }
  return Math.min(MAX_API_PAGE_SIZE, Math.max(1, size))
}

const getQueryString = (value: unknown) => {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value).trim()
}

const parseStringArray = (value: string | string[]) => {
  if (Array.isArray(value)) {
    return value.map((item) => getQueryString(item)).filter(Boolean)
  }
  if (!value) {
    return []
  }
  return value
    .split(/[,\uff0c]/)
    .map((item) => item.trim())
    .filter(Boolean)
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

const parseFieldOptions = (value: FieldOption[] | string) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item?.value).map((item) => ({
      label: normalizeFieldLabel(item.label, item.value),
      value: item.value
    }))
  }
  if (!value) {
    return []
  }
  try {
    const temp = JSON.parse(value)
    if (!Array.isArray(temp)) {
      return []
    }
    return temp
      .filter((item) => item?.value)
      .map((item) => ({
        label: normalizeFieldLabel(item.label, item.value),
        value: item.value
      }))
  } catch {
    return []
  }
}

const relatedFieldKeys = computed(() => parseStringArray(props.relatedFields))

const relatedFieldOptionMap = computed(() => {
  const map = new Map<string, string>()
  parseFieldOptions(props.relatedFieldOptions).forEach((item) => {
    map.set(item.value, item.label)
  })
  return map
})

const configuredFieldKeys = computed(() => {
  if (relatedFieldKeys.value.length > 0) {
    return relatedFieldKeys.value
  }
  return [...relatedFieldOptionMap.value.keys()]
})

const displayText = computed(() => {
  if (!selectedValue.value?.processInstanceId) {
    return ''
  }
  return selectedValue.value.processInstanceName || '审批单'
})

const selectedFieldEntries = computed(() => {
  const fieldValues = selectedValue.value?.relatedFieldValues || {}
  const valueKeys = Object.keys(fieldValues)
  const fields =
    configuredFieldKeys.value.length > 0 ? configuredFieldKeys.value : valueKeys
  if (fields.length === 0) {
    return []
  }
  return fields.map((field) => ({
    field,
    label: relatedFieldOptionMap.value.get(field) || '未命名字段',
    value: fieldValues[field]
  }))
})

const normalizeModelValue = (value: RelatedFormValue | null | undefined): RelatedFormValue | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  if (!value.processInstanceId) {
    return null
  }
  return {
    ...value,
    relatedFieldValues: value.relatedFieldValues || {}
  }
}

const syncRelatedFieldValues = (fieldValues: Record<string, any>) => {
  if (!fieldValues || Object.keys(fieldValues).length === 0) {
    return
  }
  const possibleApis = [
    props.formCreateInject?.api,
    props.formCreateInject?.fapi,
    props.formCreateInject
  ]
  const formApi = possibleApis.find((item) => item && typeof item.setValue === 'function')
  if (!formApi) {
    return
  }
  Object.keys(fieldValues).forEach((field) => {
    try {
      formApi.setValue(field, fieldValues[field])
    } catch {
      try {
        formApi.setValue({ [field]: fieldValues[field] })
      } catch {
        // ignore
      }
    }
  })
}

const loadProcessInstances = async () => {
  const processDefinitionKey = getQueryString(props.relatedDefinitionKey)
  const processDefinitionId = getQueryString(props.relatedDefinitionId)
  if (!processDefinitionKey && !processDefinitionId) {
    processInstanceList.value = []
    queryParams.total = 0
    return
  }
  loading.value = true
  try {
    const pageSize = normalizePageSize(queryParams.pageSize)
    if (pageSize !== queryParams.pageSize) {
      queryParams.pageSize = pageSize
    }
    const data = await ProcessInstanceApi.getProcessInstanceManagerPage({
      pageNo: queryParams.pageNo,
      pageSize,
      name: queryParams.name || undefined,
      processDefinitionKey: processDefinitionKey || undefined,
      processDefinitionId: processDefinitionId || undefined
    })
    processInstanceList.value = data?.list || []
    queryParams.total = Number(data?.total || 0)
  } catch {
    processInstanceList.value = []
    queryParams.total = 0
    message.error('加载审批单失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  queryParams.pageNo = 1
  await loadProcessInstances()
}

const handlePageSizeChange = async () => {
  queryParams.pageSize = normalizePageSize(queryParams.pageSize)
  queryParams.pageNo = 1
  await loadProcessInstances()
}

const handleOpenDialog = async () => {
  if (props.disabled) {
    return
  }
  const processDefinitionKey = getQueryString(props.relatedDefinitionKey)
  const processDefinitionId = getQueryString(props.relatedDefinitionId)
  if (!processDefinitionKey && !processDefinitionId) {
    message.warning('未配置关联表单流程定义')
    return
  }
  dialogVisible.value = true
  dialogSelectedInstance.value = undefined
  dialogSelectedInstanceId.value = selectedValue.value?.processInstanceId
    ? String(selectedValue.value.processInstanceId)
    : ''
  await loadProcessInstances()
}

const handleSelectRow = (row: any) => {
  dialogSelectedInstance.value = row
  dialogSelectedInstanceId.value = String(row.id)
}

const handleConfirmDialog = async () => {
  const selected =
    dialogSelectedInstance.value ||
    processInstanceList.value.find((item) => String(item.id) === dialogSelectedInstanceId.value)
  if (!selected) {
    message.warning('请选择审批单')
    return
  }

  let formVariables: Record<string, any> = {}
  try {
    const detail = await ProcessInstanceApi.getProcessInstance(String(selected.id))
    formVariables = detail?.formVariables || {}
  } catch {
    // ignore, fallback empty variables
  }

  const relatedFieldValues: Record<string, any> = {}
  relatedFieldKeys.value.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(formVariables, field)) {
      relatedFieldValues[field] = formVariables[field]
    }
  })

  const nextValue: RelatedFormValue = {
    processInstanceId: selected.id,
    processInstanceName: selected.name,
    processDefinitionId:
      selected.processDefinition?.id || selected.processDefinitionId || getQueryString(props.relatedDefinitionId),
    processDefinitionKey:
      selected.processDefinition?.key || selected.processDefinitionKey || getQueryString(props.relatedDefinitionKey),
    processDefinitionName:
      selected.processDefinition?.name || selected.processDefinitionName || props.relatedDefinitionName,
    relatedFieldValues
  }

  selectedValue.value = nextValue
  emit('update:modelValue', nextValue)
  syncRelatedFieldValues(relatedFieldValues)
  dialogVisible.value = false
}

const handleClear = () => {
  if (props.disabled) {
    return
  }
  selectedValue.value = null
  emit('update:modelValue', null)
}

const handleCreateNew = async () => {
  const processDefinitionId = getQueryString(props.relatedDefinitionId)
  const processDefinitionKey = getQueryString(props.relatedDefinitionKey)

  if (processDefinitionId || processDefinitionKey) {
    await router.push({
      name: 'BpmProcessInstanceDirectCreate',
      query: {
        processDefinitionId: processDefinitionId || undefined,
        processDefinitionKey: processDefinitionKey || undefined
      }
    })
    return
  }

  await router.push({
    name: 'BpmProcessInstanceCreate'
  })
}

const formatFieldValue = (value: any) => {
  if (value === undefined || value === null || value === '') {
    return '--'
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

const getStatusLabel = (status: number | undefined) => {
  switch (status) {
    case BpmProcessInstanceStatus.RUNNING:
      return '审批中'
    case BpmProcessInstanceStatus.APPROVE:
      return '已通过'
    case BpmProcessInstanceStatus.REJECT:
      return '已驳回'
    case BpmProcessInstanceStatus.CANCEL:
      return '已取消'
    default:
      return '未知'
  }
}

const getStarterName = (row: any) => {
  return row?.startUser?.nickname || row?.startUserNickname || '--'
}

const getCurrentTaskDisplay = (row: any) => {
  if (row?.status !== BpmProcessInstanceStatus.RUNNING) {
    return '--'
  }
  const tasks = Array.isArray(row?.tasks) ? row.tasks : []
  if (tasks.length === 0) {
    return '--'
  }
  const firstTask = tasks[0] || {}
  const assigneeName =
    firstTask?.assigneeUser?.nickname || firstTask?.assigneeNickname || firstTask?.ownerUser?.nickname || ''
  const nodeName = firstTask?.name || ''
  if (tasks.length === 1) {
    if (assigneeName && nodeName) {
      return `${assigneeName}(${nodeName})`
    }
    return assigneeName || nodeName || '--'
  }
  if (assigneeName && nodeName) {
    return `${assigneeName}等${tasks.length}人(${nodeName})`
  }
  if (assigneeName) {
    return `${assigneeName}等${tasks.length}人`
  }
  return nodeName || '--'
}

const normalizeSummaryValue = (value: any) => {
  if (value === undefined || value === null || value === '') {
    return '--'
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

const getSummaryText = (summary: any) => {
  if (!summary) {
    return '--'
  }

  const pairList: string[] = []

  if (Array.isArray(summary)) {
    summary.forEach((item) => {
      const key = item?.key || item?.label || item?.fieldName || ''
      const value = normalizeSummaryValue(item?.value)
      if (key) {
        pairList.push(`${key}: ${value}`)
      } else if (value !== '--') {
        pairList.push(value)
      }
    })
  } else if (typeof summary === 'object') {
    Object.keys(summary).forEach((key) => {
      pairList.push(`${key}: ${normalizeSummaryValue(summary[key])}`)
    })
  }

  if (pairList.length === 0) {
    return '--'
  }

  const maxCount = 6
  if (pairList.length <= maxCount) {
    return pairList.join('；')
  }
  return `${pairList.slice(0, maxCount).join('；')}...`
}

watch(
  () => props.modelValue,
  (value) => {
    selectedValue.value = normalizeModelValue(value)
  },
  {
    immediate: true,
    deep: true
  }
)

watch(
  () => props.relatedDefinitionKey,
  async () => {
    if (dialogVisible.value) {
      queryParams.pageNo = 1
      await loadProcessInstances()
    }
  }
)
</script>

<style lang="scss" scoped>
.related-form-select {
  :deep(.el-descriptions__label) {
    width: 180px;
  }

  .instance-cell {
    line-height: 1.5;
    padding: 2px 0;
  }

  .instance-name {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .instance-line {
    margin-top: 2px;
    color: var(--el-text-color-regular);
    word-break: break-all;
  }
}
</style>
