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

    <el-empty v-else-if="!groupList.length || !timelineList.length" description="暂无审批流程" />

    <div v-else class="timeline-box">
      <div v-for="stage in stageDisplayList" :key="stage.stageCode" class="stage-block">
        <div class="stage-title">{{ stage.stageName || stage.stageCode }}</div>
        <div class="stage-version-row">
          <div
            class="version-card"
            :class="getVersionCardClass(stage.latestVersion?.status)"
            @click="handleCardClick(stage.latestVersion)"
            @dblclick="handleCardDblClick(stage)"
          >
            <div class="version-header">
              <div class="version-title">{{ buildVersionTitle(stage.latestVersion) }}</div>
              <el-tag
                v-if="stage.hasHistory"
                size="small"
                class="version-top-tag"
                type="info"
                effect="plain"
              >
                V{{ stage.latestVersion?.versionNo || stage.sortedVersions.length }}
              </el-tag>
            </div>
            <div class="version-line">
              发起人员：{{ stage.latestVersion?.starterUserName || stage.latestVersion?.starterUserId || '--' }}
            </div>
            <div class="version-line">发起时间：{{ formatTime(stage.latestVersion?.startTime) }}</div>
            <div class="version-line">{{ buildEndLine(stage.latestVersion) }}</div>
            <button
              v-if="stage.hasHistory"
              type="button"
              class="history-trigger"
              @click.stop="openHistoryDrawer(stage)"
            >
              <Icon icon="ep:refresh-right" />
              查看历史重发记录 (共{{ stage.sortedVersions.length }}次)
            </button>
          </div>
        </div>
      </div>
    </div>
  </ContentWrap>

  <el-drawer
    v-model="historyDrawerVisible"
    direction="rtl"
    size="500px"
    :title="historyDrawerTitle"
    append-to-body
    destroy-on-close
  >
    <el-empty v-if="!historyDrawerVersions.length" description="暂无历史版本" />
    <div v-else class="history-drawer-body">
      <el-timeline>
        <el-timeline-item
          v-for="(version, index) in historyDrawerVersions"
          :key="version.id || `${version.stageCode}-${version.versionNo || index}`"
          :color="getHistoryDotColor(index, version.status)"
        >
          <div
            class="history-item"
            :class="{
              latest: index === 0,
              archived: index > 0,
              'is-voided': isHistoryVoided(index, version.status),
              'is-rejected': isHistoryRejected(index, version.status)
            }"
          >
            <div class="history-item-head">
              <div class="history-item-title">
                Version V{{ version.versionNo || historyDrawerVersions.length - index }}
                <span v-if="index === 0">（当前）</span>
              </div>
              <el-tag
                :type="getHistoryTagType(index, version.status)"
                effect="plain"
                :class="['history-item-status', getHistoryStatusClass(index, version.status)]"
              >
                {{ getHistoryStatusText(index, version.status) }}
              </el-tag>
            </div>
            <div class="history-item-line">发起人：{{ version.starterUserName || version.starterUserId || '--' }}</div>
            <div class="history-item-line">发起时间：{{ formatTime(version.startTime) }}</div>
            <div v-if="normalizeStatus(version.status) === STAGE_STATUS.APPROVING" class="history-item-line">
              当前审批人：{{ version.currentAssigneeUserName || '--' }}
            </div>
            <div v-else class="history-item-line">结束时间：{{ version.endTime ? formatTime(version.endTime) : '--' }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
  </el-drawer>
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

type StageCardVO = StageTimelineVO & {
  sortedVersions: StageVersionVO[]
  latestVersion?: StageVersionVO
  hasHistory: boolean
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
const historyDrawerVisible = ref(false)
const historyDrawerStageName = ref('')
const historyDrawerVersions = ref<StageVersionVO[]>([])
let cardClickTimer: ReturnType<typeof setTimeout> | undefined

const projectId = computed(() => {
  const id = Number(route.params.id || route.query.id)
  return Number.isNaN(id) ? 0 : id
})

const historyDrawerTitle = computed(() => {
  const title = historyDrawerStageName.value || '流程阶段'
  return `${title} - 完整流转记录`
})

const sortVersionsDesc = (versions?: StageVersionVO[]) => {
  if (!versions?.length) {
    return []
  }
  return [...versions].sort((a, b) => (b.versionNo || 0) - (a.versionNo || 0))
}

const stageDisplayList = computed<StageCardVO[]>(() => {
  return timelineList.value.map((stage) => {
    const sortedVersions = sortVersionsDesc(stage.versions)
    return {
      ...stage,
      sortedVersions,
      latestVersion: sortedVersions[0],
      hasHistory: sortedVersions.length > 1
    }
  })
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
const getStageStatusType = (value?: number | string | null) => getStatusType(stageStatusOptions, value)

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

const buildVersionTitle = (version?: StageVersionVO) => {
  if (!version) {
    return '流程未发起'
  }
  const statusLabel = getStageStatusLabel(version.status)
  const versionLabel = version.versionNo ? ` (V${version.versionNo})` : ''
  return `${version.stageName || '流程'}${statusLabel !== '--' ? ` - ${statusLabel}` : ''}${versionLabel}`
}

const buildEndLine = (version?: StageVersionVO) => {
  if (!version) {
    return '结束时间：-'
  }
  if (version.endTime) {
    return `结束时间：${formatTime(version.endTime)}`
  }
  if (normalizeStatus(version.status) === STAGE_STATUS.APPROVING) {
    return `当前审批：${version.currentAssigneeUserName || '--'}`
  }
  return '结束时间：-'
}

const getVersionCardClass = (status?: number | string | null) => {
  const normalized = normalizeStatus(status)
  if (normalized === STAGE_STATUS.APPROVING) {
    return 'is-running'
  }
  if (normalized === STAGE_STATUS.APPROVED) {
    return 'is-pass'
  }
  if (normalized === STAGE_STATUS.CANCELED) {
    return 'is-cancel'
  }
  if (normalized === STAGE_STATUS.REJECTED || normalized === STAGE_STATUS.TERMINATED) {
    return 'is-reject'
  }
  return 'is-default'
}

const getHistoryDotColor = (index: number, status?: number | string | null) => {
  const normalized = normalizeStatus(status)
  if (index > 0) {
    return '#c0c4cc'
  }
  if (normalized === STAGE_STATUS.APPROVING) {
    return '#409eff'
  }
  if (normalized === STAGE_STATUS.APPROVED) {
    return '#67c23a'
  }
  if (normalized === STAGE_STATUS.REJECTED || normalized === STAGE_STATUS.TERMINATED) {
    return '#f56c6c'
  }
  if (normalized === STAGE_STATUS.CANCELED) {
    return '#909399'
  }
  return '#e6a23c'
}

const getHistoryStatusText = (index: number, status?: number | string | null) => {
  const normalized = normalizeStatus(status)
  if (index > 0) {
    if (normalized === STAGE_STATUS.REJECTED) {
      return '已驳回'
    }
    if (normalized === STAGE_STATUS.CANCELED) {
      return '已作废'
    }
    if (normalized === STAGE_STATUS.TERMINATED) {
      return '已终止'
    }
  }
  return getStageStatusLabel(status)
}

const getHistoryTagType = (index: number, status?: number | string | null): TagProps['type'] => {
  const normalized = normalizeStatus(status)
  if (index > 0) {
    if (normalized === STAGE_STATUS.REJECTED || normalized === STAGE_STATUS.TERMINATED) {
      return 'danger'
    }
    if (normalized === STAGE_STATUS.APPROVED) {
      return 'success'
    }
    if (normalized === STAGE_STATUS.CANCELED) {
      return 'info'
    }
  }
  return getStageStatusType(status)
}

const isHistoryRejected = (index: number, status?: number | string | null) => {
  return index > 0 && normalizeStatus(status) === STAGE_STATUS.REJECTED
}

const isHistoryVoided = (index: number, status?: number | string | null) => {
  const normalized = normalizeStatus(status)
  return index > 0 && (normalized === STAGE_STATUS.CANCELED || normalized === STAGE_STATUS.TERMINATED)
}

const getHistoryStatusClass = (index: number, status?: number | string | null) => {
  if (isHistoryRejected(index, status)) {
    return 'is-stamp-red'
  }
  if (isHistoryVoided(index, status)) {
    return 'is-muted'
  }
  return ''
}

const openHistoryDrawer = (stage: StageCardVO) => {
  historyDrawerStageName.value = stage.stageName || stage.stageCode || '流程阶段'
  historyDrawerVersions.value = [...stage.sortedVersions]
  historyDrawerVisible.value = true
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

const handleCardClick = (version?: StageVersionVO) => {
  if (!version) {
    return
  }
  if (cardClickTimer) {
    clearTimeout(cardClickTimer)
  }
  cardClickTimer = setTimeout(() => {
    openProcessDetail(version)
    cardClickTimer = undefined
  }, 220)
}

const handleCardDblClick = (stage: StageCardVO) => {
  if (cardClickTimer) {
    clearTimeout(cardClickTimer)
    cardClickTimer = undefined
  }
  openHistoryDrawer(stage)
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

onBeforeUnmount(() => {
  if (cardClickTimer) {
    clearTimeout(cardClickTimer)
    cardClickTimer = undefined
  }
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
  width: 280px;
  min-height: 156px;
  border-radius: 10px;
  border: 1px solid #f8d4a8;
  background: #fff;
  color: #d46b08;
  padding: 12px 14px;
  transition: all 0.2s;
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(0 0 0 / 4%);
}

.version-card:hover {
  border-color: #60a5fa;
  box-shadow: 0 8px 18px rgb(9 30 66 / 12%);
}

.version-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.version-top-tag {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #2563eb;
}

.version-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.version-line {
  margin-top: 5px;
  font-size: 14px;
}

.history-trigger {
  margin-top: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
}

.history-trigger:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.version-card.is-running {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.version-card.is-running .version-top-tag {
  border-color: rgb(255 255 255 / 60%);
  background: rgb(255 255 255 / 16%);
  color: #fff;
}

.version-card.is-running .history-trigger {
  color: #e6f1ff;
}

.version-card.is-running .history-trigger:hover {
  color: #fff;
}

.version-card.is-pass {
  background: #f0f9eb;
  border-color: #67c23a;
  color: #2f8f2f;
}

.version-card.is-pass .history-trigger {
  color: #2f8f2f;
}

.version-card.is-reject {
  background: #fff1f0;
  border-color: #f56c6c;
  color: #cf1322;
}

.version-card.is-reject .history-trigger {
  color: #cf1322;
}

.version-card.is-cancel {
  background: #f5f7fa;
  border-color: #c0c4cc;
  color: #909399;
}

.version-card.is-cancel .history-trigger {
  color: #6b7280;
}

.history-drawer-body {
  padding-right: 4px;
}

.history-item {
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
  padding: 10px 12px;
}

.history-item.latest {
  border-color: #93c5fd;
  background: #eff6ff;
}

.history-item.archived {
  border-color: #e5e7eb;
  background: #f8fafc;
}

.history-item.is-rejected {
  border-color: #fecaca;
  background: #fff7f7;
}

.history-item.is-voided {
  border-color: #d1d5db;
  background: #f5f7fa;
}

.history-item.is-voided .history-item-title,
.history-item.is-voided .history-item-line {
  color: #9ca3af;
  text-decoration: line-through;
}

.history-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.history-item-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2937;
}

.history-item-line {
  margin-top: 4px;
  font-size: 13px;
  color: #4b5563;
}

:deep(.history-item-status.is-stamp-red.el-tag--plain) {
  border-color: #ef4444;
  color: #dc2626;
  background: #fff1f0;
  font-weight: 700;
}

:deep(.history-item-status.is-muted.el-tag--plain) {
  border-color: #cbd5e1;
  color: #64748b;
  background: #f8fafc;
}
</style>
