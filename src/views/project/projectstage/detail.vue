<template>
  <ContentWrap v-loading="pageLoading">
    <div class="project-header">
      <div class="project-title-row">
        <span class="project-title">{{ detail.projectName || '--' }}({{ detail.projectCode || '--' }})</span>
        <el-tag :type="getProjectStatusType(detail.projectStatus)" effect="plain" class="ml-10px">
          {{ getProjectStatusLabel(detail.projectStatus) }}
        </el-tag>
      </div>
      <div class="project-line">项目报价：{{ projectQuoteText }}</div>
      <div class="project-line">项目概述：{{ detail.remark || '--' }}</div>
      <div v-if="detail.archiveReason" class="project-line">归档原因：{{ detail.archiveReason }}</div>
    </div>

    <div v-if="groupList.length" class="group-tabs">
      <div
        v-for="item in groupList"
        :key="item.stageGroupCode"
        class="group-tab"
        :class="{ active: selectedGroupCode === item.stageGroupCode }"
        @click="handleGroupClick(item.stageGroupCode)"
      >
        <span class="group-sort">{{ getGroupSortLabel(item.sort) }}</span>
        <span class="group-name">{{ item.stageGroup || '--' }}</span>
      </div>
    </div>

    <div v-if="timelineLoading" class="timeline-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <el-empty v-else-if="!groupList.length || !timelineList.length" description="暂无审批流" />

    <div v-else class="timeline-box">
      <div v-for="stage in timelineList" :key="stage.stageCode" class="stage-block">
        <div class="stage-title">{{ stage.stageName || stage.stageCode }}</div>
        <div class="stage-version-row">
          <template v-for="(version, index) in stage.versions" :key="version.id || `${stage.stageCode}-${index}`">
            <div class="version-card" :class="getVersionCardClass(version.status)" @click="openProcessDetail(version)">
              <div class="version-title">{{ buildVersionTitle(version) }}</div>
              <div class="version-line">发起人员：{{ version.starterUserName || version.starterUserId || '--' }}</div>
              <div class="version-line">发起时间：{{ formatTime(version.startTime) }}</div>
              <div class="version-line">{{ buildEndLine(version) }}</div>
            </div>
            <div v-if="index < (stage.versions?.length || 0) - 1" class="version-arrow">
              <Icon icon="ep:arrow-right-bold" />
            </div>
          </template>
        </div>
      </div>
    </div>
  </ContentWrap>
</template>

<script setup lang="ts">
import { formatDate } from '@/utils/formatTime'
import { PROJECT_STATUS_OPTIONS, STAGE_STATUS, STAGE_STATUS_OPTIONS } from '@/utils/constants'
import {
  StageApi,
  type ProjectDetailVO,
  type StageGroupVO,
  type StageTimelineVO,
  type StageVersionVO
} from '@/api/project/projectstage'
import type { TagProps } from 'element-plus'

defineOptions({ name: 'ProjectStageDetail' })

type StatusItem = {
  value: number
  label: string
  type: TagProps['type']
}

const projectStatusOptions: StatusItem[] = [...PROJECT_STATUS_OPTIONS]
const stageStatusOptions: StatusItem[] = [...STAGE_STATUS_OPTIONS]

const route = useRoute()
const { push } = useRouter()
const message = useMessage()

const pageLoading = ref(false)
const timelineLoading = ref(false)
const detail = ref<ProjectDetailVO>({})
const groupList = ref<StageGroupVO[]>([])
const timelineList = ref<StageTimelineVO[]>([])
const selectedGroupCode = ref('')

const projectId = computed(() => {
  const id = Number(route.params.id || route.query.id)
  return Number.isNaN(id) ? 0 : id
})

const formatQuote = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return '--'
  }
  const num = Number(value)
  if (Number.isNaN(num)) {
    return `${value}元`
  }
  return `${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}元`
}

const projectQuoteText = computed(() => {
  return formatQuote(detail.value.projectQuote ?? detail.value.projectPrice)
})

const normalizeStatus = (value?: number | string | null) => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  const normalized = Number(value)
  return Number.isNaN(normalized) ? undefined : normalized
}

const getStatusLabel = (options: StatusItem[], value?: number | string | null) => {
  const normalized = normalizeStatus(value)
  return options.find((item) => item.value === normalized)?.label || '--'
}

const getStatusType = (options: StatusItem[], value?: number | string | null): TagProps['type'] => {
  const normalized = normalizeStatus(value)
  return options.find((item) => item.value === normalized)?.type || 'info'
}

const getProjectStatusLabel = (value?: number | string | null) =>
  getStatusLabel(projectStatusOptions, value)
const getProjectStatusType = (value?: number | string | null) =>
  getStatusType(projectStatusOptions, value)
const getStageStatusLabel = (value?: number | string | null) => getStatusLabel(stageStatusOptions, value)

const getGroupSortLabel = (sort?: number) => {
  if (!sort) {
    return '--'
  }
  return String(sort).padStart(2, '0')
}

