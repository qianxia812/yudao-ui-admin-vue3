<template>
  <div class="related-project-select w-1/1">
    <div class="flex items-center gap-8px">
      <el-input
        :model-value="displayText"
        :placeholder="placeholder || '请选择关联项目'"
        readonly
        :disabled="disabled"
        @click="handleOpenDialog"
      />
      <el-button v-if="!disabled" @click="handleOpenDialog">选择</el-button>
    </div>

    <div v-if="selectedProject?.id" class="mt-8px flex items-center gap-8px">
      <el-tag :closable="!disabled" class="cursor-pointer" @close="handleClear" @click="handleOpenProjectDetail">
        {{ selectedProject.projectName || '项目' }}
      </el-tag>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="选择关联项目"
      width="980px"
      append-to-body
      destroy-on-close
    >
      <div class="mb-10px flex items-center gap-8px">
        <el-input
          v-model="queryParams.projectCode"
          placeholder="请输入项目编号"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-input
          v-model="queryParams.projectName"
          placeholder="请输入项目名称"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-button @click="handleSearch">搜索</el-button>
      </div>

      <el-table v-loading="loading" :data="projectList" max-height="430" @row-click="handleSelectRow">
        <el-table-column label="" width="56" align="center">
          <template #default="{ row }">
            <el-radio
              v-model="dialogSelectedProjectId"
              :value="String(row.projectId || row.id)"
              @change="() => handleSelectRow(row)"
            >
              <span></span>
            </el-radio>
          </template>
        </el-table-column>
        <el-table-column label="项目编号" prop="projectCode" min-width="120" />
        <el-table-column label="项目名称" prop="projectName" min-width="180" />
        <el-table-column label="项目状态" min-width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="getProjectStatusType(row.projectStatus)" effect="plain">
              {{ getProjectStatusLabel(row.projectStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前流程" prop="stageName" min-width="140" />
        <el-table-column label="发起人" min-width="110" align="center">
          <template #default="{ row }">
            {{ row.latestStarterUserName || '--' }}
          </template>
        </el-table-column>
        <el-table-column label="发起时间" min-width="170" align="center">
          <template #default="{ row }">
            {{ formatDate(row.latestStartTime) || '--' }}
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-10px flex justify-end">
        <el-pagination
          v-model:current-page="queryParams.pageNo"
          v-model:page-size="queryParams.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next, total"
          :total="queryParams.total"
          @current-change="loadProjectList"
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
import { StageApi, type StageVO } from '@/api/project/projectstage'
import { PROJECT_STATUS_OPTIONS } from '@/utils/constants'
import { formatDate } from '@/utils/formatTime'
import type { TagProps } from 'element-plus'

defineOptions({ name: 'RelatedProjectSelect' })

interface RelatedProjectValue {
  id?: string | number
  projectId?: string | number
  projectCode?: string
  projectName?: string
  projectStatus?: number | string
  stageName?: string
  latestStartTime?: string
  latestEndTime?: string
}

interface Props {
  modelValue?: RelatedProjectValue | null
  disabled?: boolean
  placeholder?: string
}

type StatusItem = {
  value: number
  label: string
  type: TagProps['type']
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  disabled: false,
  placeholder: ''
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: RelatedProjectValue | null): void
}>()

const message = useMessage()
const router = useRouter()
const projectStatusOptions: StatusItem[] = [...PROJECT_STATUS_OPTIONS]

const dialogVisible = ref(false)
const loading = ref(false)
const projectList = ref<StageVO[]>([])
const dialogSelectedProjectId = ref('')
const dialogSelectedProject = ref<StageVO>()
const selectedProject = ref<RelatedProjectValue | null>(null)

const queryParams = reactive({
  pageNo: 1,
  pageSize: 20,
  total: 0,
  projectCode: '',
  projectName: '',
  projectStatus: undefined as number | undefined,
  stageName: undefined as string | undefined,
  stageStatus: undefined as number | undefined,
  relationType: undefined as string | undefined,
  latestStartTime: [] as string[],
  latestEndTime: [] as string[]
})

const normalizeModelValue = (value: RelatedProjectValue | null | undefined): RelatedProjectValue | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const id = value.projectId ?? value.id
  if (id === undefined || id === null || id === '') {
    return null
  }
  return {
    ...value,
    id
  }
}

const normalizeStatus = (value?: number | string | null) => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  const normalized = Number(value)
  return Number.isNaN(normalized) ? undefined : normalized
}

const getProjectStatusLabel = (value?: number | string | null) => {
  const normalized = normalizeStatus(value)
  return projectStatusOptions.find((item) => item.value === normalized)?.label || '--'
}

const getProjectStatusType = (value?: number | string | null): TagProps['type'] => {
  const normalized = normalizeStatus(value)
  return projectStatusOptions.find((item) => item.value === normalized)?.type || 'info'
}

const displayText = computed(() => {
  if (!selectedProject.value?.id) {
    return ''
  }
  return selectedProject.value.projectName || '项目'
})

const loadProjectList = async () => {
  loading.value = true
  try {
    const data = await StageApi.getStagePage({
      ...queryParams,
      projectCode: queryParams.projectCode || undefined,
      projectName: queryParams.projectName || undefined
    })
    projectList.value = data?.list || []
    queryParams.total = Number(data?.total || 0)
  } catch {
    projectList.value = []
    queryParams.total = 0
    message.error('加载项目列表失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  queryParams.pageNo = 1
  await loadProjectList()
}

const handlePageSizeChange = async () => {
  queryParams.pageNo = 1
  await loadProjectList()
}

const handleOpenDialog = async () => {
  if (props.disabled) {
    return
  }
  dialogVisible.value = true
  dialogSelectedProject.value = undefined
  dialogSelectedProjectId.value = selectedProject.value?.id ? String(selectedProject.value.id) : ''
  await loadProjectList()
}

const handleSelectRow = (row: StageVO) => {
  dialogSelectedProject.value = row
  dialogSelectedProjectId.value = String(row.projectId || row.id || '')
}

const handleConfirmDialog = () => {
  const selected =
    dialogSelectedProject.value ||
    projectList.value.find(
      (item) => String(item.projectId || item.id) === String(dialogSelectedProjectId.value)
    )
  if (!selected) {
    message.warning('请选择项目')
    return
  }

  const id = selected.projectId || selected.id
  const nextValue: RelatedProjectValue = {
    id,
    projectId: id,
    projectCode: selected.projectCode,
    projectName: selected.projectName,
    projectStatus: selected.projectStatus,
    stageName: selected.stageName,
    latestStartTime: selected.latestStartTime || undefined,
    latestEndTime: selected.latestEndTime || undefined
  }

  selectedProject.value = nextValue
  emit('update:modelValue', nextValue)
  dialogVisible.value = false
}

const handleClear = () => {
  if (props.disabled) {
    return
  }
  selectedProject.value = null
  emit('update:modelValue', null)
}

const handleOpenProjectDetail = async () => {
  const projectId = Number(selectedProject.value?.projectId || selectedProject.value?.id)
  if (!projectId) {
    return
  }
  try {
    await StageApi.getProjectDetail(projectId)
    await router.push({
      name: 'ProjectStageDetail',
      params: { id: projectId }
    })
  } catch {
    message.error('打开项目详情失败，请稍后重试')
  }
}

watch(
  () => props.modelValue,
  (value) => {
    selectedProject.value = normalizeModelValue(value)
  },
  {
    immediate: true,
    deep: true
  }
)
</script>
