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
        v-for="(item, index) in groupList"
        :key="item.stageGroupCode"
        class="group-tab"
        :class="getGroupTabClass(item, index)"
        @click="handleGroupClick(item.stageGroupCode)"
      >
        <div class="group-node">
          <span class="group-icon">
            <Icon :icon="getGroupIcon(index)" />
          </span>
          <span class="group-sort">{{ getGroupSortLabel(item.sort || index + 1) }}</span>
        </div>
        <span class="group-name">{{ item.stageGroup || '--' }}</span>
      </div>
    </div>

    <div v-if="timelineLoading" class="timeline-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <el-empty v-else-if="!groupList.length || !timelineList.length" description="暂无审批流程" />

    <div v-else class="timeline-box">
      <div class="stage-flow">
        <div v-for="(stage, index) in stageDisplayList" :key="stage.stageCode" class="stage-flow-unit">
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
          <img
            v-if="index < stageDisplayList.length - 1"
            :src="stageArrowImage"
            class="stage-flow-arrow"
            alt="flow-arrow"
          />
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
import stageArrowImage from '@/assets/svgs/bpm/project/jiantou.png'
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
const groupIconList = [
  'ep:medal',
  'ep:document',
  'ep:tickets',
  'ep:user',
  'ep:folder-checked',
  'ep:checked'
]

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

const getGroupIcon = (index: number) => {
  return groupIconList[index % groupIconList.length]
}

const getGroupTabClass = (item: StageGroupVO, index: number) => {
  const normalized = normalizeStatus(item.stageStatus)
  return {
    active: selectedGroupCode.value === item.stageGroupCode,
    'is-last': index === groupList.value.length - 1,
    'is-danger': normalized === STAGE_STATUS.REJECTED || normalized === STAGE_STATUS.TERMINATED,
    'is-muted': normalized === STAGE_STATUS.CANCELED
  }
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

const isCompletedVersion = (version: StageVersionVO) => {
  return normalizeStatus(version.status) === STAGE_STATUS.APPROVED
}

const openProcessDetail = async (version: StageVersionVO) => {
  const currentProjectId = detail.value.id ?? projectId.value
  const query = {
    processDefinitionId: version?.processDefinitionId ? String(version.processDefinitionId) : undefined,
    processDefinitionKey: version?.processDefinitionKey ? String(version.processDefinitionKey) : undefined,
    processInstanceId: version?.processInstanceId ? String(version.processInstanceId) : undefined,
    projectId: currentProjectId ? String(currentProjectId) : undefined
  }
  if (isCompletedVersion(version) && query.processInstanceId) {
    await push({
      name: 'ProjectProcessInstanceDetail',
      query: {
        id: query.processInstanceId,
        projectId: query.projectId
      }
    })
    return
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
  align-items: flex-start;
  gap: 22px;
  margin-bottom: 16px;
  padding: 8px 2px 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: #9fb0c5 #edf2f8;
}

.group-tabs::-webkit-scrollbar {
  height: 8px;
}

.group-tabs::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.group-tabs::-webkit-scrollbar-track {
  background: #edf2f8;
  border-radius: 999px;
}

.group-tabs::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, #c6d3e2 0%, #9fb0c5 100%);
  border-radius: 999px;
}

.group-tabs:hover::-webkit-scrollbar-thumb {
  background: linear-gradient(90deg, #9fb0c5 0%, #7f95af 100%);
}

.group-tab {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 120px;
  padding-right: 14px;
  cursor: pointer;
  user-select: none;
}

.group-tab::after {
  position: absolute;
  top: 14px;
  left: calc(100% - 10px);
  width: 24px;
  content: '';
  border-top: 1px solid #d9d9d9;
}

.group-tab.is-last::after {
  display: none;
}

.group-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #409eff;
}

.group-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 2px 6px rgb(64 158 255 / 30%);
}

.group-sort {
  color: inherit;
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.6px;
}

.group-name {
  margin-top: -2px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
  padding-bottom: 3px;
  border-bottom: 2px solid transparent;
}

.group-tab.is-danger .group-node {
  color: #f56c6c;
}

.group-tab.is-danger .group-icon {
  background: #f56c6c;
  box-shadow: 0 2px 6px rgb(245 108 108 / 28%);
}

.group-tab.is-danger .group-name {
  color: #f56c6c;
}

.group-tab.is-muted .group-node {
  color: #9ca3af;
}

.group-tab.is-muted .group-icon {
  background: #9ca3af;
  box-shadow: none;
}

.group-tab.is-muted .group-name {
  color: #9ca3af;
}

.group-tab.active .group-node {
  color: #f59e0b;
}

.group-tab.active .group-icon {
  background: #f59e0b;
  box-shadow: 0 2px 6px rgb(245 158 11 / 35%);
}

.group-tab.active .group-name {
  color: #f59e0b;
  border-bottom-color: #f59e0b;
}

@media (max-width: 900px) {
  .group-tabs {
    gap: 16px;
  }

  .group-tab {
    min-width: 108px;
  }

  .group-sort {
    font-size: 26px;
  }

  .group-name {
    font-size: 14px;
  }

  .stage-flow {
    row-gap: 8px;
  }

  .stage-flow-unit {
    min-height: auto;
  }

  .stage-flow-arrow {
    width: 14px;
    height: 14px;
  }

  .version-card {
    width: 230px;
    min-height: 142px;
    padding: 10px 12px;
  }
}

.timeline-loading {
  padding: 12px 0;
}

.timeline-box {
  padding-top: 2px;
}

.stage-flow {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  column-gap: 8px;
  row-gap: 10px;
}

.stage-flow-unit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 160px;
}

.stage-flow-arrow {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex: 0 0 auto;
  opacity: 0.95;
}

.version-card {
  width: 260px;
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
