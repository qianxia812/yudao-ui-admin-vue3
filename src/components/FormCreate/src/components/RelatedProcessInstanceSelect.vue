<template>
  <div class="related-process-instance-select w-1/1">
    <div class="flex items-center gap-8px">
      <el-input
        :model-value="displayText"
        :placeholder="placeholder || '请选择关联审批单'"
        readonly
        :disabled="disabled"
        @click="handleOpenDialog"
      />
      <el-button v-if="!disabled" @click="handleOpenDialog">选择</el-button>
    </div>

    <div v-if="selectedItems.length > 0" class="mt-8px flex flex-wrap gap-8px">
      <el-tag
        v-for="item in selectedItems"
        :key="String(item.id)"
        :closable="!disabled"
        class="cursor-pointer"
        @close.stop="handleRemove(item.id)"
        @click="handleOpenDetail(item)"
      >
        {{ item.name }}
      </el-tag>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="选择关联审批单"
      width="1080px"
      append-to-body
      destroy-on-close
    >
      <el-row :gutter="16" class="h-560px">
        <el-col :span="9" class="h-full">
          <div class="panel-box h-full">
            <div class="mb-8px text-14px font-600 flex items-center justify-between">
              <span>审批类型</span>
              <el-text type="info" size="small">不选择默认全部</el-text>
            </div>

            <el-checkbox
              :model-value="allDefinitionsChecked"
              :indeterminate="allDefinitionsIndeterminate"
              @change="(value) => handleAllDefinitionsChange(!!value)"
            >
              全部类型
            </el-checkbox>

            <el-collapse v-model="activeCategoryCodes" class="mt-10px">
              <el-collapse-item
                v-for="group in definitionGroupList"
                :key="group.categoryCode"
                :name="group.categoryCode"
              >
                <template #title>
                  <div class="flex items-center w-full">
                    <el-checkbox
                      :model-value="isCategoryChecked(group)"
                      :indeterminate="isCategoryIndeterminate(group)"
                      @change="(value) => handleCategoryChange(group, !!value)"
                      @click.stop
                    />
                    <span class="ml-6px">{{ group.categoryName }}</span>
                  </div>
                </template>

                <div class="flex flex-col gap-8px pl-10px pb-6px">
                  <el-checkbox
                    v-for="definition in group.definitions"
                    :key="definition.key"
                    :model-value="dialogSelectedDefinitionKeys.includes(definition.key)"
                    @change="
                      (value) => handleDefinitionChange(definition.key, !!value)
                    "
                  >
                    {{ definition.name }}
                  </el-checkbox>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-col>

        <el-col :span="15" class="h-full">
          <div class="panel-box h-full flex flex-col">
            <div class="mb-10px flex items-center gap-8px">
              <el-input
                v-model="instanceQuery.name"
                placeholder="请输入审批单名称"
                clearable
                @keyup.enter="loadProcessInstances"
                @clear="loadProcessInstances"
              />
              <el-button @click="loadProcessInstances">搜索</el-button>
            </div>

            <el-table
              v-loading="loadingProcessInstances || loadingDefinitions"
              :data="pagedProcessInstanceList"
              height="430"
              @row-click="handleSelectInstanceRow"
            >
              <el-table-column label="" align="center" width="56">
                <template #default="{ row }">
                  <el-radio
                    v-model="dialogSelectedInstanceId"
                    :value="String(row.id)"
                    @change="() => handleSelectInstance(row)"
                  >
                    <span></span>
                  </el-radio>
                </template>
              </el-table-column>
              <el-table-column label="审批单名称" prop="name" min-width="200" />
              <el-table-column label="流程类型" min-width="180">
                <template #default="{ row }">
                  {{ row.processDefinition?.name || row.processDefinitionName || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="状态" align="center" width="120">
                <template #default="{ row }">
                  {{ getStatusLabel(row.status) }}
                </template>
              </el-table-column>
            </el-table>

            <div class="mt-10px flex justify-end">
              <el-pagination
                v-model:current-page="instancePagination.pageNo"
                v-model:page-size="instancePagination.pageSize"
                background
                small
                layout="prev, pager, next, total"
                :total="filteredProcessInstanceList.length"
              />
            </div>
          </div>
        </el-col>
      </el-row>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleConfirmDialog">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { CategoryApi, type CategoryVO } from '@/api/bpm/category'
import * as DefinitionApi from '@/api/bpm/definition'
import * as ProcessInstanceApi from '@/api/bpm/processInstance'
import { BpmProcessInstanceStatus } from '@/utils/constants'
import { groupBy, uniqBy } from 'lodash-es'

defineOptions({ name: 'RelatedProcessInstanceSelect' })

interface RelatedProcessInstanceItem {
  id: number | string
  name: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processDefinitionName?: string
  category?: string
  status?: number
}

interface ProcessDefinitionItem {
  id: string
  key: string
  name: string
  category: string
}

interface ProcessDefinitionGroup {
  categoryCode: string
  categoryName: string
  definitions: ProcessDefinitionItem[]
}

interface Props {
  modelValue?:
    | RelatedProcessInstanceItem
    | RelatedProcessInstanceItem[]
    | string
    | string[]
    | number
    | number[]
    | null
  multiple?: boolean
  disabled?: boolean
  placeholder?: string
  processDefinitionKeys?: string | string[]
  formCreateInject?: any
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  multiple: true,
  disabled: false,
  placeholder: '',
  processDefinitionKeys: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: RelatedProcessInstanceItem[] | RelatedProcessInstanceItem | null): void
}>()

const message = useMessage()
const route = useRoute()
const router = useRouter()

const dialogVisible = ref(false)
const loadingDefinitions = ref(false)
const loadingProcessInstances = ref(false)

const selectedItems = ref<RelatedProcessInstanceItem[]>([])
const categoryList = ref<CategoryVO[]>([])
const processDefinitionList = ref<ProcessDefinitionItem[]>([])
const activeCategoryCodes = ref<string[]>([])
const dialogSelectedDefinitionKeys = ref<string[]>([])

const processInstanceList = ref<any[]>([])
const dialogSelectedInstanceId = ref<string>('')
const dialogSelectedInstance = ref<any>()

const instanceQuery = reactive({
  name: ''
})
const instancePagination = reactive({
  pageNo: 1,
  pageSize: 10
})
const PROCESS_INSTANCE_API_MAX_PAGE_SIZE = 200

const getQueryString = (value: unknown) => {
  const tempValue = Array.isArray(value) ? value[0] : value
  if (tempValue === undefined || tempValue === null) {
    return ''
  }
  return String(tempValue).trim()
}

const parseDefinitionKeys = (value: string | string[]) => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean)
  }
  if (!value) {
    return []
  }
  return value
    .split(/[,\uff0c]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const presetDefinitionKeys = computed(() => parseDefinitionKeys(props.processDefinitionKeys))

const availableProcessDefinitionList = computed(() => {
  if (presetDefinitionKeys.value.length === 0) {
    return processDefinitionList.value
  }
  const keySet = new Set(presetDefinitionKeys.value)
  return processDefinitionList.value.filter((item) => keySet.has(item.key))
})

const availableDefinitionKeys = computed(() =>
  availableProcessDefinitionList.value.map((item) => item.key)
)

const defaultFilterDefinitionKeys = computed(() =>
  presetDefinitionKeys.value.filter((key) => availableDefinitionKeys.value.includes(key))
)

const effectiveFilterDefinitionKeys = computed(() => {
  if (dialogSelectedDefinitionKeys.value.length > 0) {
    return dialogSelectedDefinitionKeys.value
  }
  return defaultFilterDefinitionKeys.value
})

const definitionGroupList = computed<ProcessDefinitionGroup[]>(() => {
  const grouped = groupBy(availableProcessDefinitionList.value, 'category')
  const list: ProcessDefinitionGroup[] = []

  categoryList.value.forEach((category) => {
    const definitions = grouped[category.code] || []
    if (definitions.length === 0) {
      return
    }
    list.push({
      categoryCode: category.code,
      categoryName: category.name,
      definitions
    })
  })
  return list
})

const filteredProcessInstanceList = computed(() => {
  if (effectiveFilterDefinitionKeys.value.length === 0) {
    return processInstanceList.value
  }
  const keySet = new Set(effectiveFilterDefinitionKeys.value)
  return processInstanceList.value.filter((item) =>
    keySet.has(item.processDefinition?.key || item.processDefinitionKey)
  )
})

const pagedProcessInstanceList = computed(() => {
  const start = (instancePagination.pageNo - 1) * instancePagination.pageSize
  const end = start + instancePagination.pageSize
  return filteredProcessInstanceList.value.slice(start, end)
})

const displayText = computed(() => {
  if (selectedItems.value.length === 0) {
    return ''
  }
  if (props.multiple) {
    return `已关联 ${selectedItems.value.length} 条审批单`
  }
  return selectedItems.value[0]?.name || ''
})

const allDefinitionsChecked = computed(() => {
  if (availableDefinitionKeys.value.length === 0) {
    return false
  }
  return availableDefinitionKeys.value.every((key) => dialogSelectedDefinitionKeys.value.includes(key))
})

const allDefinitionsIndeterminate = computed(() => {
  if (dialogSelectedDefinitionKeys.value.length === 0) {
    return false
  }
  return !allDefinitionsChecked.value
})

const getCategoryDefinitionKeys = (group: ProcessDefinitionGroup) =>
  group.definitions.map((item) => item.key)

const isCategoryChecked = (group: ProcessDefinitionGroup) => {
  const keys = getCategoryDefinitionKeys(group)
  if (keys.length === 0) {
    return false
  }
  return keys.every((key) => dialogSelectedDefinitionKeys.value.includes(key))
}

const isCategoryIndeterminate = (group: ProcessDefinitionGroup) => {
  const keys = getCategoryDefinitionKeys(group)
  if (keys.length === 0) {
    return false
  }
  const checkedCount = keys.filter((key) => dialogSelectedDefinitionKeys.value.includes(key)).length
  return checkedCount > 0 && checkedCount < keys.length
}

const normalizeItem = (value: any): RelatedProcessInstanceItem | null => {
  if (value === undefined || value === null || value === '') {
    return null
  }
  if (typeof value !== 'object') {
    return {
      id: value,
      name: `审批单 #${value}`
    }
  }
  const id = value.id ?? value.processInstanceId ?? value.value
  if (id === undefined || id === null || id === '') {
    return null
  }
  return {
    id,
    name: value.name || value.processInstanceName || `审批单 #${id}`,
    processDefinitionId: value.processDefinitionId,
    processDefinitionKey: value.processDefinitionKey || value.processDefinition?.key,
    processDefinitionName: value.processDefinitionName || value.processDefinition?.name,
    category: value.category,
    status: value.status
  }
}

const normalizeModelValue = (value: Props['modelValue']): RelatedProcessInstanceItem[] => {
  if (value === undefined || value === null || value === '') {
    return []
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeItem(item))
      .filter((item): item is RelatedProcessInstanceItem => !!item)
  }
  const item = normalizeItem(value)
  return item ? [item] : []
}

