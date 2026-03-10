<template>
  <ContentWrap>
    <el-form
      ref="queryFormRef"
      :model="queryParams"
      :inline="true"
      label-width="68px"
      class="-mb-15px"
    >
      <el-form-item label="项目编号" prop="projectCode">
        <el-input
          v-model="queryParams.projectCode"
          placeholder="请输入项目编号"
          clearable
          class="!w-240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="项目名称" prop="projectName">
        <el-input
          v-model="queryParams.projectName"
          placeholder="请输入项目名称"
          clearable
          class="!w-240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="项目状态" prop="projectStatus">
        <el-select
          v-model="queryParams.projectStatus"
          placeholder="请选择项目状态"
          clearable
          class="!w-240px"
        >
          <el-option
            v-for="item in projectStatusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="当前流程" prop="stageName">
        <el-input
          v-model="queryParams.stageName"
          placeholder="请输入当前流程"
          clearable
          class="!w-240px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="流程状态" prop="stageStatus">
        <el-select
          v-model="queryParams.stageStatus"
          placeholder="请选择流程状态"
          clearable
          class="!w-240px"
        >
          <el-option
            v-for="item in stageStatusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="与我相关" prop="relationType">
        <el-select
          v-model="queryParams.relationType"
          placeholder="请选择与我相关"
          clearable
          class="!w-240px"
        >
          <el-option
            v-for="item in relationTypeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="发起时间" prop="latestStartTime">
        <el-date-picker
          v-model="queryParams.latestStartTime"
          value-format="YYYY-MM-DD HH:mm:ss"
          type="daterange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          :default-time="[new Date('1 00:00:00'), new Date('1 23:59:59')]"
          class="!w-220px"
        />
      </el-form-item>
      <el-form-item label="结束时间" prop="latestEndTime">
        <el-date-picker
          v-model="queryParams.latestEndTime"
          value-format="YYYY-MM-DD HH:mm:ss"
          type="daterange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          :default-time="[new Date('1 00:00:00'), new Date('1 23:59:59')]"
          class="!w-220px"
        />
      </el-form-item>
      <el-form-item>
        <el-button @click="handleQuery">
          <Icon icon="ep:search" class="mr-5px" />
          搜索
        </el-button>
        <el-button @click="resetQuery">
          <Icon icon="ep:refresh" class="mr-5px" />
          重置
        </el-button>
        <el-button type="primary" plain @click="openForm('create')">
          <Icon icon="ep:plus" class="mr-5px" />
          新增
        </el-button>
      </el-form-item>
    </el-form>
  </ContentWrap>

  <ContentWrap>
    <el-table v-loading="loading" :data="list" :stripe="true" :show-overflow-tooltip="true">
      <el-table-column label="项目编号" align="center" prop="projectCode" min-width="110px" />
      <el-table-column label="项目名称" align="center" prop="projectName" min-width="160px" />
      <el-table-column label="项目状态" align="center" min-width="95px">
        <template #default="{ row }">
          <el-tag :type="getProjectStatusType(row.projectStatus)" effect="plain">
            {{ getProjectStatusLabel(row.projectStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前流程" align="center" prop="stageName" min-width="130px" />
      <el-table-column label="发起人" align="center" min-width="100px">
        <template #default="{ row }">
          {{ row.latestStarterUserName || row.latestStarterUserId || '--' }}
        </template>
      </el-table-column>
      <el-table-column label="流程状态" align="center" min-width="105px">
        <template #default="{ row }">
          <el-tag :type="getStageStatusType(row.stageStatus)" effect="plain">
            {{ getStageStatusLabel(row.stageStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前审批人" align="center" min-width="115px">
        <template #default="{ row }">
          {{ row.latestApproverUserName || '--' }}
        </template>
      </el-table-column>
      <el-table-column label="与我相关" align="center" min-width="110px">
        <template #default="{ row }">
          {{ row.relationTypeLabel || formatRelationType(row.relationType) }}
        </template>
      </el-table-column>
      <el-table-column
        label="发起时间"
        align="center"
        prop="latestStartTime"
        :formatter="dateFormatter"
        width="170px"
      />
      <el-table-column
        label="结束时间"
        align="center"
        prop="latestEndTime"
        :formatter="dateFormatter"
        width="170px"
      />
      <el-table-column label="操作" align="center" fixed="right" min-width="180px">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" @click="openReasonDialog('cancel', row)">取消</el-button>
          <el-button link type="primary" @click="openReasonDialog('archive', row)">归档</el-button>
        </template>
      </el-table-column>
    </el-table>
    <Pagination
      :total="total"
      v-model:page="queryParams.pageNo"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </ContentWrap>

  <Dialog :title="reasonDialog.title" v-model="reasonDialog.visible" width="520px">
    <el-form ref="reasonFormRef" :model="reasonDialog" :rules="reasonRules" label-width="85px">
      <el-form-item :label="reasonDialog.label" prop="reason">
        <el-input
          v-model="reasonDialog.reason"
          type="textarea"
          :rows="4"
          :placeholder="`请输入${reasonDialog.label}`"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :loading="reasonDialog.loading" @click="submitReason">确 定</el-button>
      <el-button @click="reasonDialog.visible = false">取 消</el-button>
    </template>
  </Dialog>

  <StageForm ref="formRef" @success="getList" />
</template>

<script setup lang="ts">
import { dateFormatter } from '@/utils/formatTime'
import { StageApi, type StagePageReqVO, type StageVO } from '@/api/project/projectstage'
import StageForm from './StageForm.vue'
import type { FormInstance, FormRules, TagProps } from 'element-plus'

defineOptions({ name: 'ProjectStage' })

type StatusItem = {
  value: number
  label: string
  type: TagProps['type']
}

const projectStatusOptions: StatusItem[] = [
  { value: 0, label: '未开始', type: 'warning' },
  { value: 1, label: '进行中', type: 'primary' },
  { value: 2, label: '已完成', type: 'success' },
  { value: 3, label: '已终止', type: 'danger' },
  { value: 4, label: '已归档', type: 'info' }
]

const stageStatusOptions: StatusItem[] = [
  { value: 0, label: '未开始', type: 'warning' },
  { value: 1, label: '审批中', type: 'primary' },
  { value: 2, label: '审批通过', type: 'success' },
  { value: 3, label: '审批不通过', type: 'danger' },
  { value: 4, label: '取消', type: 'info' },
  { value: 5, label: '终止', type: 'danger' }
]

const relationTypeOptions = [
  { value: 'TODO', label: '待我处理' },
  { value: 'DONE', label: '我已处理' }
]
const message = useMessage()

const loading = ref(false)
const list = ref<StageVO[]>([])
const total = ref(0)
const queryFormRef = ref<FormInstance>()
const queryParams = reactive<StagePageReqVO>({
  pageNo: 1,
  pageSize: 10,
  projectCode: undefined,
  projectName: undefined,
  projectStatus: undefined,
  stageName: undefined,
  stageStatus: undefined,
  relationType: undefined,
  latestStartTime: [],
  latestEndTime: []
})

const getList = async () => {
  loading.value = true
  try {
    const data = await StageApi.getStagePage(queryParams)
    list.value = data.list || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

const handleQuery = () => {
  queryParams.pageNo = 1
  getList()
}

const resetQuery = () => {
  queryFormRef.value?.resetFields()
  handleQuery()
}

const getStatusLabel = (options: StatusItem[], value?: number) => {
  return options.find((item) => item.value === value)?.label || '--'
}

const getStatusType = (options: StatusItem[], value?: number): TagProps['type'] => {
  return options.find((item) => item.value === value)?.type || 'info'
}

const getProjectStatusLabel = (value?: number) => getStatusLabel(projectStatusOptions, value)
const getProjectStatusType = (value?: number) => getStatusType(projectStatusOptions, value)
const getStageStatusLabel = (value?: number) => getStatusLabel(stageStatusOptions, value)
const getStageStatusType = (value?: number) => getStatusType(stageStatusOptions, value)

const formatRelationType = (relationType?: string) => {
  if (!relationType) {
    return '--'
  }
  return relationTypeOptions.find((item) => item.value === relationType)?.label || relationType
}

const { push } = useRouter()
const openDetail = async (row: StageVO) => {
  const id = Number(row.projectId ?? row.id)
  if (!id) {
    message.warning('未获取到项目 ID，无法打开详情')
    return
  }
  try {
    await StageApi.getProjectDetail(id)
    push({
      name: 'ProjectStageDetail',
      params: { id }
    })
  } catch {
    message.error('打开详情失败，请稍后重试')
  }
}

const formRef = ref()
const openForm = (type: 'create' | 'update', id?: number) => {
  formRef.value.open(type, id)
}

type ReasonMode = 'cancel' | 'archive'
const reasonDialog = reactive({
  visible: false,
  loading: false,
  mode: 'cancel' as ReasonMode,
  title: '取消',
  label: '取消原因',
  id: undefined as number | undefined,
  reason: ''
})
const reasonFormRef = ref<FormInstance>()
const reasonRules = reactive<FormRules>({
  reason: [{ required: true, message: '请输入原因', trigger: 'blur' }]
})

const openReasonDialog = (mode: ReasonMode, row: StageVO) => {
  if (!row.id) {
    return
  }
  reasonDialog.visible = true
  reasonDialog.mode = mode
  reasonDialog.title = mode === 'cancel' ? '取消' : '归档'
  reasonDialog.label = mode === 'cancel' ? '取消原因' : '归档原因'
  reasonDialog.id = row.id
  reasonDialog.reason = ''
  nextTick(() => reasonFormRef.value?.clearValidate())
}

const submitReason = async () => {
  if (!reasonFormRef.value || !reasonDialog.id) {
    return
  }
  await reasonFormRef.value.validate()
  reasonDialog.loading = true
  try {
    if (reasonDialog.mode === 'cancel') {
      await StageApi.cancelStage({ id: reasonDialog.id, reason: reasonDialog.reason })
      message.success('取消成功')
    } else {
      await StageApi.archiveStage({ id: reasonDialog.id, reason: reasonDialog.reason })
      message.success('归档成功')
    }
    reasonDialog.visible = false
    await getList()
  } finally {
    reasonDialog.loading = false
  }
}

onMounted(() => {
  getList()
})
</script>