const formatTime = (value?: string | null) => {
  if (!value) {
    return '--'
  }
  return formatDate(value as unknown as Date)
}

const buildVersionTitle = (version: StageVersionVO) => {
  const statusLabel = getStageStatusLabel(version.status)
  const versionLabel = version.versionNo && version.versionNo > 1 ? ` (V${version.versionNo})` : ''
  return `${version.stageName || '流程'}${statusLabel !== '--' ? statusLabel : ''}${versionLabel}`
}

const buildEndLine = (version: StageVersionVO) => {
  if (version.endTime) {
    return `结束时间：${formatTime(version.endTime)}`
  }
  if (normalizeStatus(version.status) === STAGE_STATUS.APPROVING) {
    return `当前审批：${version.currentAssigneeUserName || '--'}`
  }
  return '结束时间：--'
}

const getVersionCardClass = (status?: number | string | null) => {
  const normalized = normalizeStatus(status)
  if (normalized === STAGE_STATUS.APPROVING) {
    return 'is-running'
  }
  if (normalized === STAGE_STATUS.REJECTED) {
    return 'is-reject'
  }
  if (normalized === STAGE_STATUS.APPROVED) {
    return 'is-pass'
  }
  return ''
}

const openProcessDetail = async (version: StageVersionVO) => {
  const currentProjectId = detail.value.id ?? projectId.value
  const query = {
    processDefinitionId: version?.processDefinitionId ? String(version.processDefinitionId) : undefined,
    processDefinitionKey: version?.processDefinitionKey ? String(version.processDefinitionKey) : undefined,
    processInstanceId: version?.processInstanceId ? String(version.processInstanceId) : undefined,
    projectId: currentProjectId ? String(currentProjectId) : undefined
  }
  if (!query.processDefinitionId && !query.processDefinitionKey && !query.processInstanceId) {
    return
  }
  await push({ name: 'BpmProcessInstanceDirectCreate', query })
}

const fetchProjectDetail = async () => {
  detail.value = await StageApi.getProjectDetail(projectId.value)
}

const getDefaultGroupCode = (groups: StageGroupVO[]) => {
  const running = groups.find(
    (item) => normalizeStatus(item.stageStatus) === STAGE_STATUS.APPROVING && item.stageGroupCode
  )
  if (running?.stageGroupCode) {
    return running.stageGroupCode
  }
  const sorted = [...groups].sort((a, b) => (a.sort || 9999) - (b.sort || 9999))
  return sorted[0]?.stageGroupCode || ''
}

const fetchGroups = async () => {
  groupList.value = await StageApi.getProjectGroupList(projectId.value)
  selectedGroupCode.value = getDefaultGroupCode(groupList.value)
}

const fetchTimeline = async () => {
  if (!selectedGroupCode.value) {
    timelineList.value = []
    return
  }
  timelineLoading.value = true
  try {
    timelineList.value = await StageApi.getStageTimeline(projectId.value, selectedGroupCode.value)
  } finally {
    timelineLoading.value = false
  }
}

const handleGroupClick = (groupCode?: string) => {
  if (!groupCode || selectedGroupCode.value === groupCode) {
    return
  }
  selectedGroupCode.value = groupCode
  fetchTimeline()
}

const initData = async () => {
  if (!projectId.value) {
    message.error('缺少项目 ID 参数')
    return
  }
  pageLoading.value = true
  try {
    await fetchProjectDetail()
    await fetchGroups()
    await fetchTimeline()
  } finally {
    pageLoading.value = false
  }
}

onMounted(() => {
  initData()
})
</script>

<style scoped lang="scss">
.project-header {
  border-bottom: 1px solid var(--el-border-color-light);
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.project-title-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.project-title {
  font-size: 28px;
  line-height: 40px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.project-line {
  margin-top: 4px;
  color: var(--el-text-color-regular);
}

.group-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.group-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  font-size: 16px;
  cursor: pointer;
  padding-bottom: 6px;
}

.group-tab.active {
  color: var(--el-color-primary);
  font-weight: 700;
}

.group-tab.active::after {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  content: '';
  border-bottom: 2px solid var(--el-color-primary);
}

.group-sort {
  color: inherit;
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
}

.group-name {
  color: inherit;
  font-size: 18px;
  font-weight: 600;
}

.timeline-loading {
  padding: 12px 0;
}

.timeline-box {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stage-version-row {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 10px;
}

.version-card {
  width: 240px;
  min-height: 126px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  background: #f5f7fa;
  color: var(--el-text-color-regular);
  padding: 10px 12px;
  transition: all 0.2s;
}

.version-card:hover {
  border-color: var(--el-color-primary);
}

.version-card.is-running {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.version-card.is-pass {
  border-color: #67c23a;
}

.version-card.is-reject {
  border-color: #f56c6c;
}

.version-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.version-line {
  margin-top: 4px;
  font-size: 14px;
}

.version-arrow {
  display: inline-flex;
  align-items: center;
  color: var(--el-color-primary);
  font-size: 18px;
}
</style>