const emitModelValue = () => {
  selectedItems.value = uniqBy(selectedItems.value, (item) => String(item.id))
  if (props.multiple) {
    emit('update:modelValue', selectedItems.value)
  } else {
    emit('update:modelValue', selectedItems.value[0] || null)
  }
}

const buildRelatedItemFromInstance = (instance: any): RelatedProcessInstanceItem => {
  return {
    id: instance.id,
    name: instance.name || `审批单 #${instance.id}`,
    processDefinitionId: instance.processDefinitionId,
    processDefinitionKey: instance.processDefinition?.key || instance.processDefinitionKey,
    processDefinitionName: instance.processDefinition?.name || instance.processDefinitionName,
    category: instance.category,
    status: instance.status
  }
}

const loadProcessDefinitions = async () => {
  loadingDefinitions.value = true
  try {
    const [categoryData, definitionData] = await Promise.all([
      CategoryApi.getCategorySimpleList(),
      DefinitionApi.getProcessDefinitionList({
        suspensionState: 1
      })
    ])
    categoryList.value = categoryData || []
    processDefinitionList.value = (definitionData || []).filter((item: any) => item?.key)
  } catch {
    categoryList.value = []
    processDefinitionList.value = []
    message.error('加载审批类型失败，请稍后重试')
  } finally {
    loadingDefinitions.value = false
  }
}

const loadProcessInstances = async () => {
  loadingProcessInstances.value = true
  try {
    const requestName = instanceQuery.name || undefined
    let pageNo = 1
    const allList: any[] = []
    let total = 0

    while (true) {
      const data = await ProcessInstanceApi.getProcessInstanceMyPage({
        pageNo,
        pageSize: PROCESS_INSTANCE_API_MAX_PAGE_SIZE,
        name: requestName
      })
      const list = data?.list || []
      total = Number(data?.total || 0)
      if (list.length > 0) {
        allList.push(...list)
      }

      // 有 total 时按 total 结束；否则按“本页不足 200 条”结束
      if (total > 0) {
        if (allList.length >= total) {
          break
        }
      } else if (list.length < PROCESS_INSTANCE_API_MAX_PAGE_SIZE) {
        break
      }

      pageNo += 1
      // 兜底，避免异常场景死循环
      if (pageNo > 100) {
        break
      }
    }

    processInstanceList.value = allList
    instancePagination.pageNo = 1
  } catch {
    processInstanceList.value = []
    message.error('加载审批单失败，请稍后重试')
  } finally {
    loadingProcessInstances.value = false
  }
}

const resetDialogState = () => {
  dialogSelectedDefinitionKeys.value = [...defaultFilterDefinitionKeys.value]
  activeCategoryCodes.value = []
  if (!props.multiple && selectedItems.value.length > 0) {
    dialogSelectedInstanceId.value = String(selectedItems.value[0].id)
    dialogSelectedInstance.value = selectedItems.value[0]
  } else {
    dialogSelectedInstanceId.value = ''
    dialogSelectedInstance.value = undefined
  }
}

const handleOpenDialog = async () => {
  if (props.disabled) {
    return
  }
  dialogVisible.value = true
  await loadProcessDefinitions()
  await loadProcessInstances()
  resetDialogState()
}

const handleAllDefinitionsChange = (checked: boolean) => {
  dialogSelectedDefinitionKeys.value = checked ? [...availableDefinitionKeys.value] : []
}

const handleCategoryChange = (group: ProcessDefinitionGroup, checked: boolean) => {
  const keySet = new Set(dialogSelectedDefinitionKeys.value)
  const categoryKeys = getCategoryDefinitionKeys(group)
  categoryKeys.forEach((key) => {
    if (checked) {
      keySet.add(key)
    } else {
      keySet.delete(key)
    }
  })
  dialogSelectedDefinitionKeys.value = [...keySet]
}

const handleDefinitionChange = (definitionKey: string, checked: boolean) => {
  const keySet = new Set(dialogSelectedDefinitionKeys.value)
  if (checked) {
    keySet.add(definitionKey)
  } else {
    keySet.delete(definitionKey)
  }
  dialogSelectedDefinitionKeys.value = [...keySet]
}

const handleSelectInstance = (instance: any) => {
  dialogSelectedInstanceId.value = String(instance.id)
  dialogSelectedInstance.value = instance
}

const handleSelectInstanceRow = (instance: any) => {
  handleSelectInstance(instance)
}

const handleConfirmDialog = () => {
  const selectedInstance =
    dialogSelectedInstance.value ||
    filteredProcessInstanceList.value.find(
      (item) => String(item.id) === String(dialogSelectedInstanceId.value)
    )
  if (!selectedInstance) {
    message.warning('请选择审批单')
    return
  }

  const relatedItem = buildRelatedItemFromInstance(selectedInstance)
  if (props.multiple) {
    const existedIndex = selectedItems.value.findIndex(
      (item) => String(item.id) === String(relatedItem.id)
    )
    if (existedIndex >= 0) {
      selectedItems.value[existedIndex] = relatedItem
    } else {
      selectedItems.value.push(relatedItem)
    }
  } else {
    selectedItems.value = [relatedItem]
  }
  emitModelValue()
  dialogVisible.value = false
}

const handleRemove = (id: string | number) => {
  if (props.disabled) {
    return
  }
  selectedItems.value = selectedItems.value.filter((item) => String(item.id) !== String(id))
  emitModelValue()
}

const handleOpenDetail = async (item: RelatedProcessInstanceItem) => {
  if (!item?.id) {
    return
  }

  const currentProcessInstanceId = getQueryString(route.query.id)
  const returnTaskId = getQueryString(route.query.taskId)
  const returnActivityId = getQueryString(route.query.activityId)
  const returnProjectId = getQueryString(route.query.projectId)
  const currentRouteName = route.name ? String(route.name) : ''

  const targetRouteName =
    currentRouteName === 'ProjectProcessInstanceDetail'
      ? 'ProjectProcessInstanceDetail'
      : 'BpmProcessInstanceDetail'

  const query: Record<string, string> = {
    id: String(item.id)
  }
  if (targetRouteName === 'ProjectProcessInstanceDetail' && returnProjectId) {
    query.projectId = returnProjectId
  }
  if (currentProcessInstanceId && String(item.id) !== currentProcessInstanceId) {
    query.returnProcessInstanceId = currentProcessInstanceId
    if (returnTaskId) {
      query.returnTaskId = returnTaskId
    }
    if (returnActivityId) {
      query.returnActivityId = returnActivityId
    }
    if (currentRouteName) {
      query.returnRouteName = currentRouteName
    }
    if (returnProjectId) {
      query.returnProjectId = returnProjectId
    }
  }

  await router.push({
    name: targetRouteName,
    query
  })
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

watch(
  () => props.modelValue,
  (value) => {
    selectedItems.value = normalizeModelValue(value)
  },
  {
    deep: true,
    immediate: true
  }
)

watch(
  () => [filteredProcessInstanceList.value.length, instancePagination.pageSize],
  () => {
    const totalPage = Math.max(
      1,
      Math.ceil(filteredProcessInstanceList.value.length / instancePagination.pageSize)
    )
    if (instancePagination.pageNo > totalPage) {
      instancePagination.pageNo = totalPage
    }
    if (
      dialogSelectedInstanceId.value &&
      !filteredProcessInstanceList.value.some(
        (item) => String(item.id) === String(dialogSelectedInstanceId.value)
      )
    ) {
      dialogSelectedInstanceId.value = ''
      dialogSelectedInstance.value = undefined
    }
  }
)
</script>

<style lang="scss" scoped>
.panel-box {
  padding: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: auto;
}
</style>
